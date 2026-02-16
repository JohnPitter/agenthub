export type AgentRole =
  | "architect"
  | "tech_lead"
  | "frontend_dev"
  | "backend_dev"
  | "qa"
  | "custom";

export type AgentModel = string;

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export type AgentStatus = "idle" | "running" | "paused" | "error";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  model: AgentModel;
  maxThinkingTokens: number | null;
  systemPrompt: string;
  description: string;
  allowedTools: string[];
  permissionMode: PermissionMode;
  level: "junior" | "pleno" | "senior" | "especialista" | "arquiteto";
  isDefault: boolean;
  isActive: boolean;
  color: string;
  avatar: string;
  soul: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentMemoryType = "lesson" | "pattern" | "preference" | "decision" | "error";

export interface AgentMemory {
  id: string;
  agentId: string;
  projectId: string | null;
  type: AgentMemoryType;
  content: string;
  context: string | null;
  importance: number;
  createdAt: Date;
}

export interface AgentWithStatus extends Agent {
  status: AgentStatus;
  currentTaskId: string | null;
}

/** A single step in an agent workflow */
export interface WorkflowStep {
  id: string;
  agentId: string;
  label: string;
  /** IDs of steps that follow this one */
  nextSteps: string[];
}

/** Defines the execution hierarchy of agents */
export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  /** The step that receives incoming tasks */
  entryStepId: string;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
}
