import { useNavigate } from "react-router-dom";
import { ListTodo, Users, Clock } from "lucide-react";
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
      className="group relative flex flex-col gap-4 rounded-lg border border-stroke glass p-5 text-left transition-all hover:scale-[1.02] hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
    >
      {/* Stack icon */}
      <div className="flex items-start justify-between">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple text-[24px] font-bold text-white shadow-lg">
          {icon}
        </div>

        {/* Status badge if needed */}
        {project.status && (
          <span className={cn(
            "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
            project.status === "active" && "bg-success-light text-success",
            project.status === "archived" && "bg-neutral-bg3 text-neutral-fg3"
          )}>
            {project.status}
          </span>
        )}
      </div>

      {/* Project name */}
      <div>
        <h3 className="text-[16px] font-semibold text-neutral-fg1 group-hover:text-brand transition-colors line-clamp-1">
          {project.name}
        </h3>
        {stack.length > 0 && (
          <p className="mt-1 text-[11px] text-neutral-fg3 line-clamp-1">
            {stack.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[12px] text-neutral-fg2">
        <div className="flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="font-medium">{taskCount}</span>
          <span className="text-neutral-fg3">tasks</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="font-medium">{agentCount}</span>
          <span className="text-neutral-fg3">agents</span>
        </div>
      </div>

      {/* Last activity */}
      {lastActivity && (
        <div className="flex items-center gap-1.5 border-t border-stroke2 pt-3 text-[11px] text-neutral-fg-disabled">
          <Clock className="h-3 w-3" />
          <span>{formatRelativeTime(lastActivity)}</span>
        </div>
      )}

      {/* Hover glow effect */}
      <div className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-br from-brand/0 to-purple/0 opacity-0 blur-xl transition-opacity group-hover:from-brand/20 group-hover:to-purple/20 group-hover:opacity-100" />
    </button>
  );
}
