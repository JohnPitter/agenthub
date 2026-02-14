import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { useChatStore } from "../../stores/chat-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import type { Message } from "@agenthub/shared";

interface MessageListProps {
  messages: Message[];
  onLoadMore: () => void;
}

export function MessageList({ messages, onLoadMore }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const { agents } = useWorkspaceStore();
  const { streamingAgents, isLoadingMessages, hasMoreMessages } = useChatStore();

  // Auto-scroll when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const el = containerRef.current;
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (isNearBottom || prevCountRef.current === 0) {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const streamingAgentNames = Array.from(streamingAgents)
    .map((id) => agents.find((a) => a.id === id)?.name)
    .filter(Boolean);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {/* Load more */}
      {hasMoreMessages && (
        <div className="mb-4 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMessages}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-text-tertiary transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            {isLoadingMessages ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Carregar anteriores"
            )}
          </button>
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && !isLoadingMessages && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light">
            <span className="text-[20px]">💬</span>
          </div>
          <p className="text-[13px] font-medium text-text-secondary">
            Nenhuma mensagem ainda
          </p>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Envie uma mensagem para começar
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agent={msg.agentId ? agents.find((a) => a.id === msg.agentId) : undefined}
          />
        ))}
      </div>

      {/* Typing indicators */}
      {streamingAgentNames.map((name) => (
        <TypingIndicator key={name} agentName={name!} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
