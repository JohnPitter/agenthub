import { useEffect } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Settings, Zap, FolderOpen } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Project } from "@agenthub/shared";
import { getStackIcon } from "@agenthub/shared";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/agents", icon: Users, label: "Agentes" },
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
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
          <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-bold text-text-primary tracking-tight">AgentHub</span>
      </div>

      {/* Main Nav */}
      <nav className="mt-2 flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200",
                active
                  ? "bg-sidebar-active text-text-primary"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-bright",
              )}
            >
              {/* Active indicator */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2 : 1.6} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Projects section */}
      {projects.length > 0 && (
        <>
          <div className="mx-5 mt-6 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-text">
              Projetos
            </span>
            <span className="rounded-full bg-sidebar-active px-2 py-0.5 text-[10px] font-bold text-sidebar-text-bright">
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
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200",
                    isActive
                      ? "bg-sidebar-active text-text-primary"
                      : "text-sidebar-text-bright hover:bg-sidebar-hover",
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition-all duration-200",
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "bg-sidebar-active text-sidebar-text-bright group-hover:bg-sidebar-hover",
                  )}>
                    {icon}
                  </span>
                  <span className="truncate text-[13px] font-medium">{project.name}</span>
                </Link>
              );
            })}
          </nav>
        </>
      )}

      {/* Empty state for projects */}
      {projects.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-8 opacity-50">
          <FolderOpen className="h-6 w-6 text-sidebar-text" />
          <p className="text-center text-[12px] text-sidebar-text">
            Escaneie um workspace para começar
          </p>
        </div>
      )}
    </aside>
  );
}
