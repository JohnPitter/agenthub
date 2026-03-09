import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkflowNode, WorkflowEdge } from "@agenthub/shared";

// Queue of mock results for sequential db queries
let queryResults: unknown[] = [];

// Mock all external dependencies before imports
vi.mock("@agenthub/database", () => {
  // Create a thenable chain that resolves to the next queued result
  const createChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.from = vi.fn(self);
    chain.where = vi.fn(self);
    chain.insert = vi.fn(self);
    chain.values = vi.fn(() => Promise.resolve(undefined));
    // Make the chain thenable so .then(r => r[0]) works
    chain.then = vi.fn((resolve: (value: unknown) => unknown) => {
      const result = queryResults.shift();
      return Promise.resolve(result).then(resolve);
    });
    return chain;
  };

  const mockDb = createChain();

  return {
    db: mockDb,
    schema: {
      workflows: { id: "id" },
      tasks: { id: "id", projectId: "projectId" },
      agents: { id: "id", isActive: "isActive", role: "role" },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => val),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "subtask-123"),
}));

vi.mock("../agents/agent-manager.js", () => ({
  agentManager: {
    assignTask: vi.fn().mockResolvedValue(undefined),
    autoAssignTask: vi.fn().mockResolvedValue(undefined),
    isAgentBusy: vi.fn(() => false),
  },
}));

vi.mock("../tasks/task-lifecycle.js", () => ({
  transitionTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../realtime/event-bus.js", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

// Import after mocks
import { workflowExecutor } from "../workflows/workflow-executor.js";
import { agentManager } from "../agents/agent-manager.js";
import { transitionTask } from "../tasks/task-lifecycle.js";
import { eventBus } from "../realtime/event-bus.js";

function makeNode(
  id: string,
  type: WorkflowNode["type"] = "agent",
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return { id, type, label: `Node ${id}`, position: { x: 0, y: 0 }, ...overrides };
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target };
}

describe("WorkflowExecutorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults = [];
  });

  describe("executeWorkflow()", () => {
    it("returns false when workflow is not found", async () => {
      // .then(r => r[0]) on empty array → undefined
      queryResults.push([]);

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-missing");
      expect(result).toBe(false);
    });

    it("returns false when workflow validation fails (empty nodes)", async () => {
      queryResults.push([{
        id: "wf-1",
        name: "Bad Workflow",
        nodes: "[]",
        edges: "[]",
      }]);

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-1");
      expect(result).toBe(false);
    });

    it("returns false when task is not found", async () => {
      const nodes = [makeNode("A")];
      // workflow found, task not found
      queryResults.push([{
        id: "wf-1",
        name: "Test Workflow",
        nodes: JSON.stringify(nodes),
        edges: "[]",
      }]);
      queryResults.push([]); // task not found

      const result = await workflowExecutor.executeWorkflow("task-missing", "wf-1");
      expect(result).toBe(false);
    });

    it("starts workflow and executes entry agent node", async () => {
      const nodes = [makeNode("A", "agent", { agentRole: "developer" })];
      const mockWorkflow = {
        id: "wf-1",
        name: "Test Workflow",
        nodes: JSON.stringify(nodes),
        edges: "[]",
      };
      const mockTask = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        description: "desc",
        priority: "medium",
        category: null,
      };

      // Calls: workflow lookup, task lookup, main task re-fetch, agent role lookup
      queryResults.push([mockWorkflow]);
      queryResults.push([mockTask]);
      queryResults.push([mockTask]);
      queryResults.push([{ id: "agent-1", isActive: true, role: "developer" }]);

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-1");
      expect(result).toBe(true);

      // Should transition parent task to in_progress
      expect(transitionTask).toHaveBeenCalledWith(
        "task-1",
        "in_progress",
        undefined,
        expect.stringContaining("Test Workflow"),
      );

      // Should emit workflow:phase event
      expect(eventBus.emit).toHaveBeenCalledWith(
        "workflow:phase",
        expect.objectContaining({ taskId: "task-1", projectId: "proj-1" }),
      );

      // Should assign to agent
      expect(agentManager.assignTask).toHaveBeenCalledWith("subtask-123", "agent-1");
    });

    it("auto-assigns when no matching agent found", async () => {
      const nodes = [makeNode("A", "agent", { agentRole: "designer" })];
      const mockWorkflow = {
        id: "wf-1",
        name: "WF",
        nodes: JSON.stringify(nodes),
        edges: "[]",
      };
      const mockTask = {
        id: "task-1",
        projectId: "proj-1",
        title: "T",
        priority: "medium",
        category: null,
      };

      queryResults.push([mockWorkflow]);
      queryResults.push([mockTask]);
      queryResults.push([mockTask]);
      queryResults.push([]); // no agents match role

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-1");
      expect(result).toBe(true);
      expect(agentManager.autoAssignTask).toHaveBeenCalledWith("subtask-123");
    });

    it("immediately completes parallel/merge structural nodes", async () => {
      // parallel -> A (agent)
      const nodes = [
        makeNode("par", "parallel"),
        makeNode("A", "agent", { agentRole: "developer" }),
      ];
      const edges = [makeEdge("par", "A")];
      const mockWorkflow = {
        id: "wf-1",
        name: "WF",
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
      };
      const mockTask = {
        id: "task-1",
        projectId: "proj-1",
        title: "T",
        priority: "medium",
        category: null,
      };

      queryResults.push([mockWorkflow]);
      queryResults.push([mockTask]);
      queryResults.push([mockTask]); // re-fetch for agent node
      queryResults.push([{ id: "agent-1", isActive: true, role: "developer" }]);

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-1");
      expect(result).toBe(true);
      // Parallel node should auto-complete and advance to A
      expect(agentManager.assignTask).toHaveBeenCalled();
    });
  });

  describe("isRunningWorkflow()", () => {
    it("returns false for unknown task", () => {
      expect(workflowExecutor.isRunningWorkflow("unknown")).toBe(false);
    });
  });

  describe("isWorkflowSubtask()", () => {
    it("returns false for unknown subtask", () => {
      expect(workflowExecutor.isWorkflowSubtask("unknown")).toBe(false);
    });
  });

  describe("getExecutionState()", () => {
    it("returns null for unknown task", () => {
      expect(workflowExecutor.getExecutionState("unknown")).toBeNull();
    });
  });

  describe("onSubtaskCompleted()", () => {
    it("returns false for unknown subtask", async () => {
      const result = await workflowExecutor.onSubtaskCompleted("unknown-subtask");
      expect(result).toBe(false);
    });
  });
});
