import { useEffect } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, Settings, Zap, FolderOpen } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Project } from "@agenthub/shared";
import { getStackIcon } from "@agenthub/shared";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

export function AppSidebar() {
  const { projects, setProjects, activeProjectId, setActiveProject } = useWorkspaceStore();
  const { id: routeProjectId } = useParams();
  const location = useLocation();

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
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-edge-light/60 bg-white/80 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-md">
          <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple">
            AgentHub
          </span>
          <span className="text-[10px] font-medium text-text-placeholder -mt-0.5">v0.11.0</span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-edge-light/60" />

      {/* Main Nav */}
      <nav className="mt-4 flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-primary-light to-purple-light text-primary font-semibold shadow-sm"
                  : "text-sidebar-text hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-purple" />
              )}
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                active ? "bg-white/80 shadow-xs" : "",
              )}>
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.6} />
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-5 my-4 border-t border-edge-light/60" />

      {/* Projects section */}
      {projects.length > 0 && (
        <>
          <div className="mx-5 mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
              Projetos
            </span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-light px-1.5 text-[10px] font-bold text-primary">
              {projects.length}
            </span>
          </div>

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
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-primary-light to-purple-light text-text-primary font-semibold shadow-sm"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-purple" />
                  )}
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold transition-all",
                    isActive
                      ? "gradient-primary text-white shadow-sm"
                      : "bg-page text-text-secondary group-hover:bg-primary-light group-hover:text-primary",
                  )}>
                    {icon}
                  </span>
                  <span className="truncate text-[13px]">{project.name}</span>
                </Link>
              );
            })}
          </nav>
        </>
      )}

      {/* Empty state for projects */}
      {projects.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-light to-purple-light">
            <FolderOpen className="h-7 w-7 text-primary" />
          </div>
          <p className="text-center text-[12px] font-medium text-text-tertiary leading-relaxed">
            Escaneie um workspace<br />para começar
          </p>
        </div>
      )}
    </aside>
  );
}
