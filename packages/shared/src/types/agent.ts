export type AgentRole =
  | "architect"
  | "tech_lead"
  | "frontend_dev"
  | "backend_dev"
  | "qa"
  | "custom";

export type AgentModel = "claude-opus-4-6" | "claude-sonnet-4-5-20250929";

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
  level: "senior" | "mid" | "junior";
  isDefault: boolean;
  isActive: boolean;
  color: string;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentWithStatus extends Agent {
  status: AgentStatus;
  currentTaskId: string | null;
}
