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
