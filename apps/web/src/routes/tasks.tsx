import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  FolderOpen, Play, Clock, GitBranch,
  CheckCircle2, AlertTriangle, Zap, Terminal, FileCode,
  ArrowRightLeft, Eye, User, GripVertical, X, Tag,
  Calendar, Hash, DollarSign, Coins, Plus, FileDiff,
  LayoutGrid, Building2, RotateCcw,
} from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { PixelOffice } from "../components/pixel-office/pixel-office";
import { AgentAvatar } from "../components/agents/agent-avatar";
import { NewTaskDialog } from "../components/tasks/new-task-dialog";
import { SkeletonKanban } from "../components/ui/skeleton";
import { TaskChangesDialog } from "../components/tasks/task-changes-dialog";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useChatStore } from "../stores/chat-store";
import { useNotificationStore } from "../stores/notification-store";
import { getSocket } from "../lib/socket";
import { cn, api, formatRelativeTime, formatDate } from "../lib/utils";
import type {
  Task, TaskStatus, Agent,
  AgentStatusEvent, AgentToolUseEvent, TaskStatusEvent,
  BoardActivityEvent,
} from "@agenthub/shared";

/* ═══ Constants ═══ */

const KANBAN_COLUMNS: { status: TaskStatus; labelKey: string; dotColor: string; glowColor: string }[] = [
  { status: "created", labelKey: "taskStatus.backlog", dotColor: "bg-info", glowColor: "ring-info/30" },
  { status: "assigned", labelKey: "taskStatus.assigned", dotColor: "bg-brand", glowColor: "ring-brand/30" },
  { status: "in_progress", labelKey: "taskStatus.in_progress", dotColor: "bg-warning", glowColor: "ring-warning/30" },
  { status: "review", labelKey: "taskStatus.review", dotColor: "bg-purple", glowColor: "ring-purple/30" },
  { status: "done", labelKey: "taskStatus.done", dotColor: "bg-success", glowColor: "ring-success/30" },
  { status: "failed", labelKey: "taskStatus.failed", dotColor: "bg-danger", glowColor: "ring-danger/30" },
  { status: "cancelled", labelKey: "taskStatus.cancelled", dotColor: "bg-neutral-fg3", glowColor: "ring-neutral-fg3/30" },
];

const PRIORITY_STYLES: Record<string, { dot: string; labelKey: string }> = {
  urgent: { dot: "bg-danger", labelKey: "taskPriority.urgent" },
  high: { dot: "bg-danger", labelKey: "taskPriority.high" },
  medium: { dot: "bg-warning", labelKey: "taskPriority.medium" },
  low: { dot: "bg-info", labelKey: "taskPriority.low" },
};

const AGENT_STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; pulse?: boolean }> = {
  idle: { labelKey: "agentStatus.idle", color: "text-neutral-fg3", bg: "bg-neutral-fg-disabled" },
  running: { labelKey: "agentStatus.running", color: "text-success", bg: "bg-success", pulse: true },
  paused: { labelKey: "agentStatus.paused", color: "text-warning", bg: "bg-warning" },
  error: { labelKey: "agentStatus.error", color: "text-danger", bg: "bg-danger" },
  thinking: { labelKey: "agentStatus.thinking", color: "text-purple", bg: "bg-purple", pulse: true },
  working: { labelKey: "agentStatus.coding", color: "text-success", bg: "bg-success", pulse: true },
  busy: { labelKey: "agentStatus.running", color: "text-warning", bg: "bg-warning", pulse: true },
};

interface ActivityEntry {
  id: string;
  agentId: string;
  action: string;
  detail: string;
  timestamp: number;
}

/* ═══ Component ═══ */

export function TasksPage() {
  const { t } = useTranslation();
  const projects = useWorkspaceStore((s) => s.projects);
  const agents = useWorkspaceStore((s) => s.agents);
  const agentActivity = useChatStore((s) => s.agentActivity);
  const updateAgentActivity = useChatStore((s) => s.updateAgentActivity);
  const addToast = useNotificationStore((s) => s.addToast);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [changesTaskId, setChangesTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "office">("kanban");
  const activityEndRef = useRef<HTMLDivElement>(null);

  /* ─── Data fetch ─── */
  const fetchTasks = useCallback(async () => {
    try {
      const { tasks } = await api<{ tasks: Task[] }>("/tasks");
      setTasks(tasks);
    } catch { /* empty state */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  /* ─── Lookups ─── */
  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  /* ─── Real-time socket listeners ─── */
  useEffect(() => {
    const socket = getSocket();

    const onAgentStatus = (data: AgentStatusEvent) => {
      updateAgentActivity(data.agentId, {
        status: data.status,
        taskId: data.taskId,
        progress: data.progress ?? 0,
        lastActivity: Date.now(),
      });
      const agent = agentMap.get(data.agentId);
      if (agent) {
        pushActivity({
          agentId: data.agentId,
          action: `status:${data.status}`,
          detail: data.status === "running" ? "Iniciou execução" : data.status === "idle" ? "Ficou idle" : `Status → ${data.status}`,
        });
      }
    };

    const onAgentToolUse = (data: AgentToolUseEvent) => {
      const tool = data.tool;
      const input = data.input as Record<string, unknown> | undefined;
      const filePath = input?.file_path ?? input?.path ?? input?.filePath ?? "";
      updateAgentActivity(data.agentId, {
        currentTask: tool,
        currentFile: typeof filePath === "string" ? filePath.split("/").pop() ?? "" : "",
        lastActivity: Date.now(),
      });
      pushActivity({
        agentId: data.agentId,
        action: `tool:${tool}`,
        detail: typeof filePath === "string" && filePath ? `${tool} → ${filePath.split("/").pop()}` : tool,
      });
    };

    const onTaskStatus = (data: TaskStatusEvent) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === data.taskId ? { ...t, status: data.status as TaskStatus } : t)),
      );
      pushActivity({
        agentId: data.agentId ?? "",
        action: `task:${data.status}`,
        detail: `Task → ${data.status}`,
      });
    };

    const onTaskUpdated = (data: { task: unknown }) => {
      const task = data.task as Task | undefined;
      if (task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
        );
        // Also update selected task if it's the one being updated
        setSelectedTask((prev) =>
          prev && prev.id === task.id ? { ...prev, ...task } : prev,
        );
      }
    };

    const onTaskCreated = (data: { task: unknown }) => {
      const task = data.task as Task | undefined;
      if (task) {
        setTasks((prev) => {
          if (prev.some((t) => t.id === task.id)) return prev;
          return [task, ...prev];
        });
      }
    };

    const onBoardActivity = (data: BoardActivityEvent) => {
      pushActivity({
        agentId: data.agentId,
        action: data.action,
        detail: data.detail,
      });
    };

    socket.on("agent:status", onAgentStatus);
    socket.on("agent:tool_use", onAgentToolUse);
    socket.on("task:status", onTaskStatus);
    socket.on("task:updated", onTaskUpdated);
    socket.on("task:created", onTaskCreated);
    socket.on("board:activity", onBoardActivity);

    return () => {
      socket.off("agent:status", onAgentStatus);
      socket.off("agent:tool_use", onAgentToolUse);
      socket.off("task:status", onTaskStatus);
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:created", onTaskCreated);
      socket.off("board:activity", onBoardActivity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentMap]);

  const pushActivity = useCallback((entry: Omit<ActivityEntry, "id" | "timestamp">) => {
    setActivityLog((prev) => [
      ...prev.slice(-49),
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
    ]);
  }, []);

  // Auto-scroll activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog.length]);

  /* ─── Kanban helpers ─── */
  const getColumnTasks = useCallback(
    (status: TaskStatus) => {
      return tasks.filter((t) => {
        if (t.status !== status) return false;
        if (projectFilter && t.projectId !== projectFilter) return false;
        return true;
      });
    },
    [tasks, projectFilter],
  );

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    } catch (err) {
      fetchTasks(); // rollback
      if (err instanceof Error && err.message === "errorNoTechLead") {
        addToast("error", t("tasks.errorNoTechLead"));
      }
    }
  }, [tasks, fetchTasks]);

  /* ─── Counts ─── */
  const totalActive = tasks.filter((t) => t.status === "in_progress").length;
  const totalReview = tasks.filter((t) => t.status === "review").length;
  const runningAgents = agents.filter((a) => {
    const act = agentActivity.get(a.id);
    return act && act.status !== "idle";
  });

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <CommandBar><span className="text-[13px] font-semibold text-neutral-fg1">{t("tasks.title")}</span></CommandBar>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-x-auto px-6 pb-6 pt-4">
              <SkeletonKanban columns={7} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ═══ Command Bar ═══ */}
      <CommandBar>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            <span className="text-[13px] font-semibold text-neutral-fg1">{t("tasks.title")}</span>
          </div>

          {/* Live counters */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-md bg-warning-light px-2.5 py-1 text-[11px] font-semibold text-warning">
              <Play className="h-3 w-3" />
              {totalActive} {t("common.active").toLowerCase()}
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-purple-light px-2.5 py-1 text-[11px] font-semibold text-purple">
              <Eye className="h-3 w-3" />
              {totalReview} review
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-success-light px-2.5 py-1 text-[11px] font-semibold text-success">
              <Zap className="h-3 w-3" />
              {runningAgents.length} {t("dashboard.agents")}
            </span>
          </div>

          <span className="h-5 w-px bg-stroke" />

          {/* View toggle */}
          <div className="flex items-center rounded-full bg-neutral-bg2 p-1 border border-stroke">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-200",
                viewMode === "kanban"
                  ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand"
                  : "text-neutral-fg3 hover:text-neutral-fg1",
              )}
            >
              <LayoutGrid className="h-3 w-3" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("office")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-200",
                viewMode === "office"
                  ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand"
                  : "text-neutral-fg3 hover:text-neutral-fg1",
              )}
            >
              <Building2 className="h-3 w-3" />
              {t("pixelOffice.label")}
            </button>
          </div>

          <span className="h-5 w-px bg-stroke" />

          {projects.length > 1 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-md border border-stroke bg-neutral-bg2 px-3 py-1.5 text-[12px] text-neutral-fg2 outline-none transition-all focus:border-brand"
            >
              <option value="">{t("common.all")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-brand-hover shadow-brand"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tasks.newTask")}
          </button>
        </div>
      </CommandBar>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ Main: Agent Strip + Kanban ═══ */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* ─── Agent Status Strip ─── */}
          {agents.length > 0 && (
            <div className="shrink-0 border-b border-stroke2 bg-neutral-bg-subtle px-6 py-3">
              <div className="flex items-center gap-3 overflow-x-auto">
                {agents.filter((a) => a.isActive).map((agent) => {
                  const activity = agentActivity.get(agent.id);
                  const status = activity?.status ?? "idle";
                  const config = AGENT_STATUS_CONFIG[status] ?? AGENT_STATUS_CONFIG.idle;
                  const currentFile = activity?.currentFile;
                  const currentTool = activity?.currentTask;

                  return (
                    <div
                      key={agent.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-300 shrink-0",
                        status !== "idle"
                          ? "bg-neutral-bg1 border border-stroke shadow-2"
                          : "bg-transparent border border-transparent",
                        status === "running" && "animate-glow",
                      )}
                    >
                      <div className="relative">
                        <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-bg-subtle",
                            config.bg,
                            config.pulse && "animate-pulse",
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-neutral-fg1 truncate">{agent.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn("text-[10px] font-semibold", config.color)}>
                            {t(config.labelKey)}
                          </span>
                          {status !== "idle" && currentTool && (
                            <>
                              <span className="text-neutral-fg-disabled text-[10px]">·</span>
                              <span className="flex items-center gap-1 text-[10px] text-neutral-fg3 truncate max-w-[120px]">
                                <Terminal className="h-2.5 w-2.5 shrink-0" />
                                {currentTool}
                              </span>
                            </>
                          )}
                          {status !== "idle" && currentFile && (
                            <>
                              <span className="text-neutral-fg-disabled text-[10px]">·</span>
                              <span className="flex items-center gap-1 text-[10px] text-neutral-fg3 truncate max-w-[100px]">
                                <FileCode className="h-2.5 w-2.5 shrink-0" />
                                {currentFile}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── View content ─── */}
          {viewMode === "kanban" ? (
            <div className="flex-1 overflow-x-auto px-6 pb-6 pt-4">
              <div className="grid h-full grid-cols-7 gap-4" style={{ minWidth: 1400 }}>
                {KANBAN_COLUMNS.map((column) => {
                  const columnTasks = getColumnTasks(column.status);
                  const isOver = dragOverColumn === column.status;

                  return (
                    <div
                      key={column.status}
                      onDragOver={(e) => handleDragOver(e, column.status)}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(e) => handleDrop(e, column.status)}
                      className={cn(
                        "flex flex-col rounded-xl transition-all duration-200",
                        isOver && `ring-2 ${column.glowColor} bg-brand-light/5`,
                      )}
                    >
                      {/* Column header */}
                      <div className="rounded-t-xl px-4 py-3 border-b border-stroke2 bg-neutral-bg2/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", column.dotColor)} />
                            <span className="text-[13px] font-semibold text-neutral-fg1">{t(column.labelKey)}</span>
                          </div>
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
                            {columnTasks.length}
                          </span>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
                        {columnTasks.length > 0 ? (
                          columnTasks.map((task) => (
                            <WarRoomCard
                              key={task.id}
                              task={task}
                              agentMap={agentMap}
                              projectMap={projectMap}
                              agentActivity={agentActivity}
                              onDragStart={handleDragStart}
                              onClick={setSelectedTask}
                            />
                          ))
                        ) : (
                          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-stroke py-8">
                            <p className="text-[11px] text-neutral-fg-disabled">{t("common.empty")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <PixelOffice
              tasks={tasks}
              projectFilter={projectFilter}
              agentMap={agentMap}
              agentActivity={agentActivity}
              onTaskClick={setSelectedTask}
            />
          )}
        </div>

        {/* ═══ Right: Live Activity Feed ═══ */}
        <div className="w-[280px] shrink-0 border-l border-stroke2 bg-neutral-bg-subtle flex flex-col">
          <div className="px-5 pt-5 pb-3 border-b border-stroke2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                {t("dashboard.recentActivity")}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {activityLog.length === 0 && (
              <p className="py-8 text-center text-[11px] text-neutral-fg-disabled">
                {t("dashboard.noActivities")}
              </p>
            )}

            {activityLog.map((entry) => {
              const agent = agentMap.get(entry.agentId);
              const icon = getActivityIcon(entry.action);
              const ago = getTimeAgo(entry.timestamp);

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 animate-fade-up transition-colors hover:bg-neutral-bg-hover"
                >
                  <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md", icon.bgCls)}>
                    <icon.Icon className={cn("h-3 w-3", icon.colorCls)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-snug text-neutral-fg2">
                      <span className="font-semibold text-neutral-fg1">{agent?.name ?? "Sistema"}</span>
                      {" "}
                      <span>{entry.detail}</span>
                    </p>
                    <p className="mt-0.5 text-[9px] text-neutral-fg-disabled">{ago}</p>
                  </div>
                </div>
              );
            })}
            <div ref={activityEndRef} />
          </div>
        </div>
      </div>

      {/* ═══ Task Detail Panel (slide-over) ═══ */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          agentMap={agentMap}
          projectMap={projectMap}
          agentActivity={agentActivity}
          onClose={() => setSelectedTask(null)}
          onViewChanges={setChangesTaskId}
          onRetry={(taskId, agentId) => {
            getSocket().emit("user:execute_task", { taskId, agentId });
            setSelectedTask(null);
          }}
        />
      )}

      {/* ═══ New Task Dialog ═══ */}
      {showNewTask && (
        <NewTaskDialog
          projects={projects}
          agents={agents}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev]);
          }}
          onClose={() => setShowNewTask(false)}
        />
      )}

      {/* ═══ Changes Dialog ═══ */}
      {changesTaskId && (
        <TaskChangesDialog
          taskId={changesTaskId}
          onClose={() => setChangesTaskId(null)}
        />
      )}
    </div>
  );
}

/* ═══ Task Detail Panel ═══ */

const STATUS_LABELS: Record<string, { labelKey: string; color: string; bg: string }> = {
  created: { labelKey: "taskStatus.backlog", color: "text-info", bg: "bg-info-light" },
  assigned: { labelKey: "taskStatus.assigned", color: "text-brand", bg: "bg-brand-light" },
  in_progress: { labelKey: "taskStatus.in_progress", color: "text-warning", bg: "bg-warning-light" },
  review: { labelKey: "taskStatus.review", color: "text-purple", bg: "bg-purple-light" },
  done: { labelKey: "taskStatus.done", color: "text-success", bg: "bg-success-light" },
  cancelled: { labelKey: "taskStatus.cancelled", color: "text-neutral-fg3", bg: "bg-neutral-bg2" },
  failed: { labelKey: "taskStatus.failed", color: "text-danger", bg: "bg-danger-light" },
  changes_requested: { labelKey: "actions.changes_requested", color: "text-warning", bg: "bg-warning-light" },
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug",
  refactor: "Refactor",
  test: "Test",
  docs: "Docs",
};

interface TaskDetailPanelProps {
  task: Task;
  agentMap: Map<string, Agent>;
  projectMap: Map<string, string>;
  agentActivity: Map<string, { status: string; currentTask?: string; currentFile?: string; lastActivity: number; progress: number; taskId?: string }>;
  onClose: () => void;
  onViewChanges?: (taskId: string) => void;
  onRetry?: (taskId: string, agentId: string) => void;
}

function TaskDetailPanel({ task, agentMap, projectMap, agentActivity, onClose, onViewChanges, onRetry }: TaskDetailPanelProps) {
  const { t } = useTranslation();
  const [descExpanded, setDescExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const [specExpanded, setSpecExpanded] = useState(false);
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
  const statusInfo = STATUS_LABELS[task.status] ?? STATUS_LABELS.created;
  const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
  const activity = task.assignedAgentId ? agentActivity.get(task.assignedAgentId) : null;
  const isAgentWorking = activity && activity.status !== "idle" && activity.taskId === task.id;
  const projectName = projectMap.get(task.projectId);
  const canViewChanges = task.status === "in_progress" || task.status === "review" || task.status === "done" || task.status === "changes_requested";

  const DESC_LIMIT = 200;
  const descIsLong = !!task.description && task.description.length > DESC_LIMIT;
  const RESULT_LIMIT = 300;
  const resultIsLong = !!task.result && task.result.length > RESULT_LIMIT;
  const SPEC_LIMIT = 200;
  const specIsLong = !!task.parsedSpec && task.parsedSpec.length > SPEC_LIMIT;

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
              {t(statusInfo.labelKey)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", priority.dot)} />
              <span className="text-[10px] font-semibold text-neutral-fg3">{t(priority.labelKey)}</span>
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
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Title */}
          <h2 className="text-[16px] font-semibold text-neutral-fg1 leading-snug">{task.title}</h2>

          {/* View Changes Button — prominent at top */}
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
              Retentar Task
            </button>
          )}

          {/* View Project Button */}
          <Link
            to={`/project/${task.projectId}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stroke2 bg-neutral-bg2/50 px-4 py-2.5 text-[12px] font-semibold text-neutral-fg2 transition-all hover:bg-neutral-bg-hover hover:text-neutral-fg1 hover:border-stroke"
          >
            <FolderOpen className="h-4 w-4" />
            {t("tasks.viewProject")}
          </Link>

          {/* Live agent working indicator */}
          {isAgentWorking && activity && (
            <div className="flex items-center gap-3 rounded-lg bg-brand-light/50 border border-brand/20 px-3 py-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-brand">{t("agentStatus.running")}</p>
                <p className="text-[10px] text-brand/80 truncate">
                  {activity.currentTask ?? t("agentStatus.running")}
                  {activity.currentFile ? ` · ${activity.currentFile}` : ""}
                </p>
              </div>
            </div>
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
            {/* Project */}
            {projectName && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("project.overview")}</span>
                </div>
                <Link
                  to={`/project/${task.projectId}`}
                  className="text-[11px] font-semibold text-brand hover:underline"
                >
                  {projectName}
                </Link>
              </div>
            )}

            {/* Agent */}
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-neutral-fg3">
                <User className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{t("tasks.assignedTo")}</span>
              </div>
              {agent ? (
                <div className="flex items-center gap-1.5">
                  <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-5 !w-5 !text-[8px]" />
                  <span className="text-[11px] font-semibold text-neutral-fg1">{agent.name}</span>
                </div>
              ) : (
                <span className="text-[11px] text-neutral-fg-disabled">{t("tasks.noneAssigned")}</span>
              )}
            </div>

            {/* Category */}
            {task.category && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Category</span>
                </div>
                <span className="rounded bg-neutral-bg2 px-2 py-0.5 text-[10px] font-semibold text-neutral-fg2">
                  {CATEGORY_LABELS[task.category] ?? task.category}
                </span>
              </div>
            )}

            {/* Branch */}
            {task.branch && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("tasks.branch")}</span>
                </div>
                <span className="rounded bg-purple-light px-2 py-0.5 text-[10px] font-semibold text-purple-dark">
                  {task.branch}
                </span>
              </div>
            )}

            {/* Cost */}
            {task.costUsd && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Cost</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-fg1">${task.costUsd}</span>
              </div>
            )}

            {/* Tokens */}
            {task.tokensUsed && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Tokens</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-fg1">
                  {task.tokensUsed.toLocaleString("pt-BR")}
                </span>
              </div>
            )}

            {/* Created */}
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-neutral-fg3">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{t("tasks.createdAt")}</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-fg1">{formatDate(task.createdAt)}</span>
            </div>

            {/* Completed */}
            {task.completedAt && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{t("taskStatus.done")}</span>
                </div>
                <span className="text-[11px] font-semibold text-success">{formatDate(task.completedAt)}</span>
              </div>
            )}

            {/* Session ID */}
            {task.sessionId && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-neutral-fg3">
                  <Hash className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Session</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-fg3 truncate max-w-[160px]">{task.sessionId}</span>
              </div>
            )}
          </div>

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

          {/* Parsed Spec — truncated with expand */}
          {task.parsedSpec && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-1.5">Spec</h3>
              <div className="rounded-lg bg-neutral-bg2 border border-stroke2 p-3 max-h-[150px] overflow-y-auto">
                <p className="text-[11px] text-neutral-fg2 leading-relaxed whitespace-pre-wrap">
                  {specIsLong && !specExpanded
                    ? task.parsedSpec.slice(0, SPEC_LIMIT) + "..."
                    : task.parsedSpec}
                </p>
              </div>
              {specIsLong && (
                <button
                  onClick={() => setSpecExpanded(!specExpanded)}
                  className="mt-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {specExpanded ? t("common.less") : t("common.more")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ War Room Task Card ═══ */

interface WarRoomCardProps {
  task: Task;
  agentMap: Map<string, Agent>;
  projectMap: Map<string, string>;
  agentActivity: Map<string, { status: string; currentTask?: string; currentFile?: string; lastActivity: number; progress: number; taskId?: string }>;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onClick: (task: Task) => void;
}

function WarRoomCard({ task, agentMap, projectMap, agentActivity, onDragStart, onClick }: WarRoomCardProps) {
  const { t } = useTranslation();
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
  const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
  const activity = task.assignedAgentId ? agentActivity.get(task.assignedAgentId) : null;
  const isAgentWorking = activity && activity.status !== "idle" && activity.taskId === task.id;
  const projectName = projectMap.get(task.projectId);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className={cn(
        "group relative cursor-pointer rounded-lg bg-neutral-bg1 p-3.5 shadow-2 border transition-all duration-300",
        isAgentWorking
          ? "border-brand/30 shadow-glow"
          : "border-stroke hover:shadow-4",
      )}
    >
      {/* Working indicator */}
      {isAgentWorking && (
        <div className="absolute -top-px left-3 right-3 h-[2px] rounded-b-full bg-gradient-to-r from-brand via-purple to-brand" style={{ animation: "gradient 3s ease infinite", backgroundSize: "200% 200%" }} />
      )}

      {/* Priority + project */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-fg3">
            {t(priority.labelKey)}
          </span>
        </div>
        {projectName && (
          <Link
            to={`/project/${task.projectId}/tasks`}
            className="flex items-center gap-1.5 rounded-md bg-brand-light px-2 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <FolderOpen className="h-3 w-3" />
            <span className="truncate max-w-[100px]">{projectName}</span>
          </Link>
        )}
        <GripVertical className="h-3.5 w-3.5 text-neutral-fg-disabled opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Title */}
      <p className="text-[13px] font-semibold text-neutral-fg1 leading-snug line-clamp-2 mb-2">
        {task.title}
      </p>

      {/* Agent working indicator */}
      {isAgentWorking && activity && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-brand-light/50 px-2.5 py-1.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <span className="text-[10px] font-medium text-brand truncate">
            {activity.currentTask ?? t("agentStatus.running")}
            {activity.currentFile ? ` · ${activity.currentFile}` : ""}
          </span>
        </div>
      )}

      {/* Git branch */}
      {task.branch && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-purple-light px-2.5 py-1 w-fit">
          <GitBranch className="h-3 w-3 text-purple-dark" />
          <span className="text-[10px] font-semibold text-purple-dark truncate max-w-[120px]">{task.branch}</span>
        </div>
      )}

      {/* Footer: Agent + time + execute */}
      <div className="flex items-center justify-between pt-2 border-t border-stroke">
        {agent ? (
          <div className="flex items-center gap-2">
            <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-5 !w-5 !text-[8px]" />
            <span className="text-[10px] font-semibold text-neutral-fg2 truncate max-w-[80px]">{agent.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-neutral-fg-disabled">
            <User className="h-3 w-3" />
            <span className="text-[10px]">{t("board.unassigned")}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-neutral-fg-disabled">
          <Clock className="h-2.5 w-2.5" />
          <span className="text-[9px]">{formatRelativeTime(task.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/* ═══ Helpers ═══ */

function getActivityIcon(action: string): { Icon: React.FC<{ className?: string }>; bgCls: string; colorCls: string } {
  if (action.startsWith("status:running") || action.startsWith("status:working"))
    return { Icon: Play, bgCls: "bg-success-light", colorCls: "text-success" };
  if (action.startsWith("status:error"))
    return { Icon: AlertTriangle, bgCls: "bg-danger-light", colorCls: "text-danger" };
  if (action.startsWith("status:idle"))
    return { Icon: CheckCircle2, bgCls: "bg-neutral-bg2", colorCls: "text-neutral-fg3" };
  if (action.startsWith("status:thinking") || action.startsWith("status:paused"))
    return { Icon: Eye, bgCls: "bg-purple-light", colorCls: "text-purple" };
  if (action.startsWith("tool:"))
    return { Icon: Terminal, bgCls: "bg-brand-light", colorCls: "text-brand" };
  if (action.startsWith("task:done"))
    return { Icon: CheckCircle2, bgCls: "bg-success-light", colorCls: "text-success" };
  if (action.startsWith("task:"))
    return { Icon: ArrowRightLeft, bgCls: "bg-info-light", colorCls: "text-info" };
  return { Icon: Zap, bgCls: "bg-neutral-bg2", colorCls: "text-neutral-fg3" };
}

function getTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h`;
}
