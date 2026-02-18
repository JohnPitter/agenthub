/** Types of nodes in a visual workflow DAG */
export type WorkflowNodeType = "agent" | "condition" | "parallel" | "merge";

/** A single node in a workflow graph */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  /** Position on the visual canvas */
  position: { x: number; y: number };
  /** For "agent" nodes — which agent role to assign */
  agentRole?: string;
  /** For "agent" nodes — optional specific agent ID override */
  agentId?: string;
  /** For "condition" nodes — the field to evaluate on the task/result */
  conditionField?: string;
  /** For "condition" nodes — comparison operator */
  conditionOperator?: "eq" | "neq" | "contains" | "not_contains" | "gt" | "lt";
  /** For "condition" nodes — value to compare against */
  conditionValue?: string;
}

/** An edge connecting two nodes in the workflow */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** For edges coming out of condition nodes */
  label?: string;
  /** "true" or "false" branch for condition nodes */
  conditionBranch?: "true" | "false";
}

/** A complete workflow definition */
export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Execution state for a workflow instance */
export type WorkflowExecutionStatus = "running" | "completed" | "failed" | "paused";

/** Tracks which nodes have been completed during execution */
export interface WorkflowExecutionState {
  workflowId: string;
  taskId: string;
  status: WorkflowExecutionStatus;
  completedNodeIds: string[];
  activeNodeIds: string[];
  nodeResults: Record<string, string>;
}
