export type AgentRole =
  | "architect"
  | "tech_lead"
  | "frontend_dev"
  | "backend_dev"
  | "qa"
  | "receptionist"
  | "doc_writer"
  | "support"
  | "custom";

export type AgentModel = string;

export type ModelProvider = "claude" | "openai";

export const OPENAI_MODELS = [
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", provider: "openai" as const },
  { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", provider: "openai" as const },
  { id: "gpt-5.1-codex", label: "GPT-5.1 Codex", provider: "openai" as const },
  { id: "gpt-5-codex-mini", label: "GPT-5 Codex Mini", provider: "openai" as const },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" as const },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" as const },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openai" as const },
  { id: "o3", label: "o3", provider: "openai" as const },
  { id: "o4-mini", label: "o4-mini", provider: "openai" as const },
  { id: "codex-mini", label: "Codex Mini", provider: "openai" as const },
] as const;

export const CLAUDE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "claude" as const },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "claude" as const },
  { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5", provider: "claude" as const },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "claude" as const },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "claude" as const },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" as const },
] as const;

export const ALL_MODELS = [...CLAUDE_MODELS, ...OPENAI_MODELS] as const;

export function getModelProvider(model: string): ModelProvider {
  if (model.startsWith("gpt-") || model.startsWith("o3") || model.startsWith("o4") || model.startsWith("codex")) {
    return "openai";
  }
  return "claude";
}

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
  /** Optional labels for each nextStep edge (same index as nextSteps) */
  nextStepLabels?: string[];
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
