import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "../stores/chat-store";
import { api } from "../lib/utils";
import type { Message } from "@agenthub/shared";

const LIMIT = 50;

export function useMessages(projectId: string | undefined) {
  const {
    addMessage,
    addMessages,
    setLoadingMessages,
    setHasMoreMessages,
    clearMessages,
    isLoadingMessages,
    hasMoreMessages,
  } = useChatStore();

  const offsetRef = useRef(0);

  // Load initial messages when projectId changes
  useEffect(() => {
    if (!projectId) return;
    clearMessages();
    offsetRef.current = 0;
    loadMessages(0);
  }, [projectId]);

  const loadMessages = useCallback(
    async (offset: number) => {
      if (!projectId || isLoadingMessages) return;

      setLoadingMessages(true);
      try {
        const data = await api<{ messages: Message[] }>(
          `/api/messages?projectId=${projectId}&limit=${LIMIT}&offset=${offset}`,
        );

        const msgs = data.messages;
        if (offset === 0) {
          addMessages(msgs);
        } else {
          addMessages(msgs, true);
        }

        offsetRef.current = offset + msgs.length;
        setHasMoreMessages(msgs.length === LIMIT);
      } catch {
        // Silently fail — messages will load on retry
      } finally {
        setLoadingMessages(false);
      }
    },
    [projectId, isLoadingMessages],
  );

  const loadMoreMessages = useCallback(() => {
    if (hasMoreMessages && !isLoadingMessages) {
      loadMessages(offsetRef.current);
    }
  }, [hasMoreMessages, isLoadingMessages, loadMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!projectId || !content.trim()) return;

      // Optimistically add to store
      const optimistic: Message = {
        id: `temp_${Date.now()}`,
        projectId,
        taskId: null,
        agentId: null,
        source: "user",
        content: content.trim(),
        contentType: "text",
        metadata: null,
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(optimistic);

      try {
        await api<{ message: Message }>("/api/messages", {
          method: "POST",
          body: JSON.stringify({ projectId, content: content.trim() }),
        });
      } catch {
        // Message was already added optimistically
      }
    },
    [projectId, addMessage],
  );

  return { sendMessage, loadMoreMessages };
}
