import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "../stores/chat-store";
import { api } from "../lib/utils";
import type { Message } from "@agenthub/shared";

const LIMIT = 50;

export function useMessages(projectId: string | undefined) {
  const addMessage = useChatStore((s) => s.addMessage);
  const addMessages = useChatStore((s) => s.addMessages);
  const setLoadingMessages = useChatStore((s) => s.setLoadingMessages);
  const setHasMoreMessages = useChatStore((s) => s.setHasMoreMessages);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const hasMoreMessages = useChatStore((s) => s.hasMoreMessages);
  const setThreadReplies = useChatStore((s) => s.setThreadReplies);
  const addThreadReply = useChatStore((s) => s.addThreadReply);
  const incrementReplyCount = useChatStore((s) => s.incrementReplyCount);

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
          `/messages?projectId=${projectId}&limit=${LIMIT}&offset=${offset}&parentId=null`,
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

  const loadThreadReplies = useCallback(
    async (messageId: string) => {
      try {
        const data = await api<{ replies: Message[] }>(
          `/messages/${messageId}/replies`,
        );
        setThreadReplies(data.replies);
      } catch {
        // Silently fail
      }
    },
    [setThreadReplies],
  );

  const sendMessage = useCallback(
    async (content: string, parentMessageId?: string) => {
      if (!projectId || !content.trim()) return;

      const optimistic: Message = {
        id: `temp_${Date.now()}`,
        projectId,
        taskId: null,
        agentId: null,
        source: "user",
        content: content.trim(),
        contentType: "text",
        metadata: null,
        parentMessageId: parentMessageId ?? null,
        isThinking: false,
        createdAt: new Date(),
      };

      if (parentMessageId) {
        addThreadReply(optimistic);
        incrementReplyCount(parentMessageId);
      } else {
        addMessage(optimistic);
      }

      try {
        await api<{ message: Message }>("/messages", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            content: content.trim(),
            ...(parentMessageId && { parentMessageId }),
          }),
        });
      } catch {
        // Message was already added optimistically
      }
    },
    [projectId, addMessage, addThreadReply, incrementReplyCount],
  );

  return { sendMessage, loadMoreMessages, loadThreadReplies };
}
