import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Play, Settings, Users, CheckCircle2, ListTodo, Loader2, Zap, Activity } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useSocket } from "../hooks/use-socket";
import { TaskExecuteDialog } from "../components/tasks/task-execute-dialog";
import { CommandBar } from "../components/layout/command-bar";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonTable } from "../components/ui/skeleton";
import { api, cn, formatRelativeTime } from "../lib/utils";
import type { Task, Agent } from "@agenthub/shared";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  created: { label: "Criada", cls: "bg-info-light text-info" },
  in_progress: { label: "Em Progresso", cls: "bg-warning-light text-warning" },
  review: { label: "Review", cls: "bg-purple-light text-purple" },
  done: { label: "Concluída", cls: "bg-success-light text-success" },
  failed: { label: "Falhou", cls: "bg-danger-light text-danger" },
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function ProjectOverview() {
  const { id } = useParams<{ id: string }>();
  const { projects, agents, setAgents } = useWorkspaceStore();
  const project = projects.find((p) => p.id === id);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const { executeTask } = useSocket(id);

  useEffect(() => {
    if (!id) return;
    api<{ tasks: Task[] }>(`/tasks?projectId=${id}`)
      .then(({ tasks }) => { setTasks(tasks); setTasksLoaded(true); })
      .catch(() => { setTasksLoaded(true); });
    if (agents.length === 0) {
      api<{ agents: Agent[] }>("/agents")
        .then(({ agents }) => setAgents(agents))
        .catch(() => {});
    }
  }, [id, agents.length, setAgents]);

  if (!project) {
    return <div className="p-6 text-neutral-fg2">Projeto não encontrado.</div>;
  }

  const tasksByStatus = {
    created: tasks.filter((t) => t.status === "created").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    review: tasks.filter((t) => t.status === "review").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const totalTasks = tasks.length;
  const donePercent = totalTasks > 0 ? Math.round((tasksByStatus.done / totalTasks) * 100) : 0;
  const activeAgents = agents.filter((a) => a.isActive);

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
    .slice(0, 10);

  const statCards = [
    { label: "Total Tasks", value: totalTasks, icon: ListTodo, color: "text-brand" },
    { label: "Em Progresso", value: tasksByStatus.in_progress, icon: Zap, color: "text-warning" },
    { label: "Agentes Ativos", value: activeAgents.length, icon: Users, color: "text-purple" },
    { label: "Concluídas", value: `${donePercent}%`, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar
        actions={
          <Link
            to={`/project/${id}/settings`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
        }
      >
        <button
          onClick={() => setShowExecuteDialog(true)}
          className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
        >
          <Play className="h-3.5 w-3.5" />
          Executar Agents
        </button>
      </CommandBar>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-10">
        {/* Hero header */}
        <div className="relative mb-10">
          <div className="glow-orb glow-orb-brand w-[250px] h-[250px] -top-28 -left-16 opacity-30" />
          <div className="relative">
            <h1 className="text-heading text-neutral-fg1 animate-fade-up">{project.name}</h1>
            {project.description && (
              <p className="text-subtitle mt-1 animate-fade-up stagger-1">{project.description}</p>
            )}
          </div>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-4 gap-4 mb-10 animate-fade-up stagger-2">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="stat-card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-label">{stat.label}</span>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <span className={cn("text-[28px] font-bold tracking-tight", stat.color)}>
                  {stat.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* 12-col grid content */}
        <div className="grid grid-cols-12 gap-10">
          {/* Recent Tasks — col-span-8 */}
          <div className="col-span-8 animate-fade-up stagger-3">
            <h3 className="section-heading mb-4">
              Tasks Recentes
            </h3>
            {!tasksLoaded ? (
              <SkeletonTable />
            ) : (
              <div className="card-glow overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stroke2 text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Status</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Título</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Agente</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Prioridade</th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Atualizada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke2">
                    {recentTasks.map((task) => {
                      const badge = STATUS_BADGE[task.status] ?? { label: task.status, cls: "bg-neutral-bg2 text-neutral-fg2" };
                      const agent = agents.find((a) => a.id === task.assignedAgentId);
                      return (
                        <tr key={task.id} className="table-row">
                          <td className="px-5 py-3.5">
                            <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", badge.cls)}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[13px] font-medium text-neutral-fg1 truncate max-w-[250px]">
                            {task.title}
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-neutral-fg2">
                            {agent?.name ?? "—"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-neutral-fg3">
                            {PRIORITY_LABEL[task.priority] ?? task.priority}
                          </td>
                          <td className="px-5 py-3.5 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
                            {formatRelativeTime(task.updatedAt ?? task.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                    {recentTasks.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState icon={CheckCircle2} title="Nenhuma task criada" variant="compact" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Agent Team — col-span-4 */}
          <div className="col-span-4 animate-fade-up stagger-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-heading">
                Equipe de Agentes
              </h3>
              <span className="text-[11px] text-success font-semibold">{activeAgents.length} online</span>
            </div>
            <div className="card-glow overflow-hidden">
              {activeAgents.length > 0 ? (
                <div className="divide-y divide-stroke2">
                  {activeAgents.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 px-5 py-4">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold text-white shadow-xs"
                        style={{ backgroundColor: agent.color ?? "#6366F1" }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-neutral-fg1">{agent.name}</p>
                        <p className="text-[11px] text-neutral-fg3">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2.5 py-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                        <span className="text-[10px] font-semibold text-success">Online</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Users} title="Nenhum agente ativo" variant="compact" />
              )}
            </div>
          </div>
        </div>
      </div>

      {showExecuteDialog && (
        <TaskExecuteDialog
          tasks={tasks}
          agents={agents}
          onExecute={(taskId, agentId) => executeTask(taskId, agentId)}
          onClose={() => setShowExecuteDialog(false)}
        />
      )}
    </div>
  );
}
