import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, Settings, Zap, FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Project } from "@agenthub/shared";
import { getStackIcon } from "@agenthub/shared";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: "bg-neutral-fg-disabled",
  running: "bg-success",
  paused: "bg-warning",
  error: "bg-danger",
  // Fallback statuses from chat activity
  busy: "bg-warning",
  thinking: "bg-info",
  working: "bg-success",
};

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
      "relative flex shrink-0 flex-col border-r border-stroke bg-[var(--bg-subtle)] transition-all duration-300",
      collapsed ? "w-[72px]" : "w-[240px]"
    )}>
      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-bg2 border border-stroke text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center border-b border-stroke2 transition-all duration-300",
        collapsed ? "justify-center px-3" : "gap-3 px-5"
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple">
          <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold text-neutral-fg1 leading-none">
              AgentHub
            </span>
            <span className="text-[10px] font-semibold text-neutral-fg3 mt-0.5 tracking-wider uppercase">AI Orchestration</span>
          </div>
        )}
      </div>

      {/* Main Nav */}
      <nav className="mt-4 flex flex-col gap-1.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center rounded-lg py-2 text-[13px] font-medium transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                active
                  ? "text-brand font-semibold"
                  : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand" />
              )}
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 1.8 : 1.5} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Projects section */}
      {projects.length > 0 && (
        <>
          {!collapsed && (
            <div className="mx-5 mt-6 mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-fg3">
                Projetos
              </span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
                {projects.length}
              </span>
            </div>
          )}

          <nav className="flex flex-1 flex-col gap-1 overflow-auto px-3 pb-4">
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
                    "group relative flex items-center rounded-lg py-2.5 transition-colors",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    isActive
                      ? "bg-brand-light text-neutral-fg1 font-semibold"
                      : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                  )}
                  title={collapsed ? project.name : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand" />
                  )}
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold transition-colors",
                    isActive
                      ? "bg-gradient-to-br from-brand to-purple text-white"
                      : "bg-neutral-bg2 text-neutral-fg2 group-hover:bg-brand-light group-hover:text-brand",
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light">
            <FolderOpen className="h-5 w-5 text-brand" />
          </div>
          <p className="text-center text-[12px] text-neutral-fg3 leading-relaxed">
            Escaneie um workspace<br />para começar
          </p>
        </div>
      )}

      {/* Agent status indicators */}
      {agents.length > 0 && (
        <div className={cn(
          "border-t border-stroke2 p-4",
          collapsed ? "flex flex-col gap-2" : "flex flex-wrap gap-2"
        )}>
          {agents.slice(0, collapsed ? 4 : 5).map((agent) => {
            const activity = agentActivity.get(agent.id);
            const status = activity?.status ?? "idle";
            const statusColor = AGENT_STATUS_COLORS[status];

            return (
              <div
                key={agent.id}
                className="relative group"
                title={collapsed ? agent.name : `${agent.name} - ${status}`}
              >
                <div className={cn(
                  "flex items-center justify-center rounded-md bg-neutral-bg2 text-[10px] font-semibold text-neutral-fg1 transition-colors hover:bg-neutral-bg-hover",
                  collapsed ? "h-9 w-9" : "h-8 w-8"
                )}>
                  {agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-neutral-bg1",
                  statusColor
                )} />
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
