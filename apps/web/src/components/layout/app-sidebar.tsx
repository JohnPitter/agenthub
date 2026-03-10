import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, Users, ListTodo, Settings, Zap, FolderOpen, ChevronLeft, ChevronRight, BookOpen, Shield } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { useAuthStore } from "../../stores/auth-store";
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

function UsageWidget({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return null;
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
  const user = useAuthStore((s) => s.user);
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

      {user?.role === "admin" && (
        <nav className="mt-1 flex flex-col gap-1.5 px-7">
          <Link
            to="/admin"
            className={cn(
              "group relative flex items-center rounded-lg py-2.5 text-[13px] font-medium transition-all duration-200",
              collapsed ? "justify-center px-3" : "gap-3.5 px-5",
              isNavActive("/admin")
                ? "bg-brand-light text-brand font-semibold border-l-2 border-brand shadow-[inset_0_0_12px_rgba(99,102,241,0.06)]"
                : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
            )}
            title={collapsed ? "Admin" : undefined}
          >
            <Shield
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                isNavActive("/admin") ? "text-brand" : "text-neutral-fg3 group-hover:text-neutral-fg1",
              )}
              strokeWidth={isNavActive("/admin") ? 1.8 : 1.5}
            />
            {!collapsed && <span>Admin</span>}
          </Link>
        </nav>
      )}

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
            {t("projects.importOrCreate")}
          </p>
        </div>
      )}

      {/* Agent status indicators */}
      {agents.length > 0 && (
        <div className={cn(
          "mt-14 border-t border-stroke2 px-7 py-5",
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
