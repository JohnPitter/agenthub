export type MessageSource = "user" | "agent" | "system" | "whatsapp" | "telegram";

export type MessageContentType =
  | "text"
  | "code"
  | "markdown"
  | "thinking"
  | "tool_use"
  | "error"
  | "system";

export interface Message {
  id: string;
  projectId: string;
  taskId: string | null;
  agentId: string | null;
  source: MessageSource;
  content: string;
  contentType: MessageContentType;
  metadata: string | null;
  parentMessageId: string | null;
  isThinking: boolean;
  createdAt: Date;
}
