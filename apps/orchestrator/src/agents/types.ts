import type { Agent } from "@agenthub/shared";

export interface SessionConfig {
  agent: Agent;
  projectId: string;
  projectPath: string;
  taskId: string;
  prompt: string;
}

export interface SessionResult {
  result?: string;
  cost: number;
  duration: number;
  isError: boolean;
  errors: string[];
  tokensUsed: number;
}
