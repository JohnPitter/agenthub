export type TaskStatus =
  | "created"
  | "assigned"
  | "in_progress"
  | "review"
  | "changes_requested"
  | "done"
  | "cancelled"
  | "blocked"
  | "failed";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskCategory = "feature" | "bug" | "refactor" | "test" | "docs";

export interface Task {
  id: string;
  projectId: string;
  assignedAgentId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  parsedSpec: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory | null;
  branch: string | null;
  sessionId: string | null;
  result: string | null;
  costUsd: string | null;
  tokensUsed: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  subtaskCount?: number;
  completedSubtaskCount?: number;
}

export interface TaskLog {
  id: string;
  taskId: string;
  agentId: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: string | null;
  filePath: string | null;
  createdAt: Date;
}
