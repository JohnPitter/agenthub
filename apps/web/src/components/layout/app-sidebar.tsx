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
    <aside className="flex w-[240px] shrink-0 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-bold text-text-primary">AgentHub</span>
      </div>

      {/* Main Nav */}
      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
                active
                  ? "bg-sidebar-active text-text-primary font-semibold"
                  : "text-sidebar-text hover:bg-sidebar-hover",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-indicator" />
              )}
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2 : 1.6} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-5 border-t border-edge-light/60" />

      {/* Projects section */}
      {projects.length > 0 && (
        <>
          <div className="mx-4 mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-text-secondary">
              Projetos
            </span>
            <span className="text-[12px] font-semibold text-text-tertiary">
              {projects.length}
            </span>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-auto px-3 pb-4">
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
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    isActive
                      ? "bg-sidebar-active text-text-primary font-semibold"
                      : "text-text-primary hover:bg-sidebar-hover",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-indicator" />
                  )}
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                    isActive
                      ? "bg-primary text-white"
                      : "bg-page text-text-secondary",
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-8">
          <FolderOpen className="h-6 w-6 text-text-placeholder" />
          <p className="text-center text-[12px] text-text-tertiary">
            Escaneie um workspace para começar
          </p>
        </div>
      )}
    </aside>
  );
}
