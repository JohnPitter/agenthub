import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Activity, FolderOpen, Users, Zap, CheckCircle2, ListTodo,
  UserCheck, Play, Eye, ThumbsUp, XCircle, MessageSquare, Clock, AlertTriangle, ArrowRightLeft, HelpCircle,
  ChevronLeft, ChevronRight, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api, formatRelativeTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import { CommandBar } from "../components/layout/command-bar";
import { SkeletonCard } from "../components/ui/skeleton";
import { AgentAvatar } from "../components/agents/agent-avatar";

interface ProjectAgent {
  id: string;
  name: string;
  color: string | null;
  avatar: string | null;
  role: string;
}

interface ProjectStats {
  projectId: string;
  taskCount: number;
  agentCount: number;
  lastActivity: string | null;
  agents: ProjectAgent[];
}

interface DashboardStats {
  totalProjects: number;
  activeAgents: number;
  totalTasks: number;
  runningTasks: number;
  reviewTasks: number;
  doneTasks: number;
  projectStats: ProjectStats[];
  weeklyCreated: number;
  weeklyCompleted: number;
  weeklyFailed: number;
  recentCompletedTasks: {
    id: string;
    title: string;
    priority: string;
    agentName: string;
    agentColor: string;
    agentAvatar: string | null;
    projectName: string;
    completedAt: string | null;
  }[];
  activityPage: number;
  activityPageSize: number;
  activityTotalCount: number;
  activityTotalPages: number;
  recentActivities: {
    id: string;
    action: string;
    detail: string | null;
    agentName: string;
    agentColor: string;
    agentAvatar: string | null;
    taskTitle: string;
    projectName: string;
    createdAt: string;
  }[];
}

const ACTION_MAP: Record<string, { icon: LucideIcon; key: string; color: string }> = {
  created: { icon: Plus, key: "actions.created", color: "text-brand" },
  assigned: { icon: UserCheck, key: "actions.assigned", color: "text-info" },
  agent_assigned: { icon: UserCheck, key: "actions.agent_assigned", color: "text-info" },
  started: { icon: Play, key: "actions.execution_started", color: "text-success" },
  completed: { icon: CheckCircle2, key: "actions.completed", color: "text-success" },
  review: { icon: Eye, key: "actions.sent_to_review", color: "text-purple" },
  approved: { icon: ThumbsUp, key: "actions.approved", color: "text-success" },
  rejected: { icon: XCircle, key: "actions.rejected", color: "text-danger" },
  changes_requested: { icon: MessageSquare, key: "actions.changes_requested", color: "text-warning" },
  queued: { icon: Clock, key: "actions.queued", color: "text-neutral-fg2" },
  agent_error: { icon: AlertTriangle, key: "actions.agent_error", color: "text-danger" },
  status_change: { icon: ArrowRightLeft, key: "actions.status_change", color: "text-neutral-fg2" },
};

const DEFAULT_ACTION = { icon: HelpCircle, key: "actions.unknown", color: "text-neutral-fg3" };

function ActionIcon({ action }: { action: string }) {
  const { icon: Icon, color } = ACTION_MAP[action] ?? DEFAULT_ACTION;

  return (
    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-bg3", color)}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function ActionLegendHeader() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{t("dashboard.action")}</span>
      <button
        className="text-neutral-fg-disabled hover:text-neutral-fg2 transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 rounded-lg bg-neutral-bg1 border border-stroke p-3 shadow-16 animate-scale-in w-[200px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">{t("dashboard.legend")}</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(ACTION_MAP).map(([actionKey, { icon: Icon, key, color }]) => (
              <div key={actionKey} className="flex items-center gap-2">
                <Icon className={cn("h-3 w-3 shrink-0", color)} />
                <span className="text-[11px] text-neutral-fg2">{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STAT_ITEMS = [
  { key: "totalProjects", i18nKey: "dashboard.totalProjects", icon: FolderOpen, color: "text-brand" },
  { key: "activeAgents", i18nKey: "dashboard.activeAgents", icon: Users, color: "text-purple" },
  { key: "runningTasks", i18nKey: "dashboard.runningTasks", icon: Zap, color: "text-warning" },
  { key: "reviewTasks", i18nKey: "taskStatus.review", icon: Activity, color: "text-purple" },
  { key: "doneTasks", i18nKey: "dashboard.doneTasks", icon: CheckCircle2, color: "text-success" },
] as const;

const MAX_DASHBOARD_PROJECTS = 8;

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useWorkspaceStore((s) => s.projects);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activityPage, setActivityPage] = useState(0);
  const ACTIVITY_PAGE_SIZE = 10;

  useEffect(() => {
    api<DashboardStats>(`/dashboard/stats?activityPage=${activityPage}&activityPageSize=${ACTIVITY_PAGE_SIZE}`)
      .then(setStats)
      .catch(() => {});
  }, [activityPage]);

  const displayProjects = projects.slice(0, MAX_DASHBOARD_PROJECTS);

  return (
    <div className="flex h-full flex-col">
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {t("dashboard.title")}
        </span>
      </CommandBar>

      <div className="flex-1 overflow-y-auto p-10">
        {/* Hero area */}
        <div className="relative mb-8">
          <div className="glow-orb glow-orb-brand w-[200px] h-[200px] -top-32 -left-20 opacity-40" />
          <div className="glow-orb glow-orb-purple w-[140px] h-[140px] -top-16 right-10 opacity-30" />
          <div className="relative">
            <h1 className="text-display text-gradient animate-fade-up">{t("dashboard.title")}</h1>
            <p className="text-subtitle mt-2 animate-fade-up stagger-1">
              {t("dashboard.projectCount", { count: projects.length })}
            </p>
          </div>
        </div>

        {/* Stat cards grid */}
        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-8 animate-fade-up stagger-2">
            {STAT_ITEMS.map((item) => {
              const Icon = item.icon;
              const value = stats[item.key as keyof DashboardStats] as number;
              return (
                <div key={item.key} className="stat-card flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-label">{t(item.i18nKey)}</span>
                    <Icon className={cn("h-4 w-4", item.color)} />
                  </div>
                  <span className={cn("text-[28px] font-bold tracking-tight", item.color)}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Projects summary (compact) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-heading !mb-0">{t("dashboard.totalProjects")}</h3>
            <Link
              to="/projects"
              className="flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand/80 transition-colors"
            >
              {t("dashboard.viewAllProjects")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!stats ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : displayProjects.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {displayProjects.map((project, i) => {
                const projectStat = stats.projectStats?.find((ps) => ps.projectId === project.id);
                const stack: string[] = project.stack
                  ? typeof project.stack === "string" ? JSON.parse(project.stack) : project.stack
                  : [];
                const icon = getStackIcon(stack);
                const agents = projectStat?.agents ?? [];
                return (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/project/${project.id}`)}
                    className={cn(
                      "group card-glow flex flex-col gap-3 p-4 text-left animate-fade-up",
                      `stagger-${Math.min(i + 1, 5)}`,
                    )}
                  >
                    {/* Header: icon + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple text-[16px] font-bold text-white">
                        {icon === "??" ? project.name.charAt(0).toUpperCase() : icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[13px] font-semibold text-neutral-fg1 truncate group-hover:text-brand transition-colors">
                          {project.name}
                        </h4>
                        {stack.length > 0 && (
                          <p className="text-[10px] text-neutral-fg3 truncate">{stack.slice(0, 3).join(" · ")}</p>
                        )}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-[11px]">
                      <div className="flex items-center gap-1">
                        <ListTodo className="h-3 w-3 text-neutral-fg3" />
                        <span className="font-semibold text-brand">{projectStat?.taskCount ?? 0}</span>
                        <span className="text-neutral-fg3">tasks</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-neutral-fg3" />
                        <span className="font-semibold text-purple">{projectStat?.agentCount ?? 0}</span>
                        <span className="text-neutral-fg3">agents</span>
                      </div>
                    </div>

                    {/* Agent avatars */}
                    {agents.length > 0 && (
                      <div className="flex items-center gap-1 -space-x-1">
                        {agents.slice(0, 5).map((agent) => (
                          <AgentAvatar
                            key={agent.id}
                            name={agent.name}
                            avatar={agent.avatar}
                            color={agent.color}
                            size="sm"
                            className="!h-6 !w-6 !text-[9px] !rounded-md ring-2 ring-neutral-bg1"
                          />
                        ))}
                        {agents.length > 5 && (
                          <span className="ml-2 text-[10px] font-medium text-neutral-fg3">
                            +{agents.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <Link
              to="/projects"
              className="card-glow flex items-center justify-center gap-2 p-6 text-[13px] font-medium text-neutral-fg3 hover:text-brand hover:border-brand/30 transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              {t("dashboard.noProjects")}
            </Link>
          )}
        </div>

        {/* Weekly Task Summary */}
        {stats && (
          <div className="mb-6 animate-fade-up stagger-3">
            <h3 className="section-heading mb-4">{t("dashboard.weeklySummary")}</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="stat-card flex flex-col gap-2">
                <span className="text-label">{t("dashboard.weeklyCreated")}</span>
                <span className="text-[24px] font-bold text-brand">{stats.weeklyCreated}</span>
              </div>
              <div className="stat-card flex flex-col gap-2">
                <span className="text-label">{t("dashboard.weeklyCompleted")}</span>
                <span className="text-[24px] font-bold text-success">{stats.weeklyCompleted}</span>
              </div>
              <div className="stat-card flex flex-col gap-2">
                <span className="text-label">{t("dashboard.weeklyFailed")}</span>
                <span className="text-[24px] font-bold text-danger">{stats.weeklyFailed}</span>
              </div>
            </div>

            {/* Recent completed tasks table */}
            {stats.recentCompletedTasks?.length > 0 && (
              <div className="card-glow mt-4 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stroke2 text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.completedTask")}</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.completedAgent")}</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.project")}</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("dashboard.completedWhen")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke2">
                    {stats.recentCompletedTasks.map((task) => (
                      <tr key={task.id} className="table-row">
                        <td className="px-5 py-3 text-[13px] font-medium text-neutral-fg1 truncate max-w-[200px]">
                          {task.title}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <AgentAvatar name={task.agentName} avatar={task.agentAvatar} color={task.agentColor} size="sm" className="!h-6 !w-6 !text-[9px] !rounded-md" />
                            <span className="text-[12px] text-neutral-fg2">{task.agentName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-neutral-fg3 truncate max-w-[140px]">
                          {task.projectName || "—"}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
                          {task.completedAt ? formatRelativeTime(task.completedAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recent activities */}
        {stats && (stats.recentActivities.length > 0 || activityPage > 0) && (
          <div className="mb-6 animate-fade-up stagger-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-heading !mb-0">
                {t("dashboard.recentActivity")}
              </h3>
              {stats.activityTotalCount > 0 && (
                <span className="text-[11px] text-neutral-fg3">
                  {t("dashboard.activityCount", { count: stats.activityTotalCount })}
                </span>
              )}
            </div>
            <div className="card-glow overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.agent")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.project")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                      <ActionLegendHeader />
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.task")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("dashboard.when")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke2">
                  {stats.recentActivities.map((activity) => (
                    <tr key={activity.id} className="table-row">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <AgentAvatar name={activity.agentName} avatar={activity.agentAvatar} color={activity.agentColor} size="sm" className="!h-8 !w-8 !text-[11px] !rounded-lg" />
                          <span className="text-[13px] font-medium text-neutral-fg1">{activity.agentName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] font-medium text-neutral-fg1 truncate max-w-[160px]">
                        {activity.projectName || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <ActionIcon action={activity.action} />
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-neutral-fg2 truncate max-w-[200px]">
                        {activity.taskTitle || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
                        {formatRelativeTime(activity.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination controls */}
              {stats.activityTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-stroke2 px-5 py-3">
                  <span className="text-[11px] text-neutral-fg3">
                    {t("dashboard.pageOf", { current: activityPage + 1, total: stats.activityTotalPages })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                      disabled={activityPage === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setActivityPage((p) => Math.min(stats.activityTotalPages - 1, p + 1))}
                      disabled={activityPage >= stats.activityTotalPages - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
