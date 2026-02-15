import { useNavigate } from "react-router-dom";
import { ListTodo, Users, Clock, Activity } from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import type { Project } from "@agenthub/shared";

interface ProjectCardProps {
  project: Project;
  taskCount?: number;
  agentCount?: number;
  lastActivity?: string;
}

export function ProjectCard({ project, taskCount = 0, agentCount = 0, lastActivity }: ProjectCardProps) {
  const navigate = useNavigate();

  const stack: string[] = project.stack
    ? typeof project.stack === "string" ? JSON.parse(project.stack) : project.stack
    : [];
  const icon = getStackIcon(stack);

  return (
    <button
      onClick={() => navigate(`/project/${project.id}`)}
      className="group relative flex flex-col gap-4 card-glow p-6 text-left animate-fade-up overflow-hidden"
    >
      {/* Subtle gradient overlay at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-light/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Stack icon + status */}
      <div className="relative flex items-start justify-between">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple text-[24px] font-bold text-white shadow-brand transition-transform duration-300 group-hover:scale-105">
          {icon}
        </div>

        {project.status && (
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
            project.status === "active" && "bg-success-light text-success",
            project.status === "archived" && "bg-neutral-bg3 text-neutral-fg3"
          )}>
            {project.status === "active" && (
              <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
            )}
            {project.status}
          </span>
        )}
      </div>

      {/* Project name */}
      <div className="relative">
        <h3 className="text-[18px] font-semibold text-neutral-fg1 transition-all duration-200 line-clamp-1 group-hover:text-gradient-brand">
          {project.name}
        </h3>
        {stack.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stack.slice(0, 3).map((tech) => (
              <span key={tech} className="badge badge-neutral text-[10px]">
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="relative flex items-center gap-5 text-[12px]">
        <div className="flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="font-semibold text-brand">{taskCount}</span>
          <span className="text-neutral-fg3">tasks</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="font-semibold text-purple">{agentCount}</span>
          <span className="text-neutral-fg3">agents</span>
        </div>
      </div>

      {/* Last activity */}
      {lastActivity && (
        <div className="relative flex items-center gap-1.5 border-t border-stroke2 pt-4 text-[11px] text-neutral-fg-disabled">
          <Activity className="h-3 w-3" />
          <span>{formatRelativeTime(lastActivity)}</span>
        </div>
      )}
    </button>
  );
}
