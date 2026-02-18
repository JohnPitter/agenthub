import { create } from "zustand";
import type { Message, AgentStatus } from "@agenthub/shared";

interface AgentActivityInfo {
  status: AgentStatus;
  currentTask?: string;
  currentFile?: string;
  lastActivity: number;
  taskId?: string;
  progress: number;
}

interface ChatState {
  messages: Message[];
  streamingAgents: Set<string>;
  agentActivity: Map<string, AgentActivityInfo>;
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  activeThread: Message | null;
  threadReplies: Message[];

  addMessage: (message: Message) => void;
  addMessages: (messages: Message[], prepend?: boolean) => void;
  setStreamingAgent: (agentId: string, isStreaming: boolean) => void;
  updateAgentActivity: (agentId: string, update: Partial<AgentActivityInfo>) => void;
  setLoadingMessages: (loading: boolean) => void;
  setHasMoreMessages: (hasMore: boolean) => void;
  clearMessages: () => void;
  setActiveThread: (message: Message | null) => void;
  setThreadReplies: (replies: Message[]) => void;
  addThreadReply: (reply: Message) => void;
  incrementReplyCount: (messageId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  streamingAgents: new Set(),
  agentActivity: new Map(),
  isLoadingMessages: false,
  hasMoreMessages: true,
  activeThread: null,
  threadReplies: [],

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  addMessages: (messages, prepend = false) =>
    set((state) => ({
      messages: prepend
        ? [...messages, ...state.messages]
        : [...state.messages, ...messages],
    })),

  setStreamingAgent: (agentId, isStreaming) =>
    set((state) => {
      const next = new Set(state.streamingAgents);
      if (isStreaming) next.add(agentId);
      else next.delete(agentId);
      return { streamingAgents: next };
    }),

  updateAgentActivity: (agentId, update) =>
    set((state) => {
      const next = new Map(state.agentActivity);
      const current = next.get(agentId) ?? { status: "idle" as const, lastActivity: Date.now(), progress: 0 };
      next.set(agentId, { ...current, ...update });
      return { agentActivity: next };
    }),

  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setHasMoreMessages: (hasMore) => set({ hasMoreMessages: hasMore }),
  clearMessages: () => set({ messages: [], hasMoreMessages: true, activeThread: null, threadReplies: [] }),

  setActiveThread: (message) => set({ activeThread: message, threadReplies: [] }),
  setThreadReplies: (replies) => set({ threadReplies: replies }),
  addThreadReply: (reply) =>
    set((state) => ({ threadReplies: [...state.threadReplies, reply] })),
  incrementReplyCount: (messageId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m,
      ),
    })),
}));
