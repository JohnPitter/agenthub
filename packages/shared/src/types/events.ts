import type { AgentStatus } from "./agent";

// Server → Client events
export interface ServerToClientEvents {
  "agent:status": (data: AgentStatusEvent) => void;
  "agent:message": (data: AgentMessageEvent) => void;
  "agent:stream": (data: AgentStreamEvent) => void;
  "agent:tool_use": (data: AgentToolUseEvent) => void;
  "agent:notification": (data: AgentNotificationEvent) => void;
  "agent:result": (data: AgentResultEvent) => void;
  "agent:error": (data: AgentErrorEvent) => void;
  "task:status": (data: TaskStatusEvent) => void;
  "task:created": (data: TaskCreatedEvent) => void;
  "task:updated": (data: TaskUpdatedEvent) => void;
  "task:queued": (data: TaskQueuedEvent) => void;
  "task:git_branch": (data: TaskGitBranchEvent) => void;
  "task:git_commit": (data: TaskGitCommitEvent) => void;
  "task:ready_to_commit": (data: TaskReadyToCommitEvent) => void;
  "task:git_push": (data: TaskGitPushEvent) => void;
  "task:git_push_error": (data: TaskGitPushErrorEvent) => void;
  "task:pr_created": (data: TaskPRCreatedEvent) => void;
  "task:pr_merged": (data: TaskPRMergedEvent) => void;
  "workflow:phase": (data: WorkflowPhaseEvent) => void;
  "board:activity": (data: BoardActivityEvent) => void;
  "board:agent_cursor": (data: BoardAgentCursorEvent) => void;
  "integration:status": (data: IntegrationStatusEvent) => void;
  "integration:message": (data: IntegrationMessageEvent) => void;
  "devserver:output": (data: DevServerOutputEvent) => void;
  "devserver:status": (data: DevServerStatusEvent) => void;
}

// Client → Server events
export interface ClientToServerEvents {
  "user:message": (data: { projectId: string; content: string; agentId?: string }) => void;
  "user:create_task": (data: { projectId: string; description: string }) => void;
  "user:execute_task": (data: { taskId: string; agentId: string }) => void;
  "user:cancel_task": (data: { taskId: string }) => void;
  "user:approve_task": (data: { taskId: string }) => void;
  "user:reject_task": (data: { taskId: string; feedback: string }) => void;
  "user:commit_task": (data: { taskId: string; message: string }) => void;
  "user:push_task": (data: { taskId: string }) => void;
  "project:select": (data: { projectId: string }) => void;
  "board:subscribe": (data: { projectId: string }) => void;
  "board:unsubscribe": (data: { projectId: string }) => void;
}

// Event data types
export interface AgentStatusEvent {
  agentId: string;
  projectId: string;
  status: AgentStatus;
  taskId?: string;
  progress?: number;
}

export interface AgentMessageEvent {
  agentId: string;
  projectId: string;
  taskId?: string;
  content: string;
  contentType: string;
  sessionId: string;
}

export interface AgentStreamEvent {
  agentId: string;
  projectId: string;
  event: unknown;
  sessionId: string;
}

export interface AgentToolUseEvent {
  agentId: string;
  projectId: string;
  taskId?: string;
  tool: string;
  input: unknown;
  response: unknown;
  sessionId: string;
}

export interface AgentNotificationEvent {
  agentId: string;
  projectId: string;
  message: string;
  title?: string;
  level?: "info" | "warn" | "error";
}

export interface WorkflowPhaseEvent {
  taskId: string;
  projectId: string;
  phase: string;
  agentId: string;
  agentName: string;
  detail?: string;
}

export interface AgentResultEvent {
  agentId: string;
  projectId: string;
  taskId?: string;
  result?: string;
  cost: number;
  duration: number;
  isError: boolean;
  errors?: string[];
}

export interface AgentErrorEvent {
  agentId: string;
  projectId: string;
  error: string;
}

export interface TaskStatusEvent {
  taskId: string;
  status: string;
  agentId?: string;
}

export interface TaskCreatedEvent {
  task: unknown;
}

export interface TaskUpdatedEvent {
  task: unknown;
}

export interface TaskQueuedEvent {
  taskId: string;
  agentId: string;
  projectId: string;
  queuePosition: number;
}

export interface BoardActivityEvent {
  projectId: string;
  agentId: string;
  action: string;
  detail: string;
  timestamp: number;
}

export interface BoardAgentCursorEvent {
  projectId: string;
  agentId: string;
  filePath?: string;
  lineNumber?: number;
  action: string;
}

export interface IntegrationStatusEvent {
  type: "whatsapp" | "telegram";
  status: "disconnected" | "connecting" | "connected" | "error";
  qr?: string; // QR code for WhatsApp pairing
}

export interface IntegrationMessageEvent {
  type: "whatsapp" | "telegram";
  from: string;
  content: string;
}

export interface TaskGitBranchEvent {
  taskId: string;
  projectId: string;
  branchName: string;
  baseBranch: string;
}

export interface TaskGitCommitEvent {
  taskId: string;
  projectId: string;
  commitSha: string;
  commitMessage: string;
  branchName: string;
}

export interface TaskReadyToCommitEvent {
  taskId: string;
  projectId: string;
  changedFiles: string[];
}

export interface TaskGitPushEvent {
  taskId: string;
  projectId: string;
  branchName: string;
  commitSha: string;
  remote: string;
}

export interface TaskGitPushErrorEvent {
  taskId: string;
  projectId: string;
  error: string;
}

export interface TaskPRCreatedEvent {
  taskId: string;
  projectId: string;
  prNumber: number;
  prUrl: string;
  prTitle: string;
  headBranch: string;
  baseBranch: string;
}

export interface TaskPRMergedEvent {
  taskId: string;
  projectId: string;
  prNumber: number;
  method: string;
}

export interface DevServerOutputEvent {
  projectId: string;
  line: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}

export interface DevServerStatusEvent {
  projectId: string;
  status: "stopped" | "starting" | "running" | "error";
  port?: number;
  error?: string;
}
