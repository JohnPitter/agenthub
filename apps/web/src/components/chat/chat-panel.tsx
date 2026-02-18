import { MessageSquare, ChevronLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { useMessages } from "../../hooks/use-messages";
import { useSocket } from "../../hooks/use-socket";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { ThreadView } from "./thread-view";
import type { Message } from "@agenthub/shared";

export function ChatPanel() {
  const chatPanelOpen = useWorkspaceStore((s) => s.chatPanelOpen);
  const toggleChatPanel = useWorkspaceStore((s) => s.toggleChatPanel);
  const agents = useWorkspaceStore((s) => s.agents);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const projectId = activeProjectId ?? "";
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreamingAgent = useChatStore((s) => s.setStreamingAgent);
  const updateAgentActivity = useChatStore((s) => s.updateAgentActivity);
  const activeThread = useChatStore((s) => s.activeThread);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const { sendMessage: sendHttp, loadMoreMessages, loadThreadReplies } = useMessages(projectId);

  // Wire socket events -> chat store
  const { sendMessage: sendSocket } = useSocket(projectId, {
    onAgentMessage: (data) => {
      const agent = agents.find((a) => a.id === data.agentId);
      const msg: Message = {
        id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: data.projectId,
        taskId: data.taskId ?? null,
        agentId: data.agentId,
        source: "agent",
        content: data.content,
        contentType: data.contentType as Message["contentType"],
        metadata: JSON.stringify({ sessionId: data.sessionId }),
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);

      // Clear typing when message arrives
      if (agent) setStreamingAgent(data.agentId, false);
    },

    onAgentStream: (data) => {
      setStreamingAgent(data.agentId, true);
    },

    onAgentToolUse: (data) => {
      const msg: Message = {
        id: `rt_tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: data.projectId,
        taskId: data.taskId ?? null,
        agentId: data.agentId,
        source: "agent",
        content: data.tool,
        contentType: "tool_use",
        metadata: JSON.stringify({
          sessionId: data.sessionId,
          tool: data.tool,
          input: data.input,
        }),
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);
    },

    onAgentResult: (data) => {
      setStreamingAgent(data.agentId, false);
      updateAgentActivity(data.agentId, {
        status: "idle",
        progress: data.isError ? 0 : 100,
      });

      if (data.result) {
        const msg: Message = {
          id: `rt_result_${Date.now()}`,
          projectId: data.projectId,
          taskId: data.taskId ?? null,
          agentId: data.agentId,
          source: "agent",
          content: data.result,
          contentType: "markdown",
          metadata: JSON.stringify({
            cost: data.cost,
            duration: data.duration,
          }),
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        };
        addMessage(msg);
      }
    },

    onAgentError: (data) => {
      setStreamingAgent(data.agentId, false);
      updateAgentActivity(data.agentId, { status: "error" });

      const msg: Message = {
        id: `rt_err_${Date.now()}`,
        projectId: data.projectId,
        taskId: null,
        agentId: data.agentId,
        source: "agent",
        content: data.error,
        contentType: "error",
        metadata: null,
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);
    },

    onAgentStatus: (data) => {
      updateAgentActivity(data.agentId, {
        status: data.status,
        lastActivity: Date.now(),
        ...(data.taskId && { taskId: data.taskId }),
        ...(data.progress !== undefined && { progress: data.progress }),
      });
    },

    onTaskStatus: (data) => {
      const statusMessages: Record<string, string> = {
        in_progress: "Task iniciada",
        review: "Task enviada para review",
        done: "Task concluida",
        changes_requested: "Alteracoes solicitadas",
      };

      const message = statusMessages[data.status];
      if (message) {
        const msg: Message = {
          id: `sys_task_${Date.now()}`,
          projectId,
          taskId: data.taskId,
          agentId: data.agentId ?? null,
          source: "system",
          content: message,
          contentType: "system",
          metadata: null,
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        };
        addMessage(msg);
      }
    },

    onTaskCreated: (data) => {
      const task = data.task as { title?: string };
      const msg: Message = {
        id: `sys_created_${Date.now()}`,
        projectId,
        taskId: null,
        agentId: null,
        source: "system",
        content: task.title ? `Nova task criada: ${task.title}` : "Nova task criada",
        contentType: "system",
        metadata: null,
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);
    },

    onTaskQueued: (data) => {
      const msg: Message = {
        id: `sys_queued_${Date.now()}`,
        projectId,
        taskId: data.taskId,
        agentId: data.agentId,
        source: "system",
        content: `Task na fila (posicao ${data.queuePosition})`,
        contentType: "system",
        metadata: null,
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);
    },

    onAgentNotification: (data) => {
      const msg: Message = {
        id: `sys_notif_${Date.now()}`,
        projectId,
        taskId: null,
        agentId: data.agentId,
        source: "system",
        content: data.message,
        contentType: "system",
        metadata: data.title ? JSON.stringify({ title: data.title }) : null,
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      };
      addMessage(msg);
    },
  });

  const handleSend = (content: string, agentId?: string) => {
    sendHttp(content);
    sendSocket(content, agentId);
  };

  const handleReply = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (msg) setActiveThread(msg);
  };

  const handleOpenThread = (message: Message) => {
    setActiveThread(message);
  };

  const handleSendReply = (content: string, parentMessageId: string) => {
    sendHttp(content, parentMessageId);
  };

  const handleCloseThread = () => {
    setActiveThread(null);
  };

  // Don't render if no active project
  if (!activeProjectId) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex h-full transition-all duration-300 border-r border-stroke2",
        chatPanelOpen ? (activeThread ? "w-[680px]" : "w-[360px]") : "w-0 overflow-hidden",
      )}
    >
      {/* Main chat column */}
      <div className="flex h-full w-[360px] shrink-0 flex-col glass-strong">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-stroke2 bg-gradient-to-r from-brand-light/20 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple shadow-brand">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-neutral-fg1">Chat</span>
          </div>
          <button
            onClick={toggleChatPanel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          onLoadMore={loadMoreMessages}
          onReply={handleReply}
          onOpenThread={handleOpenThread}
        />

        {/* Input */}
        <ChatInput onSend={handleSend} agents={agents} />
      </div>

      {/* Thread panel */}
      {activeThread && (
        <div className="h-full w-[320px] shrink-0">
          <ThreadView
            parentMessage={activeThread}
            onClose={handleCloseThread}
            onSendReply={handleSendReply}
            onLoadReplies={loadThreadReplies}
          />
        </div>
      )}
    </div>
  );
}
