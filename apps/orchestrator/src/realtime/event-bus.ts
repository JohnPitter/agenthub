import { EventEmitter } from "events";
import type { AgentStatus } from "@agenthub/shared";

export interface EventMap {
  "agent:status": { agentId: string; projectId: string; status: AgentStatus; taskId?: string; progress?: number };
  "agent:message": { agentId: string; projectId: string; taskId?: string; content: string; contentType: string; sessionId: string };
  "agent:stream": { agentId: string; projectId: string; event: unknown; sessionId: string };
  "agent:tool_use": { agentId: string; projectId: string; taskId?: string; tool: string; input: unknown; response: unknown; sessionId: string };
  "agent:notification": { agentId: string; projectId: string; message: string; title?: string };
  "agent:result": { agentId: string; projectId: string; taskId?: string; result?: string; cost: number; duration: number; isError: boolean; errors?: string[] };
  "agent:error": { agentId: string; projectId: string; error: string };
  "task:status": { taskId: string; status: string; agentId?: string };
  "task:created": { task: unknown };
  "task:updated": { task: unknown };
  "task:queued": { taskId: string; agentId: string; projectId: string; queuePosition: number };
  "task:git_branch": { taskId: string; projectId: string; branchName: string; baseBranch: string };
  "task:git_commit": { taskId: string; projectId: string; commitSha: string; commitMessage: string; branchName: string };
  "task:ready_to_commit": { taskId: string; projectId: string; changedFiles: string[] };
  "task:git_push": { taskId: string; projectId: string; branchName: string; commitSha: string; remote: string };
  "task:git_push_error": { taskId: string; projectId: string; error: string };
  "task:pr_created": { taskId: string; projectId: string; prNumber: number; prUrl: string; prTitle: string; headBranch: string; baseBranch: string };
  "task:pr_merged": { taskId: string; projectId: string; prNumber: number; method: string };
  "board:activity": { projectId: string; agentId: string; action: string; detail: string; timestamp: number };
  "board:agent_cursor": { projectId: string; agentId: string; filePath?: string; lineNumber?: number; action: string };
}

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.emitter.emit(event, data);
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void) {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void) {
    this.emitter.off(event, handler);
  }
}

export const eventBus = new TypedEventBus();
