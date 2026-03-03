import { useTranslation } from "react-i18next";
import { Reply, MessageSquare } from "lucide-react";
import { cn, formatDate } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import { MessageContent } from "./message-content";
import type { Message, Agent } from "@agenthub/shared";

interface MessageBubbleProps {
  message: Message;
  agent?: Agent;
  onReply?: (messageId: string) => void;
  onOpenThread?: (message: Message) => void;
}

export function MessageBubble({ message, agent, onReply, onOpenThread }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.source === "user";
  const isSystem = message.source === "system";
  const replyCount = message.replyCount ?? 0;

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
        "group flex gap-3 animate-fade-up",
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
        <div className="relative">
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

          {/* Reply button — appears on hover */}
          {onReply && (
            <button
              onClick={() => onReply(message.id)}
              className={cn(
                "absolute -bottom-2 opacity-0 group-hover:opacity-100 transition-opacity",
                "flex items-center gap-1 rounded-full border border-stroke bg-neutral-bg1 px-2 py-0.5 text-[10px] text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg2",
                isUser ? "right-0" : "left-0",
              )}
            >
              <Reply className="h-3 w-3" />
              {t("thread.reply")}
            </button>
          )}
        </div>

        {/* Reply count badge */}
        {replyCount > 0 && onOpenThread && (
          <button
            onClick={() => onOpenThread(message)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-brand hover:bg-brand-light transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            {replyCount} {t("thread.replies")}
          </button>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-neutral-fg-disabled">
          {formatDate(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
