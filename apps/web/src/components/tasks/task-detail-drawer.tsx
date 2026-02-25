import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Clock, User, GitBranch, CheckCircle2, Tag,
  Calendar, FileDiff, DollarSign, Coins, Hash, RotateCcw,
} from "lucide-react";
import { cn, formatDate, formatRelativeTime, api } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import { SubtaskTree } from "./subtask-tree";
import { CreateSubtaskDialog } from "./create-subtask-dialog";
import type { Task, Agent } from "@agenthub/shared";

function getStatusLabels(t: (key: string) => string): Record<string, { label: string; color: string; bg: string }> {
  return {
    created: { label: t("taskStatus.created"), color: "text-info", bg: "bg-info-light" },
    assigned: { label: t("taskStatus.assigned"), color: "text-brand", bg: "bg-brand-light" },
    in_progress: { label: t("taskStatus.inProgress"), color: "text-warning", bg: "bg-warning-light" },
    review: { label: t("taskStatus.review"), color: "text-purple", bg: "bg-purple-light" },
    done: { label: t("taskStatus.done"), color: "text-success", bg: "bg-success-light" },
    cancelled: { label: t("taskStatus.cancelled"), color: "text-neutral-fg3", bg: "bg-neutral-bg2" },
    failed: { label: t("taskStatus.failed"), color: "text-danger", bg: "bg-danger-light" },
    changes_requested: { label: t("taskStatus.changesRequested"), color: "text-warning", bg: "bg-warning-light" },
  };
}

function getPriorityStyles(t: (key: string) => string): Record<string, { dot: string; label: string }> {
  return {
    urgent: { dot: "bg-danger", label: t("taskPriority.urgent") },
    high: { dot: "bg-danger", label: t("taskPriority.high") },
    medium: { dot: "bg-warning", label: t("taskPriority.medium") },
    low: { dot: "bg-info", label: t("taskPriority.low") },
  };
}

interface TaskDetailDrawerProps {
  task: Task;
  agents: Agent[];
  onClose: () => void;
  onViewChanges?: (taskId: string) => void;
  onRetry?: (taskId: string, agentId: string) => void;
}

export function TaskDetailDrawer({ task, agents, onClose, onViewChanges, onRetry }: TaskDetailDrawerProps) {
  const { t } = useTranslation();
  const [descExpanded, setDescExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [showCreateSubtask, setShowCreateSubtask] = useState(false);

  const fetchSubtasks = useCallback(async () => {
    try {
      const { subtasks: data } = await api<{ subtasks: Task[] }>(`/tasks/${task.id}/subtasks`);
      setSubtasks(data);
    } catch {
      // silently fail
    }
  }, [task.id]);

  useEffect(() => {
    fetchSubtasks();
  }, [fetchSubtasks]);
  const statusLabels = getStatusLabels(t);
  const priorityStyles = getPriorityStyles(t);
  const statusInfo = statusLabels[task.status] ?? statusLabels.created;
  const priority = priorityStyles[task.priority] ?? priorityStyles.medium;
  const agent = task.assignedAgentId ? agents.find((a) => a.id === task.assignedAgentId) : null;
  const canViewChanges = task.status === "in_progress" || task.status === "review" || task.status === "done" || task.status === "changes_requested";
  const DESC_LIMIT = 200;
  const descIsLong = !!task.description && task.description.length > DESC_LIMIT;
  const RESULT_LIMIT = 300;
  const resultIsLong = !!task.result && task.result.length > RESULT_LIMIT;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-neutral-bg1 shadow-16 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideInRight 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold", statusInfo.bg, statusInfo.color)}>
              {statusInfo.label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", priority.dot)} />
              <span className="text-[10px] font-semibold text-neutral-fg3">{priority.label}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <h2 className="text-[16px] font-semibold text-neutral-fg1 leading-snug">{task.title}</h2>

          {/* View Changes button — prominent at top */}
          {onViewChanges && canViewChanges && (
            <button
              onClick={() => onViewChanges(task.id)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand/20 bg-brand-light/50 px-4 py-2.5 text-[12px] font-semibold text-brand transition-all hover:bg-brand-light hover:border-brand/40"
            >
              <FileDiff className="h-4 w-4" />
              {t("tasks.viewChanges")}
            </button>
          )}

          {/* Retry button for failed tasks */}
          {onRetry && task.status === "failed" && task.assignedAgentId && (
            <button
              onClick={() => onRetry(task.id, task.assignedAgentId!)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/20 bg-danger-light/50 px-4 py-2.5 text-[12px] font-semibold text-danger transition-all hover:bg-danger-light hover:border-danger/40"
            >
              <RotateCcw className="h-4 w-4" />
              {t("tasks.retry")}
            </button>
          )}

          {/* Description — truncated with expand */}
          {task.description && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-1.5">{t("tasks.description")}</h3>
              <p className="text-[12px] text-neutral-fg2 leading-relaxed whitespace-pre-wrap">
                {descIsLong && !descExpanded
                  ? task.description.slice(0, DESC_LIMIT) + "..."
                  : task.description}
              </p>
              {descIsLong && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {descExpanded ? t("common.less") : t("common.more")}
                </button>
              )}
            </div>
          )}

          {/* Details grid */}
          <div className="rounded-lg border border-stroke2 overflow-hidden divide-y divide-stroke2">
            {/* Agent */}
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-neutral-fg3">
                <User className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{t("chat.agent")}</span>
              </div>
              {agent ? (
                <div className="flex items-center gap-1.5">
                  <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-5 !w-5 !text-[9px] !rounded" />
                  <span className="text-[11px] font-semibold text-neutral-fg1">{agent.name}</span>
                </div>
              ) : (
                <span className="text-[11px] text-neutral-fg-disabled">{t("tasks.unassigned")}</span>
              )}
            </div>

            {/* Category */}
            {task.category && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("tasks.category")}</span>
                </div>
                <span className="rounded bg-neutral-bg2 px-2 py-0.5 text-[10px] font-semibold text-neutral-fg2">{task.category}</span>
              </div>
            )}

            {/* Branch */}
            {task.branch && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Branch</span>
                </div>
                <span className="rounded bg-purple-light px-2 py-0.5 text-[10px] font-semibold text-purple-dark">{task.branch}</span>
              </div>
            )}

            {/* Cost */}
            {(task as any).costUsd && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("tasks.cost")}</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-fg1">${(task as any).costUsd}</span>
              </div>
            )}

            {/* Tokens */}
            {(task as any).tokensUsed && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Tokens</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-fg1">{(task as any).tokensUsed?.toLocaleString("pt-BR")}</span>
              </div>
            )}

            {/* Created */}
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-neutral-fg3">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{t("tasks.created")}</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-fg1">{formatDate(task.createdAt)}</span>
            </div>

            {/* Updated */}
            {task.updatedAt && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("tasks.updated")}</span>
                </div>
                <span className="text-[11px] text-neutral-fg2">{formatRelativeTime(task.updatedAt)}</span>
              </div>
            )}

            {/* Completed */}
            {(task as any).completedAt && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("taskStatus.done")}</span>
                </div>
                <span className="text-[11px] font-semibold text-success">{formatDate((task as any).completedAt)}</span>
              </div>
            )}

            {/* Session */}
            {(task as any).sessionId && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Hash className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("tasks.session")}</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-fg3 truncate max-w-[160px]">{(task as any).sessionId}</span>
              </div>
            )}
          </div>

          {/* Subtasks */}
          {!task.parentTaskId && (
            <SubtaskTree
              parentTask={task}
              subtasks={subtasks}
              agents={agents}
              onCreateSubtask={() => setShowCreateSubtask(true)}
              onClickTask={() => {}}
            />
          )}

          {/* Result — truncated with expand */}
          {task.result && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-1.5">{t("tasks.result")}</h3>
              <div className="rounded-lg bg-neutral-bg2 border border-stroke2 p-3 max-h-[200px] overflow-y-auto">
                <p className="text-[11px] text-neutral-fg1 leading-relaxed whitespace-pre-wrap font-mono">
                  {resultIsLong && !resultExpanded
                    ? task.result.slice(0, RESULT_LIMIT) + "..."
                    : task.result}
                </p>
              </div>
              {resultIsLong && (
                <button
                  onClick={() => setResultExpanded(!resultExpanded)}
                  className="mt-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {resultExpanded ? t("common.less") : t("common.more")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateSubtask && (
        <CreateSubtaskDialog
          parentTaskId={task.id}
          projectId={task.projectId}
          onCreated={(newTask) => {
            setSubtasks((prev) => [...prev, newTask]);
            setShowCreateSubtask(false);
          }}
          onClose={() => setShowCreateSubtask(false)}
        />
      )}
    </div>
  );
}
