import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkflowNode, WorkflowEdge } from "@agenthub/shared";

// Mock all external dependencies before imports
vi.mock("@agenthub/database", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    all: vi.fn(),
  };
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
import { db } from "@agenthub/database";
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
  });

  describe("executeWorkflow()", () => {
    it("returns false when workflow is not found", async () => {
      vi.mocked(db.get).mockResolvedValueOnce(undefined);

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-missing");
      expect(result).toBe(false);
    });

    it("returns false when workflow validation fails (empty nodes)", async () => {
      vi.mocked(db.get).mockResolvedValueOnce({
        id: "wf-1",
        name: "Bad Workflow",
        nodes: "[]",
        edges: "[]",
      });

      const result = await workflowExecutor.executeWorkflow("task-1", "wf-1");
      expect(result).toBe(false);
    });

    it("returns false when task is not found", async () => {
      const nodes = [makeNode("A")];
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: "wf-1",
          name: "Test Workflow",
          nodes: JSON.stringify(nodes),
          edges: "[]",
        })
        .mockResolvedValueOnce(undefined); // task not found

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

      // Calls: workflow lookup, task lookup, main task for subtask title, agent role lookup
      vi.mocked(db.get)
        .mockResolvedValueOnce(mockWorkflow)   // workflow
        .mockResolvedValueOnce(mockTask)        // task
        .mockResolvedValueOnce(mockTask);       // main task re-fetch in executeNode

      vi.mocked(db.all).mockResolvedValueOnce([
        { id: "agent-1", isActive: true, role: "developer" },
      ]);

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

      vi.mocked(db.get)
        .mockResolvedValueOnce(mockWorkflow)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTask);

      // No agents match role
      vi.mocked(db.all).mockResolvedValueOnce([]);

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

      vi.mocked(db.get)
        .mockResolvedValueOnce(mockWorkflow)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTask); // re-fetch for agent node

      vi.mocked(db.all).mockResolvedValueOnce([
        { id: "agent-1", isActive: true, role: "developer" },
      ]);

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
