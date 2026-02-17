import { cn, formatDate } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
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
        <div className="rounded-md bg-neutral-bg-hover px-4 py-2">
          <p className="text-[12px] text-neutral-fg3">{message.content}</p>
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
        agent ? (
          <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-8 !w-8 !text-[12px] !rounded-full" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white">A</div>
        )
      )}

      <div
        className={cn(
          "flex max-w-[280px] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* Agent name */}
        {!isUser && agent && (
          <span className="text-[11px] font-medium text-neutral-fg2">
            {agent.name}
          </span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "rounded-md px-4 py-2.5",
            isUser
              ? "bg-brand text-white"
              : "bg-neutral-bg2 border border-stroke text-neutral-fg1",
          )}
        >
          <MessageContent message={message} />
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-neutral-fg-disabled">
          {formatDate(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
