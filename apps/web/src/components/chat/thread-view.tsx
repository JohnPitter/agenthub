import { useEffect, useRef, useState } from "react";
import { X, MessageSquare, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, formatDate } from "../../lib/utils";
import { MessageContent } from "./message-content";
import { AgentAvatar } from "../agents/agent-avatar";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import type { Message } from "@agenthub/shared";

interface ThreadViewProps {
  parentMessage: Message;
  onClose: () => void;
  onSendReply: (content: string, parentMessageId: string) => void;
  onLoadReplies: (messageId: string) => void;
}

export function ThreadView({ parentMessage, onClose, onSendReply, onLoadReplies }: ThreadViewProps) {
  const { t } = useTranslation();
  const agents = useWorkspaceStore((s) => s.agents);
  const threadReplies = useChatStore((s) => s.threadReplies);
  const [replyText, setReplyText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    onLoadReplies(parentMessage.id);
  }, [parentMessage.id]);

  // Auto-scroll on new replies
  useEffect(() => {
    if (threadReplies.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = threadReplies.length;
  }, [threadReplies.length]);

  const handleSend = () => {
    if (!replyText.trim()) return;
    onSendReply(replyText.trim(), parentMessage.id);
    setReplyText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const parentAgent = parentMessage.agentId
    ? agents.find((a) => a.id === parentMessage.agentId)
    : undefined;

  const renderMessage = (msg: Message, isParent = false) => {
    const isUser = msg.source === "user";
    const msgAgent = msg.agentId ? agents.find((a) => a.id === msg.agentId) : undefined;

    return (
      <div
        key={msg.id}
        className={cn(
          "flex gap-3",
          isUser ? "flex-row-reverse" : "flex-row",
          isParent && "pb-3 border-b border-stroke2 mb-3",
        )}
      >
        {!isUser && (
          msgAgent ? (
            <AgentAvatar name={msgAgent.name} avatar={msgAgent.avatar} color={msgAgent.color} size="sm" className="!h-7 !w-7 !text-[11px] !rounded-full" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">A</div>
          )
        )}

        <div
          className={cn(
            "flex max-w-[240px] flex-col gap-0.5",
            isUser ? "items-end" : "items-start",
          )}
        >
          {!isUser && msgAgent && (
            <span className="text-[10px] font-medium text-neutral-fg2">{msgAgent.name}</span>
          )}
          <div
            className={cn(
              "rounded-md px-3 py-2",
              isUser
                ? "bg-brand text-white"
                : "bg-neutral-bg2 border border-stroke text-neutral-fg1",
            )}
          >
            <MessageContent message={msg} />
          </div>
          <span className="text-[9px] text-neutral-fg-disabled">
            {formatDate(msg.createdAt)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col border-l border-stroke2 bg-neutral-bg1">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3 border-b border-stroke2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand" />
          <span className="text-[12px] font-semibold text-neutral-fg1">Thread</span>
          <span className="text-[11px] text-neutral-fg3">
            {(parentMessage.replyCount ?? 0)} {t("thread.replies")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg2"
          title={t("thread.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Parent message */}
        {renderMessage(parentMessage, true)}

        {/* Replies */}
        {threadReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-[12px] text-neutral-fg3">{t("thread.noReplies")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threadReplies.map((reply) => renderMessage(reply))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="border-t border-stroke2 p-3">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={t("thread.replyPlaceholder")}
            className="max-h-[120px] flex-1 resize-none rounded-lg border border-stroke bg-neutral-bg1 px-3 py-2 text-[12px] text-neutral-fg1 outline-none transition-colors placeholder:text-neutral-fg-disabled focus:border-brand focus:ring-2 focus:ring-brand-light"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!replyText.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-all duration-200 hover:bg-brand-hover disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
