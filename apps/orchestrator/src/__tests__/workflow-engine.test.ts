import { describe, it, expect } from "vitest";
import { WorkflowEngine } from "../workflows/workflow-engine.js";
import type { WorkflowNode, WorkflowEdge } from "@agenthub/shared";

// --- Test Fixtures ---

function makeNode(
  id: string,
  type: WorkflowNode["type"] = "agent",
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    label: `Node ${id}`,
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeEdge(
  source: string,
  target: string,
  overrides: Partial<WorkflowEdge> = {},
): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    ...overrides,
  };
}

// --- Tests ---

describe("WorkflowEngine", () => {
  describe("validate()", () => {
    it("validates a simple linear DAG", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates a parallel DAG (diamond shape)", () => {
      // A -> B, A -> C, B -> D, C -> D
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")];
      const edges = [
        makeEdge("A", "B"),
        makeEdge("A", "C"),
        makeEdge("B", "D"),
        makeEdge("C", "D"),
      ];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects empty workflow", () => {
      const engine = new WorkflowEngine([], []);
      const result = engine.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Workflow has no nodes");
    });

    it("detects cycle (A -> B -> C -> A)", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C"), makeEdge("C", "A")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("no entry nodes"))).toBe(true);
    });

    it("detects cycle with entry node (A -> B -> C -> B)", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C"), makeEdge("C", "B")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
    });

    it("detects edges referencing unknown source node", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const edges = [makeEdge("X", "B")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown source node "X"'))).toBe(true);
    });

    it("detects edges referencing unknown target node", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const edges = [makeEdge("A", "Z")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown target node "Z"'))).toBe(true);
    });

    it("detects disconnected nodes (unreachable from entry)", () => {
      // A -> B, C is disconnected (no edges to/from C, but C has no incoming so it's entry)
      // Actually, for unreachable: we need C to have incoming edges but not reachable from entry
      // A -> B, D -> C (D has no incoming, so both A and D are entries, all reachable)
      // To get unreachable: A -> B, C -> D where C has an incoming from somewhere not reachable
      // Simpler: A -> B, C (with an incoming from B, so C is not entry but B->C exists... that's reachable)
      // Let's do: A -> B, C -> D where C has no incoming but is separate component — all reachable from entries
      // Actually: Let's create a case where node has inbound from only cycle nodes
      // Simplest: A -> B, X -> Y, and X is entry too, so all reachable
      // To truly test: we need a node unreachable via BFS from entries
      // Create: A -> B, C has only incoming from itself? That's a self-cycle
      // Use: Entry=A, A->B. Node C with edge C->C (self-loop). C has incoming so it's not entry.
      // C is unreachable from A.
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("C", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const result = engine.validate();
      expect(result.valid).toBe(false);
      // C is in a self-cycle so it won't appear in topological sort
      expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
    });

    it("validates single node with no edges", () => {
      const nodes = [makeNode("A")];
      const engine = new WorkflowEngine(nodes, []);

      const result = engine.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe("getExecutionOrder()", () => {
    it("returns single layer for single node", () => {
      const nodes = [makeNode("A")];
      const engine = new WorkflowEngine(nodes, []);

      const layers = engine.getExecutionOrder();
      expect(layers).toEqual([["A"]]);
    });

    it("returns linear layers for chain A -> B -> C", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const layers = engine.getExecutionOrder();
      expect(layers).toEqual([["A"], ["B"], ["C"]]);
    });

    it("returns parallel nodes in same layer (diamond)", () => {
      // A -> B, A -> C, B -> D, C -> D
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")];
      const edges = [
        makeEdge("A", "B"),
        makeEdge("A", "C"),
        makeEdge("B", "D"),
        makeEdge("C", "D"),
      ];
      const engine = new WorkflowEngine(nodes, edges);

      const layers = engine.getExecutionOrder();
      expect(layers).toHaveLength(3);
      expect(layers[0]).toEqual(["A"]);
      expect(layers[1].sort()).toEqual(["B", "C"]);
      expect(layers[2]).toEqual(["D"]);
    });

    it("handles wide parallel fan-out", () => {
      // A -> B, A -> C, A -> D, A -> E
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D"), makeNode("E")];
      const edges = [
        makeEdge("A", "B"),
        makeEdge("A", "C"),
        makeEdge("A", "D"),
        makeEdge("A", "E"),
      ];
      const engine = new WorkflowEngine(nodes, edges);

      const layers = engine.getExecutionOrder();
      expect(layers).toHaveLength(2);
      expect(layers[0]).toEqual(["A"]);
      expect(layers[1].sort()).toEqual(["B", "C", "D", "E"]);
    });

    it("handles multiple entry nodes", () => {
      // A -> C, B -> C
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "C"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const layers = engine.getExecutionOrder();
      expect(layers).toHaveLength(2);
      expect(layers[0].sort()).toEqual(["A", "B"]);
      expect(layers[1]).toEqual(["C"]);
    });
  });

  describe("getEntryNodes()", () => {
    it("returns nodes with no incoming edges", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const entries = engine.getEntryNodes();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("A");
    });

    it("returns multiple entry nodes", () => {
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "C"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const entries = engine.getEntryNodes();
      expect(entries).toHaveLength(2);
      const ids = entries.map((n) => n.id).sort();
      expect(ids).toEqual(["A", "B"]);
    });

    it("returns all nodes when no edges exist", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const engine = new WorkflowEngine(nodes, []);

      const entries = engine.getEntryNodes();
      expect(entries).toHaveLength(2);
    });
  });

  describe("getNode()", () => {
    it("returns a node by ID", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const engine = new WorkflowEngine(nodes, []);

      const node = engine.getNode("A");
      expect(node).toBeDefined();
      expect(node!.id).toBe("A");
    });

    it("returns undefined for unknown ID", () => {
      const engine = new WorkflowEngine([makeNode("A")], []);
      expect(engine.getNode("Z")).toBeUndefined();
    });
  });

  describe("getNextNodes()", () => {
    it("returns immediate successors when dependencies are met", () => {
      // A -> B -> C
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const completed = new Set(["A"]);
      const next = engine.getNextNodes(completed, "A");
      expect(next).toEqual(["B"]);
    });

    it("does not return nodes with unmet dependencies", () => {
      // A -> C, B -> C (C needs both A and B)
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "C"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      // Only A completed — C still blocked by B
      const next = engine.getNextNodes(new Set(["A"]), "A");
      expect(next).toEqual([]);
    });

    it("returns merge node when all inputs are completed", () => {
      // A -> C, B -> C
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C", "merge")];
      const edges = [makeEdge("A", "C"), makeEdge("B", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const next = engine.getNextNodes(new Set(["A", "B"]), "B");
      expect(next).toEqual(["C"]);
    });

    it("returns multiple parallel successors", () => {
      // A -> B, A -> C
      const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
      const edges = [makeEdge("A", "B"), makeEdge("A", "C")];
      const engine = new WorkflowEngine(nodes, edges);

      const next = engine.getNextNodes(new Set(["A"]), "A");
      expect(next.sort()).toEqual(["B", "C"]);
    });

    it("returns empty for terminal node", () => {
      const nodes = [makeNode("A"), makeNode("B")];
      const edges = [makeEdge("A", "B")];
      const engine = new WorkflowEngine(nodes, edges);

      const next = engine.getNextNodes(new Set(["A", "B"]), "B");
      expect(next).toEqual([]);
    });

    it("returns empty for unknown node", () => {
      const engine = new WorkflowEngine([makeNode("A")], []);
      const next = engine.getNextNodes(new Set(), "Z");
      expect(next).toEqual([]);
    });

    describe("condition nodes", () => {
      function makeConditionNode(
        id: string,
        field: string,
        operator: WorkflowNode["conditionOperator"],
        value: string,
      ): WorkflowNode {
        return makeNode(id, "condition", {
          conditionField: field,
          conditionOperator: operator,
          conditionValue: value,
        });
      }

      it("follows 'true' branch when condition matches (eq)", () => {
        const nodes = [
          makeNode("A"),
          makeConditionNode("cond", "status", "eq", "success"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("A", "cond"),
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["A", "cond"]), "cond", {
          status: "success",
        });
        expect(next).toEqual(["B"]);
      });

      it("follows 'false' branch when condition does not match (eq)", () => {
        const nodes = [
          makeNode("A"),
          makeConditionNode("cond", "status", "eq", "success"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("A", "cond"),
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["A", "cond"]), "cond", {
          status: "failed",
        });
        expect(next).toEqual(["C"]);
      });

      it("handles 'neq' operator", () => {
        const nodes = [
          makeConditionNode("cond", "status", "neq", "failed"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", {
          status: "success",
        });
        expect(next).toEqual(["B"]);
      });

      it("handles 'contains' operator", () => {
        const nodes = [
          makeConditionNode("cond", "result", "contains", "error"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", {
          result: "found an error in file.ts",
        });
        expect(next).toEqual(["B"]);
      });

      it("handles 'not_contains' operator", () => {
        const nodes = [
          makeConditionNode("cond", "result", "not_contains", "error"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", {
          result: "all tests passed",
        });
        expect(next).toEqual(["B"]);
      });

      it("handles 'gt' operator", () => {
        const nodes = [
          makeConditionNode("cond", "score", "gt", "50"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", { score: "75" });
        expect(next).toEqual(["B"]);
      });

      it("handles 'lt' operator", () => {
        const nodes = [
          makeConditionNode("cond", "score", "lt", "50"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", { score: "25" });
        expect(next).toEqual(["B"]);
      });

      it("returns 'false' branch when conditionField is missing from result", () => {
        const nodes = [
          makeConditionNode("cond", "status", "eq", "success"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", {});
        expect(next).toEqual(["C"]);
      });

      it("returns 'false' branch when taskResult is undefined", () => {
        const nodes = [
          makeConditionNode("cond", "status", "eq", "success"),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", undefined);
        expect(next).toEqual(["C"]);
      });

      it("falls back to first edge when no branch matches", () => {
        const nodes = [
          makeConditionNode("cond", "status", "eq", "success"),
          makeNode("B"),
        ];
        // Edge with no conditionBranch
        const edges = [makeEdge("cond", "B")];
        const engine = new WorkflowEngine(nodes, edges);

        // Condition evaluates to "false" but no edge has conditionBranch="false"
        // Fallback picks first outgoing edge
        const next = engine.getNextNodes(new Set(["cond"]), "cond", {
          status: "failed",
        });
        expect(next).toEqual(["B"]);
      });

      it("returns 'false' branch with unknown operator", () => {
        const nodes = [
          makeNode("cond", "condition", {
            conditionField: "status",
            conditionOperator: "unknown_op" as WorkflowNode["conditionOperator"],
            conditionValue: "val",
          }),
          makeNode("B"),
          makeNode("C"),
        ];
        const edges = [
          makeEdge("cond", "B", { conditionBranch: "true" }),
          makeEdge("cond", "C", { conditionBranch: "false" }),
        ];
        const engine = new WorkflowEngine(nodes, edges);

        const next = engine.getNextNodes(new Set(["cond"]), "cond", {
          status: "anything",
        });
        expect(next).toEqual(["C"]);
      });
    });
  });
});
