import { cn, formatDate } from "../../lib/utils";
import { MessageContent } from "./message-content";
import type { Message, Agent } from "@agenthub/shared";

interface MessageBubbleProps {
  message: Message;
  agent?: Agent;
}

export function MessageBubble({ message, agent }: MessageBubbleProps) {
  const isUser = message.source === "user";
  const isSystem = message.source === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-lg bg-surface-hover px-4 py-2">
          <p className="text-[12px] text-text-tertiary">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-up",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Agent avatar */}
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ backgroundColor: agent?.color ?? "#0866FF" }}
        >
          {agent?.name?.charAt(0) ?? "A"}
        </div>
      )}

      <div
        className={cn(
          "flex max-w-[280px] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* Agent name */}
        {!isUser && agent && (
          <span className="text-[11px] font-medium text-text-secondary">
            {agent.name}
          </span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "rounded-lg px-4 py-2.5",
            isUser
              ? "bg-primary text-white"
              : "border border-edge bg-white",
          )}
        >
          <MessageContent message={message} />
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-text-placeholder">
          {formatDate(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
