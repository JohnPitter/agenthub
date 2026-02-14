import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LayoutGrid, ListTodo, Users, Settings, ArrowRight, Play, TrendingUp, Clock, CheckCircle2, AlertCircle, GitPullRequest } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useSocket } from "../hooks/use-socket";
import { TaskExecuteDialog } from "../components/tasks/task-execute-dialog";
import { api, cn } from "../lib/utils";
import type { Task, Agent } from "@agenthub/shared";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
};

export function ProjectOverview() {
  const { id } = useParams<{ id: string }>();
  const { projects, agents, setAgents } = useWorkspaceStore();
  const project = projects.find((p) => p.id === id);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const { executeTask } = useSocket(id);

  useEffect(() => {
    if (!id) return;

    api<{ tasks: Task[] }>(`/tasks?projectId=${id}`)
      .then(({ tasks }) => setTasks(tasks))
      .catch(() => {});

    if (agents.length === 0) {
      api<{ agents: Agent[] }>("/agents")
        .then(({ agents }) => setAgents(agents))
        .catch(() => {});
    }
  }, [id, agents.length, setAgents]);

  if (!project) {
    return <div className="p-8 text-text-secondary">Projeto não encontrado.</div>;
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

  const navItems = [
    { to: `/project/${id}/board`, icon: LayoutGrid, label: "Live Board", desc: "Acompanhe agentes em tempo real" },
    { to: `/project/${id}/tasks`, icon: ListTodo, label: "Tasks", desc: "Crie e gerencie tarefas" },
    { to: `/project/${id}/prs`, icon: GitPullRequest, label: "Pull Requests", desc: "Gerencie PRs no GitHub" },
    { to: `/project/${id}/agents`, icon: Users, label: "Agentes", desc: "Configure agentes IA" },
    { to: `/project/${id}/settings`, icon: Settings, label: "Configurações", desc: "Configurações do projeto" },
  ];

  const stats = [
    { label: "Total", value: totalTasks, icon: TrendingUp, color: "text-primary" },
    { label: "Em Progresso", value: tasksByStatus.in_progress, icon: Clock, color: "text-yellow" },
    { label: "Em Review", value: tasksByStatus.review, icon: AlertCircle, color: "text-purple" },
    { label: "Concluídas", value: tasksByStatus.done, icon: CheckCircle2, color: "text-green" },
  ];

  return (
    <div className="p-8">
      <div className="stagger flex flex-col gap-8">

        {/* Hero Section */}
        <div className="rounded-xl bg-white p-8 shadow-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-green-light px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                <span className="text-[12px] font-semibold text-green">Projeto Ativo</span>
              </div>
              <h1 className="text-[28px] font-bold tracking-tight text-text-primary">
                {project.name}
              </h1>
              <p className="mt-1 text-[13px] text-text-tertiary font-mono">{project.path}</p>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => setShowExecuteDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover"
                >
                  <Play className="h-4 w-4" />
                  Executar Agents
                </button>
                <Link
                  to={`/project/${id}/settings`}
                  className="flex items-center gap-2 rounded-lg bg-page px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover"
                >
                  <Settings className="h-4 w-4" />
                  Configurar
                </Link>
              </div>
            </div>

            {/* Progress ring + stats */}
            <div className="hidden lg:flex items-center gap-6">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="#DADDE1" strokeWidth="3" />
                  <circle
                    cx="24" cy="24" r="20" fill="none"
                    stroke="#0866FF" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${donePercent * 1.257} 125.7`}
                  />
                </svg>
                <span className="absolute text-[14px] font-bold text-text-primary">{donePercent}%</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[13px] font-semibold text-text-primary">Progresso</p>
                <p className="text-[12px] text-text-tertiary">{tasksByStatus.done}/{totalTasks} tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white p-5 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={cn("h-4 w-4", stat.color)} />
                <span className="text-[12px] text-text-secondary">{stat.label}</span>
              </div>
              <p className="text-[20px] font-semibold text-text-primary leading-none">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-start gap-4 rounded-xl bg-white p-6 shadow-card transition-all hover:shadow-card-hover"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light">
                <item.icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-text-primary">{item.label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{item.desc}</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-placeholder transition-colors group-hover:text-primary" />
            </Link>
          ))}
        </div>

        {/* Team Section */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">Equipe de Agentes</h3>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-green-light px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
              <span className="text-[11px] font-semibold text-green">{activeAgents.length} online</span>
            </span>
          </div>

          {activeAgents.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {activeAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex flex-col items-center gap-3 rounded-xl bg-white p-5 shadow-card"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-[16px] font-bold text-white"
                    style={{ backgroundColor: agent.color ?? "#0866FF" }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-text-primary">{agent.name}</p>
                    <p className="text-[11px] text-text-secondary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                    <p className="mt-0.5 text-[10px] text-text-tertiary">{MODEL_LABELS[agent.model] ?? agent.model}</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-green-light px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                    <span className="text-[10px] font-semibold text-green">Online</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white py-10 shadow-card">
              <Users className="h-8 w-8 text-text-placeholder" />
              <p className="text-[13px] text-text-tertiary">Nenhum agente ativo</p>
            </div>
          )}
        </section>

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
