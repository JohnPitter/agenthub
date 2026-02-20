import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, Users, ListTodo, Settings, Zap, FolderOpen, ChevronLeft, ChevronRight, CheckCircle2, XCircle, BookOpen } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { useUsageStore } from "../../stores/usage-store";
import { AgentAvatar } from "../agents/agent-avatar";
import { TeamSwitcher } from "../teams/team-switcher";
import { useTeamStore } from "../../stores/team-store";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Agent, Project } from "@agenthub/shared";
import { getStackIcon } from "@agenthub/shared";

const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/projects", icon: FolderOpen, labelKey: "nav.projects" },
  { to: "/agents", icon: Users, labelKey: "nav.agents" },
  { to: "/tasks", icon: ListTodo, labelKey: "nav.tasks" },
  { to: "/docs", icon: BookOpen, labelKey: "nav.docs" },
  { to: "/analytics", icon: BarChart3, labelKey: "nav.analytics" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
];

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: "bg-neutral-fg-disabled",
  running: "bg-success",
  paused: "bg-warning",
  error: "bg-danger",
  busy: "bg-warning",
  thinking: "bg-info",
  working: "bg-success",
};

// Plan display labels
const PLAN_LIMITS: Record<string, { label: string }> = {
  free: { label: "Free" },
  pro: { label: "Pro" },
  max_5x: { label: "Max 5x" },
  max_20x: { label: "Max 20x" },
  team: { label: "Team" },
  enterprise: { label: "Enterprise" },
};

/**
 * Map subscriptionType from the Anthropic AccountInfo to our plan key.
 * The SDK returns strings like "pro", "max", "max_5x", "max_20x",
 * "team", "enterprise", "free", or variations with capitalization.
 */
function detectPlan(subscriptionType: string | null | undefined): string {
  if (!subscriptionType) return "pro";
  const sub = subscriptionType.toLowerCase().trim();

  // Exact matches
  if (sub in PLAN_LIMITS) return sub;

  // "max" without qualifier → max_5x (the base Max plan)
  if (sub === "max") return "max_5x";

  // Partial matches: "claude_max_5x", "claude-pro", etc.
  if (sub.includes("max_20x") || sub.includes("max20x") || sub.includes("20x")) return "max_20x";
  if (sub.includes("max_5x") || sub.includes("max5x") || sub.includes("5x")) return "max_5x";
  if (sub.includes("max")) return "max_5x";
  if (sub.includes("enterprise")) return "enterprise";
  if (sub.includes("team")) return "team";
  if (sub.includes("pro")) return "pro";
  if (sub.includes("free")) return "free";

  return "pro";
}

function formatResetTime(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const reset = new Date(resetsAt);
  const now = new Date();
  const diffMs = reset.getTime() - now.getTime();
  if (diffMs <= 0) return "renovando...";

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;

  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

function UsageBar({ label, utilization, resetsAt, color }: {
  label: string;
  utilization: number;
  resetsAt: string | null;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, utilization));
  const isHigh = pct >= 80;
  const barColor = isHigh ? "bg-danger" : color;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-neutral-fg2">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] font-semibold tabular-nums",
            isHigh ? "text-danger" : "text-neutral-fg1"
          )}>
            {Math.round(pct)}%
          </span>
          {resetsAt && (
            <span className="text-[9px] text-neutral-fg-disabled tabular-nums">
              {formatResetTime(resetsAt)}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function UsageWidget({ collapsed }: { collapsed: boolean }) {
  const account = useUsageStore((s) => s.account);
  const connection = useUsageStore((s) => s.connection);
  const limits = useUsageStore((s) => s.limits);
  const openaiConnection = useUsageStore((s) => s.openaiConnection);
  const openaiUsage = useUsageStore((s) => s.openaiUsage);
  const fetchAccount = useUsageStore((s) => s.fetchAccount);
  const fetchConnection = useUsageStore((s) => s.fetchConnection);
  const fetchLimits = useUsageStore((s) => s.fetchLimits);
  const fetchOpenAIConnection = useUsageStore((s) => s.fetchOpenAIConnection);
  const fetchOpenAIUsage = useUsageStore((s) => s.fetchOpenAIUsage);

  useEffect(() => {
    fetchAccount();
    fetchConnection();
    fetchLimits();
    fetchOpenAIConnection();
    fetchOpenAIUsage();
    const interval = setInterval(() => {
      useUsageStore.setState({ limitsLastFetched: null, openaiUsageLastFetched: null });
      fetchLimits();
      fetchOpenAIUsage();
    }, 120_000);
    return () => clearInterval(interval);
  }, [fetchAccount, fetchConnection, fetchLimits, fetchOpenAIConnection, fetchOpenAIUsage]);

  const connectionLoading = !useUsageStore((s) => s.connectionFetched);
  const accountLoading = !useUsageStore((s) => s.accountFetched);
  const limitsLoading = !useUsageStore((s) => s.limitsFetched);
  const openaiLoading = !useUsageStore((s) => s.openaiConnectionFetched);

  const connected = connection?.connected ?? false;
  const plan = detectPlan(account?.subscriptionType ?? connection?.subscriptionType);
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.pro;

  const isInitialLoading = connectionLoading;

  if (collapsed) {
    return (
      <div
        className="mx-auto mt-6 mb-2 flex flex-col items-center"
        title={isInitialLoading ? "Carregando..." : connected ? `Plano: ${limit.label}` : "CLI desconectado"}
      >
        {isInitialLoading ? (
          <div className="h-5 w-5 rounded-full bg-neutral-bg1 animate-pulse" />
        ) : connected ? (
          <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={1.8} />
        ) : (
          <XCircle className="h-5 w-5 text-neutral-fg-disabled" strokeWidth={1.8} />
        )}
      </div>
    );
  }

  // Initial loading — full skeleton
  if (isInitialLoading) {
    return (
      <div className="mx-7 mt-6 rounded-xl border border-stroke2 bg-neutral-bg3/50 p-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-full bg-neutral-bg1" />
            <div className="h-3 w-20 rounded bg-neutral-bg1" />
          </div>
          <div className="h-4 w-12 rounded-md bg-neutral-bg1" />
        </div>
        {/* Email skeleton */}
        <div className="h-2.5 w-36 rounded bg-neutral-bg1 mb-3" />
        {/* Usage bars skeleton */}
        <div className="flex flex-col gap-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="h-2.5 w-16 rounded bg-neutral-bg1" />
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-8 rounded bg-neutral-bg1" />
                  <div className="h-2 w-5 rounded bg-neutral-bg1" />
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-bg1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Not connected state
  if (!connected) {
    return (
      <Link
        to="/settings"
        className="mx-7 mt-6 rounded-xl border border-dashed border-stroke2 bg-neutral-bg3/30 p-4 block hover:border-brand/40 hover:bg-brand-light/5 transition-all group"
      >
        <div className="flex items-center gap-2.5 mb-2">
          <XCircle className="h-4 w-4 text-neutral-fg-disabled group-hover:text-danger" strokeWidth={1.8} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg-disabled group-hover:text-neutral-fg3">CLI</span>
        </div>
        <p className="text-[11px] text-neutral-fg3 leading-relaxed">
          Claude desconectado
        </p>
        <p className="mt-1 text-[10px] text-brand font-medium">
          Conectar &rarr;
        </p>
      </Link>
    );
  }

  // Connected state with real usage bars
  return (
    <div className="mx-7 mt-6 rounded-xl border border-stroke2 bg-neutral-bg3/50 p-4">
      {/* Header: connected + plan */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={2} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Claude</span>
        </div>
        {accountLoading ? (
          <div className="h-4 w-12 rounded-md bg-neutral-bg1 animate-pulse" />
        ) : (
          <span className="rounded-md bg-brand-light px-1.5 py-0.5 text-[9px] font-bold text-brand uppercase tracking-wider">{limit.label}</span>
        )}
      </div>

      {/* Account email */}
      {accountLoading ? (
        <div className="h-2.5 w-36 rounded bg-neutral-bg1 animate-pulse mb-3" />
      ) : (account?.email ?? connection?.email) ? (
        <p className="text-[10px] text-neutral-fg-disabled truncate mb-3">
          {account?.email ?? connection?.email}
        </p>
      ) : null}

      {/* Real usage bars */}
      {limitsLoading || !limits ? (
        <div className="flex flex-col gap-2.5 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="h-2.5 w-16 rounded bg-neutral-bg1" />
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-8 rounded bg-neutral-bg1" />
                  <div className="h-2 w-5 rounded bg-neutral-bg1" />
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-bg1" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {limits.fiveHour && (
            <UsageBar
              label="Sessão atual"
              utilization={limits.fiveHour.utilization}
              resetsAt={limits.fiveHour.resetsAt}
              color="bg-brand"
            />
          )}
          {limits.sevenDay && (
            <UsageBar
              label="Semanal"
              utilization={limits.sevenDay.utilization}
              resetsAt={limits.sevenDay.resetsAt}
              color="bg-purple"
            />
          )}
          {limits.sevenDaySonnet && (
            <UsageBar
              label="Sonnet"
              utilization={limits.sevenDaySonnet.utilization}
              resetsAt={limits.sevenDaySonnet.resetsAt}
              color="bg-info"
            />
          )}
        </div>
      )}

      {/* OpenAI section */}
      {openaiLoading ? (
        <div className="mt-2.5 pt-2.5 border-t border-stroke2 animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded-full bg-neutral-bg1" />
              <div className="h-3 w-14 rounded bg-neutral-bg1" />
            </div>
            <div className="h-4 w-10 rounded-md bg-neutral-bg1" />
          </div>
          <div className="h-2.5 w-32 rounded bg-neutral-bg1 mb-2" />
          <div className="flex flex-col gap-2.5">
            {[1, 2].map((i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="h-2.5 w-14 rounded bg-neutral-bg1" />
                  <div className="h-2.5 w-8 rounded bg-neutral-bg1" />
                </div>
                <div className="h-1.5 w-full rounded-full bg-neutral-bg1" />
              </div>
            ))}
          </div>
        </div>
      ) : openaiConnection?.connected ? (
        <div className="mt-2.5 pt-2.5 border-t border-stroke2">
          {/* OpenAI header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={2} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">OpenAI</span>
            </div>
            {openaiConnection.planType && (
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500 uppercase tracking-wider">
                {openaiConnection.planType.toLowerCase().includes("pro") ? "Pro"
                  : openaiConnection.planType.toLowerCase().includes("plus") ? "Plus"
                  : openaiConnection.planType.toLowerCase().includes("enterprise") ? "Enterprise"
                  : openaiConnection.planType}
              </span>
            )}
          </div>

          {/* OpenAI email */}
          {openaiConnection.email && (
            <p className="text-[10px] text-neutral-fg-disabled truncate mb-2">
              {openaiConnection.email}
            </p>
          )}

          {/* OpenAI usage bars from WHAM API */}
          {openaiUsage && (() => {
            const rl = (openaiUsage as { rate_limit?: { primary_window?: { used_percent: number; reset_at: number }; secondary_window?: { used_percent: number; reset_at: number } } }).rate_limit;
            if (!rl) return null;
            return (
              <div className="flex flex-col gap-2.5">
                {rl.primary_window && (
                  <UsageBar
                    label="Sessão"
                    utilization={rl.primary_window.used_percent}
                    resetsAt={new Date(rl.primary_window.reset_at * 1000).toISOString()}
                    color="bg-emerald-500"
                  />
                )}
                {rl.secondary_window && (
                  <UsageBar
                    label="Semanal"
                    utilization={rl.secondary_window.used_percent}
                    resetsAt={new Date(rl.secondary_window.reset_at * 1000).toISOString()}
                    color="bg-teal-500"
                  />
                )}
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const projects = useWorkspaceStore((s) => s.projects);
  const setProjects = useWorkspaceStore((s) => s.setProjects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const agents = useWorkspaceStore((s) => s.agents);
  const setAgents = useWorkspaceStore((s) => s.setAgents);
  const agentActivity = useChatStore((s) => s.agentActivity);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { id: routeProjectId } = useParams();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const query = activeTeamId ? `?teamId=${activeTeamId}` : "";
    api<{ projects: Project[] }>(`/projects${query}`).then(({ projects }) => {
      setProjects(projects);
    }).catch(() => {});
  }, [setProjects, activeTeamId]);

  // Load agents on mount so they persist across hard refreshes
  useEffect(() => {
    if (agents.length === 0) {
      api<{ agents: Agent[] }>("/agents").then(({ agents }) => {
        setAgents(agents);
      }).catch(() => {});
    }
  }, [agents.length, setAgents]);

  useEffect(() => {
    if (routeProjectId) setActiveProject(routeProjectId);
  }, [routeProjectId, setActiveProject]);

  const isNavActive = (to: string) => {
    if (to === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(to);
  };

  return (
    <aside className={cn(
      "relative flex shrink-0 flex-col rounded-2xl bg-neutral-bg2 border border-stroke shadow-2 transition-all duration-300",
      collapsed ? "w-[76px]" : "w-[280px]"
    )}>
      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-7 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-bg3 border border-stroke text-neutral-fg3 hover:bg-brand-light hover:text-brand hover:border-stroke-active hover:shadow-glow transition-all duration-200"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-stroke2 transition-all duration-300",
        collapsed ? "justify-center px-4 py-5" : "gap-3.5 px-8 py-5"
      )}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple shadow-brand">
          <Zap className="h-5 w-5 text-white animate-float" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[16px] font-semibold text-neutral-fg1 leading-none tracking-tight">
              AgentHub
            </span>
            <span className="text-[10px] font-semibold text-neutral-fg3 mt-1 tracking-wider uppercase">AI Orchestration</span>
          </div>
        )}
      </div>

      {/* Team Switcher */}
      <TeamSwitcher collapsed={collapsed} />

      {/* Main Nav */}
      <nav className="mt-4 flex flex-col gap-1.5 px-7">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center rounded-lg py-2.5 text-[13px] font-medium transition-all duration-200",
                collapsed ? "justify-center px-3" : "gap-3.5 px-5",
                active
                  ? "bg-brand-light text-brand font-semibold border-l-2 border-brand shadow-[inset_0_0_12px_rgba(99,102,241,0.06)]"
                  : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
              )}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                  active ? "text-brand" : "text-neutral-fg3 group-hover:text-neutral-fg1",
                )}
                strokeWidth={active ? 1.8 : 1.5}
              />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Claude Code CLI Usage */}
      <UsageWidget collapsed={collapsed} />

      {/* Projects section */}
      {projects.length > 0 && (
        <>
          {!collapsed && (
            <div className="mx-9 mt-8 mb-3 flex items-center justify-between">
              <span className="section-heading !mb-0">
                Projetos
              </span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
                {projects.length}
              </span>
            </div>
          )}

          <nav className="flex flex-col gap-1.5 px-7 pb-3">
            {projects.slice(0, 3).map((project) => {
              const stack: string[] = project.stack
                ? typeof project.stack === "string" ? JSON.parse(project.stack) : project.stack
                : [];
              const icon = getStackIcon(stack);
              const isActive = activeProjectId === project.id;

              return (
                <Link
                  key={project.id}
                  to={`/project/${project.id}`}
                  className={cn(
                    "group relative flex items-center rounded-lg py-3 transition-all duration-200",
                    collapsed ? "justify-center px-3" : "gap-3.5 px-5",
                    isActive
                      ? "bg-brand-light text-neutral-fg1 font-semibold border-l-2 border-brand"
                      : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                  )}
                  title={collapsed ? project.name : undefined}
                >
                  <span className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-br from-brand to-purple text-white shadow-brand"
                      : "bg-neutral-bg3 text-neutral-fg2 group-hover:bg-brand-light group-hover:text-brand",
                  )}>
                    {icon === "??" ? project.name.charAt(0).toUpperCase() : icon}
                  </span>
                  {!collapsed && (
                    <span className="truncate text-[13px] font-medium">
                      {project.name}
                    </span>
                  )}
                </Link>
              );
            })}
            {projects.length > 3 && !collapsed && (
              <Link
                to="/projects"
                className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium text-neutral-fg3 hover:text-brand hover:bg-neutral-bg-hover transition-colors"
              >
                {t("dashboard.viewAllProjects")} ({projects.length})
              </Link>
            )}
          </nav>
        </>
      )}

      {/* Empty state for projects */}
      {projects.length === 0 && !collapsed && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 pb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light">
            <FolderOpen className="h-6 w-6 text-brand" />
          </div>
          <p className="text-center text-[12px] text-neutral-fg3 leading-relaxed">
            Escaneie um workspace<br />para começar
          </p>
        </div>
      )}

      {/* Agent status indicators */}
      {agents.length > 0 && (
        <div className={cn(
          "border-t border-stroke2 px-7 py-5",
          collapsed ? "flex flex-col gap-2.5" : "flex flex-wrap gap-2.5"
        )}>
          {agents.filter((a) => a.role !== "receptionist").map((agent) => {
            const activity = agentActivity.get(agent.id);
            const status = activity?.status ?? "idle";
            const statusColor = AGENT_STATUS_COLORS[status];
            const isRunning = status === "running";

            return (
              <div
                key={agent.id}
                className="relative group"
                title={collapsed ? agent.name : `${agent.name} - ${t(`agentStatus.${status}`, status)}`}
              >
                <AgentAvatar
                  name={agent.name}
                  avatar={agent.avatar}
                  color={agent.color}
                  size="sm"
                  className={cn(
                    "transition-all duration-200 hover:opacity-80",
                    collapsed ? "!h-10 !w-10" : ""
                  )}
                />
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-bg2",
                  statusColor,
                  isRunning && "animate-pulse"
                )} />
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
