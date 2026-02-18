import { logger } from "../lib/logger.js";
import type { WorkflowNode, WorkflowEdge } from "@agenthub/shared";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * WorkflowEngine — processes a DAG of workflow nodes.
 *
 * Provides topological sort for execution ordering, cycle detection,
 * and methods to determine next executable nodes given completed state.
 */
export class WorkflowEngine {
  private nodes: WorkflowNode[];
  private edges: WorkflowEdge[];
  /** Map nodeId -> list of outgoing edges */
  private outEdges: Map<string, WorkflowEdge[]>;
  /** Map nodeId -> list of incoming edges */
  private inEdges: Map<string, WorkflowEdge[]>;
  /** Set of all node IDs */
  private nodeSet: Set<string>;

  constructor(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.nodeSet = new Set(nodes.map((n) => n.id));

    this.outEdges = new Map();
    this.inEdges = new Map();
    for (const node of nodes) {
      this.outEdges.set(node.id, []);
      this.inEdges.set(node.id, []);
    }
    for (const edge of edges) {
      this.outEdges.get(edge.source)?.push(edge);
      this.inEdges.get(edge.target)?.push(edge);
    }
  }

  /**
   * Validate the workflow DAG:
   * - No cycles
   * - All edge endpoints reference existing nodes
   * - Has at least one entry node (no incoming edges)
   * - All nodes reachable from entry nodes
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    if (this.nodes.length === 0) {
      errors.push("Workflow has no nodes");
      return { valid: false, errors };
    }

    // Check that all edge endpoints exist
    for (const edge of this.edges) {
      if (!this.nodeSet.has(edge.source)) {
        errors.push(`Edge "${edge.id}" references unknown source node "${edge.source}"`);
      }
      if (!this.nodeSet.has(edge.target)) {
        errors.push(`Edge "${edge.id}" references unknown target node "${edge.target}"`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Find entry nodes (no incoming edges)
    const entryNodes = this.nodes.filter((n) => (this.inEdges.get(n.id)?.length ?? 0) === 0);
    if (entryNodes.length === 0) {
      errors.push("Workflow has no entry nodes (every node has incoming edges, likely a cycle)");
      return { valid: false, errors };
    }

    // Cycle detection via Kahn's algorithm (topological sort)
    const inDegree = new Map<string, number>();
    for (const node of this.nodes) {
      inDegree.set(node.id, this.inEdges.get(node.id)?.length ?? 0);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      visited++;
      for (const edge of this.outEdges.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(edge.target) ?? 1) - 1;
        inDegree.set(edge.target, newDeg);
        if (newDeg === 0) queue.push(edge.target);
      }
    }

    if (visited !== this.nodes.length) {
      errors.push(`Workflow contains a cycle (${this.nodes.length - visited} nodes unreachable via topological sort)`);
      return { valid: false, errors };
    }

    // Reachability: BFS from entry nodes
    const reachable = new Set<string>();
    const bfsQueue = entryNodes.map((n) => n.id);
    while (bfsQueue.length > 0) {
      const id = bfsQueue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const edge of this.outEdges.get(id) ?? []) {
        if (!reachable.has(edge.target)) bfsQueue.push(edge.target);
      }
    }

    if (reachable.size !== this.nodes.length) {
      const unreachableIds = this.nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);
      errors.push(`Unreachable nodes: ${unreachableIds.join(", ")}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Return the execution order as layers of parallel-executable nodes.
   * Each layer contains nodes whose dependencies are all in prior layers.
   * Uses Kahn's algorithm.
   */
  getExecutionOrder(): string[][] {
    const inDegree = new Map<string, number>();
    for (const node of this.nodes) {
      inDegree.set(node.id, this.inEdges.get(node.id)?.length ?? 0);
    }

    const layers: string[][] = [];
    let currentLayer = Array.from(inDegree.entries())
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      const nextLayer: string[] = [];

      for (const nodeId of currentLayer) {
        for (const edge of this.outEdges.get(nodeId) ?? []) {
          const newDeg = (inDegree.get(edge.target) ?? 1) - 1;
          inDegree.set(edge.target, newDeg);
          if (newDeg === 0) nextLayer.push(edge.target);
        }
      }

      currentLayer = nextLayer;
    }

    return layers;
  }

  /**
   * Given a set of completed node IDs and the result of the last completed node,
   * determine which nodes should be executed next.
   *
   * For condition nodes, checks the condition and returns only the matching branch.
   * For merge nodes, only returns them when ALL incoming nodes are complete.
   * For parallel nodes, returns all outgoing targets.
   */
  getNextNodes(
    completedNodeIds: Set<string>,
    lastCompletedNodeId: string,
    taskResult?: Record<string, unknown>,
  ): string[] {
    const nextIds: string[] = [];
    const outgoing = this.outEdges.get(lastCompletedNodeId) ?? [];
    const lastNode = this.nodes.find((n) => n.id === lastCompletedNodeId);

    if (!lastNode) return [];

    if (lastNode.type === "condition") {
      // Check condition and pick the matching branch (safe, no code execution)
      const branch = this.checkCondition(lastNode, taskResult);
      for (const edge of outgoing) {
        if (edge.conditionBranch === branch) {
          nextIds.push(edge.target);
        }
      }
      // Fallback: if no matching branch, take first outgoing edge
      if (nextIds.length === 0 && outgoing.length > 0) {
        logger.warn(
          `Condition node "${lastNode.id}" has no matching branch for "${branch}", falling through to first edge`,
          "workflow-engine",
        );
        nextIds.push(outgoing[0].target);
      }
    } else {
      // For agent, parallel, or other nodes: all outgoing targets are candidates
      for (const edge of outgoing) {
        nextIds.push(edge.target);
      }
    }

    // Filter: only return nodes whose ALL incoming dependencies are completed
    return nextIds.filter((targetId) => {
      const targetNode = this.nodes.find((n) => n.id === targetId);
      if (!targetNode) return false;

      const incoming = this.inEdges.get(targetId) ?? [];
      return incoming.every((e) => completedNodeIds.has(e.source));
    });
  }

  /**
   * Safe condition checking using switch/case on operators.
   * Compares a field from the task result using the configured operator.
   * Never executes arbitrary code.
   */
  private checkCondition(
    node: WorkflowNode,
    taskResult?: Record<string, unknown>,
  ): "true" | "false" {
    if (!taskResult || !node.conditionField) return "false";

    const fieldValue = String(taskResult[node.conditionField] ?? "");
    const expected = node.conditionValue ?? "";

    switch (node.conditionOperator) {
      case "eq":
        return fieldValue === expected ? "true" : "false";
      case "neq":
        return fieldValue !== expected ? "true" : "false";
      case "contains":
        return fieldValue.includes(expected) ? "true" : "false";
      case "not_contains":
        return !fieldValue.includes(expected) ? "true" : "false";
      case "gt":
        return Number(fieldValue) > Number(expected) ? "true" : "false";
      case "lt":
        return Number(fieldValue) < Number(expected) ? "true" : "false";
      default:
        return "false";
    }
  }

  /** Get entry nodes (nodes with no incoming edges) */
  getEntryNodes(): WorkflowNode[] {
    return this.nodes.filter((n) => (this.inEdges.get(n.id)?.length ?? 0) === 0);
  }

  /** Get a node by ID */
  getNode(id: string): WorkflowNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
}
