export interface Integration {
  id: string;
  type: "whatsapp" | "telegram";
  status: "disconnected" | "connecting" | "connected" | "error";
  config: string | null;
  linkedAgentId: string | null;
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentProjectConfig {
  id: string;
  agentId: string;
  projectId: string;
  allowedTools: string[] | null;
  additionalDirectories: string[] | null;
  additionalPrompt: string | null;
  isEnabled: boolean;
}
