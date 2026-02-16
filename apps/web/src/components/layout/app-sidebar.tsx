import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, Users, ListTodo, Settings, Zap, FolderOpen, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { useUsageStore } from "../../stores/usage-store";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Project } from "@agenthub/shared";
import { getStackIcon } from "@agenthub/shared";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/agents", icon: Users, label: "Agentes" },
  { to: "/tasks", icon: ListTodo, label: "Tarefas" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Configurações" },
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
  const { account, connection, limits, fetchAccount, fetchConnection, fetchLimits } = useUsageStore();

  useEffect(() => {
    fetchAccount();
    fetchConnection();
    fetchLimits();
    const interval = setInterval(() => {
      useUsageStore.setState({ limitsLastFetched: null });
      fetchLimits();
    }, 120_000);
    return () => clearInterval(interval);
  }, [fetchAccount, fetchConnection, fetchLimits]);

  const connected = connection?.connected ?? false;
  const plan = detectPlan(account?.subscriptionType ?? connection?.subscriptionType);
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.pro;

  if (collapsed) {
    return (
      <div
        className="mx-auto mt-6 mb-2 flex flex-col items-center"
        title={connected ? `Plano: ${limit.label}` : "CLI desconectado"}
      >
        {connected ? (
          <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={1.8} />
        ) : (
          <XCircle className="h-5 w-5 text-neutral-fg-disabled" strokeWidth={1.8} />
        )}
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
          Claude Code CLI desconectado
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
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Claude CLI</span>
        </div>
        <span className="rounded-md bg-brand-light px-1.5 py-0.5 text-[9px] font-bold text-brand uppercase tracking-wider">{limit.label}</span>
      </div>

      {/* Account email */}
      {(account?.email ?? connection?.email) && (
        <p className="text-[10px] text-neutral-fg-disabled truncate mb-3">
          {account?.email ?? connection?.email}
        </p>
      )}

      {/* Real usage bars */}
      {limits ? (
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
      ) : (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-2.5 w-16 rounded bg-neutral-bg1 mb-1" />
              <div className="h-1.5 w-full rounded-full bg-neutral-bg1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { projects, setProjects, activeProjectId, setActiveProject, agents } = useWorkspaceStore();
  const { agentActivity } = useChatStore();
  const { id: routeProjectId } = useParams();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>("/projects").then(({ projects }) => {
      setProjects(projects);
    }).catch(() => {});
  }, [setProjects]);

  useEffect(() => {
    if (routeProjectId) setActiveProject(routeProjectId);
  }, [routeProjectId, setActiveProject]);

  const isNavActive = (to: string) => {
    if (to === "/") return location.pathname === "/";
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

      {/* Main Nav */}
      <nav className="mt-6 flex flex-col gap-1.5 px-7">
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
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                  active ? "text-brand" : "text-neutral-fg3 group-hover:text-neutral-fg1",
                )}
                strokeWidth={active ? 1.8 : 1.5}
              />
              {!collapsed && <span>{item.label}</span>}
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

          <nav className="flex flex-1 flex-col gap-1.5 overflow-auto px-7 pb-5">
            {projects.map((project) => {
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
                    {icon}
                  </span>
                  {!collapsed && (
                    <span className="truncate text-[13px] font-medium">
                      {project.name}
                    </span>
                  )}
                </Link>
              );
            })}
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
          {agents.slice(0, collapsed ? 4 : 5).map((agent) => {
            const activity = agentActivity.get(agent.id);
            const status = activity?.status ?? "idle";
            const statusColor = AGENT_STATUS_COLORS[status];
            const isRunning = status === "running";

            return (
              <div
                key={agent.id}
                className="relative group"
                title={collapsed ? agent.name : `${agent.name} - ${status}`}
              >
                <div className={cn(
                  "flex items-center justify-center rounded-lg bg-neutral-bg3 text-[10px] font-semibold text-neutral-fg1 transition-all duration-200 hover:bg-neutral-bg-hover",
                  collapsed ? "h-10 w-10" : "h-9 w-9"
                )}>
                  {agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
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
