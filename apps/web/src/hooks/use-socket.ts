import { useEffect, useRef } from "react";
import { getSocket, type AppSocket } from "../lib/socket";
import { useNotificationStore } from "../stores/notification-store";
import type { NotificationType } from "../stores/notification-store";
import type {
  AgentStatusEvent,
  AgentMessageEvent,
  AgentStreamEvent,
  AgentToolUseEvent,
  AgentResultEvent,
  AgentErrorEvent,
  AgentNotificationEvent,
  NotificationEvent,
  TaskStatusEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskQueuedEvent,
  TaskGitBranchEvent,
  TaskGitCommitEvent,
  TaskReadyToCommitEvent,
  TaskPRCreatedEvent,
  TaskPRMergedEvent,
  BoardActivityEvent,
  BoardAgentCursorEvent,
  DevServerOutputEvent,
  DevServerStatusEvent,
} from "@agenthub/shared";

interface SocketHandlers {
  onAgentStatus?: (data: AgentStatusEvent) => void;
  onAgentMessage?: (data: AgentMessageEvent) => void;
  onAgentStream?: (data: AgentStreamEvent) => void;
  onAgentToolUse?: (data: AgentToolUseEvent) => void;
  onAgentResult?: (data: AgentResultEvent) => void;
  onAgentError?: (data: AgentErrorEvent) => void;
  onAgentNotification?: (data: AgentNotificationEvent) => void;
  onTaskStatus?: (data: TaskStatusEvent) => void;
  onTaskCreated?: (data: TaskCreatedEvent) => void;
  onTaskUpdated?: (data: TaskUpdatedEvent) => void;
  onTaskQueued?: (data: TaskQueuedEvent) => void;
  onTaskGitBranch?: (data: TaskGitBranchEvent) => void;
  onTaskGitCommit?: (data: TaskGitCommitEvent) => void;
  onTaskReadyToCommit?: (data: TaskReadyToCommitEvent) => void;
  onTaskPRCreated?: (data: TaskPRCreatedEvent) => void;
  onTaskPRMerged?: (data: TaskPRMergedEvent) => void;
  onBoardActivity?: (data: BoardActivityEvent) => void;
  onBoardAgentCursor?: (data: BoardAgentCursorEvent) => void;
  onDevServerOutput?: (data: DevServerOutputEvent) => void;
  onDevServerStatus?: (data: DevServerStatusEvent) => void;
}

export function useSocket(projectId: string | undefined, handlers?: SocketHandlers) {
  const socketRef = useRef<AppSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!projectId) return;

    const socket = getSocket();
    socketRef.current = socket;

    // Join project room
    socket.emit("project:select", { projectId });
    socket.emit("board:subscribe", { projectId });

    // Register listeners
    const onAgentStatus = (data: AgentStatusEvent) => handlersRef.current?.onAgentStatus?.(data);
    const onAgentMessage = (data: AgentMessageEvent) => handlersRef.current?.onAgentMessage?.(data);
    const onAgentStream = (data: AgentStreamEvent) => handlersRef.current?.onAgentStream?.(data);
    const onAgentToolUse = (data: AgentToolUseEvent) => handlersRef.current?.onAgentToolUse?.(data);
    const onAgentResult = (data: AgentResultEvent) => handlersRef.current?.onAgentResult?.(data);
    const onAgentError = (data: AgentErrorEvent) => handlersRef.current?.onAgentError?.(data);
    const onAgentNotification = (data: AgentNotificationEvent) => handlersRef.current?.onAgentNotification?.(data);
    const onTaskStatus = (data: TaskStatusEvent) => handlersRef.current?.onTaskStatus?.(data);
    const onTaskCreated = (data: TaskCreatedEvent) => handlersRef.current?.onTaskCreated?.(data);
    const onTaskUpdated = (data: TaskUpdatedEvent) => handlersRef.current?.onTaskUpdated?.(data);
    const onTaskQueued = (data: TaskQueuedEvent) => handlersRef.current?.onTaskQueued?.(data);
    const onTaskGitBranch = (data: TaskGitBranchEvent) => handlersRef.current?.onTaskGitBranch?.(data);
    const onTaskGitCommit = (data: TaskGitCommitEvent) => handlersRef.current?.onTaskGitCommit?.(data);
    const onTaskReadyToCommit = (data: TaskReadyToCommitEvent) => handlersRef.current?.onTaskReadyToCommit?.(data);
    const onTaskPRCreated = (data: TaskPRCreatedEvent) => handlersRef.current?.onTaskPRCreated?.(data);
    const onTaskPRMerged = (data: TaskPRMergedEvent) => handlersRef.current?.onTaskPRMerged?.(data);
    const onBoardActivity = (data: BoardActivityEvent) => handlersRef.current?.onBoardActivity?.(data);
    const onBoardAgentCursor = (data: BoardAgentCursorEvent) => handlersRef.current?.onBoardAgentCursor?.(data);
    const onDevServerOutput = (data: DevServerOutputEvent) => handlersRef.current?.onDevServerOutput?.(data);
    const onDevServerStatus = (data: DevServerStatusEvent) => handlersRef.current?.onDevServerStatus?.(data);

    socket.on("agent:status", onAgentStatus);
    socket.on("agent:message", onAgentMessage);
    socket.on("agent:stream", onAgentStream);
    socket.on("agent:tool_use", onAgentToolUse);
    socket.on("agent:result", onAgentResult);
    socket.on("agent:error", onAgentError);
    socket.on("agent:notification", onAgentNotification);
    socket.on("task:status", onTaskStatus);
    socket.on("task:created", onTaskCreated);
    socket.on("task:updated", onTaskUpdated);
    socket.on("task:queued", onTaskQueued);
    socket.on("task:git_branch", onTaskGitBranch);
    socket.on("task:git_commit", onTaskGitCommit);
    socket.on("task:ready_to_commit", onTaskReadyToCommit);
    socket.on("task:pr_created", onTaskPRCreated);
    socket.on("task:pr_merged", onTaskPRMerged);
    socket.on("board:activity", onBoardActivity);
    socket.on("board:agent_cursor", onBoardAgentCursor);
    socket.on("devserver:output", onDevServerOutput);
    socket.on("devserver:status", onDevServerStatus);

    const onNotificationNew = (data: NotificationEvent) => {
      const store = useNotificationStore.getState();
      store.addNotificationFromSocket({
        id: data.id,
        projectId: data.projectId,
        type: data.type as NotificationType,
        title: data.title,
        message: data.body,
        link: data.link,
        timestamp: new Date(data.createdAt).getTime(),
        read: false,
      });
      // Show toast for critical types
      if (data.type === "agent_error") {
        store.addToast("error", data.title, data.body);
      }
    };
    socket.on("notification:new", onNotificationNew);

    return () => {
      socket.emit("board:unsubscribe", { projectId });
      socket.off("agent:status", onAgentStatus);
      socket.off("agent:message", onAgentMessage);
      socket.off("agent:stream", onAgentStream);
      socket.off("agent:tool_use", onAgentToolUse);
      socket.off("agent:result", onAgentResult);
      socket.off("agent:error", onAgentError);
      socket.off("agent:notification", onAgentNotification);
      socket.off("task:status", onTaskStatus);
      socket.off("task:created", onTaskCreated);
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:queued", onTaskQueued);
      socket.off("task:git_branch", onTaskGitBranch);
      socket.off("task:git_commit", onTaskGitCommit);
      socket.off("task:ready_to_commit", onTaskReadyToCommit);
      socket.off("task:pr_created", onTaskPRCreated);
      socket.off("task:pr_merged", onTaskPRMerged);
      socket.off("board:activity", onBoardActivity);
      socket.off("board:agent_cursor", onBoardAgentCursor);
      socket.off("devserver:output", onDevServerOutput);
      socket.off("devserver:status", onDevServerStatus);
      socket.off("notification:new", onNotificationNew);
    };
  }, [projectId]);

  return {
    sendMessage: (content: string, agentId?: string) => {
      if (!projectId || !socketRef.current) return;
      socketRef.current.emit("user:message", { projectId, content, agentId });
    },
    createTask: (description: string) => {
      if (!projectId || !socketRef.current) return;
      socketRef.current.emit("user:create_task", { projectId, description });
    },
    cancelTask: (taskId: string) => {
      socketRef.current?.emit("user:cancel_task", { taskId });
    },
    approveTask: (taskId: string) => {
      socketRef.current?.emit("user:approve_task", { taskId });
    },
    rejectTask: (taskId: string, feedback: string) => {
      socketRef.current?.emit("user:reject_task", { taskId, feedback });
    },
    executeTask: (taskId: string, agentId: string) => {
      socketRef.current?.emit("user:execute_task", { taskId, agentId });
    },
    commitTask: (taskId: string, message: string) => {
      socketRef.current?.emit("user:commit_task", { taskId, message });
    },
  };
}
