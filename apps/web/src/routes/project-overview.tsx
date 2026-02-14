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
    { to: `/project/${id}/board`, icon: LayoutGrid, label: "Live Board", desc: "Acompanhe agentes em tempo real", gradient: "from-blue-light to-blue-muted" },
    { to: `/project/${id}/tasks`, icon: ListTodo, label: "Tasks", desc: "Crie e gerencie tarefas", gradient: "from-yellow-light to-yellow-muted" },
    { to: `/project/${id}/prs`, icon: GitPullRequest, label: "Pull Requests", desc: "Gerencie PRs no GitHub", gradient: "from-green-light to-green-muted" },
    { to: `/project/${id}/agents`, icon: Users, label: "Agentes", desc: "Configure agentes IA", gradient: "from-purple-light to-purple-muted" },
    { to: `/project/${id}/settings`, icon: Settings, label: "Configurações", desc: "Configurações do projeto", gradient: "from-primary-light to-primary-muted" },
  ];

  const stats = [
    { label: "Total", value: totalTasks, icon: TrendingUp, color: "text-primary", bg: "from-primary-light to-purple-light" },
    { label: "Em Progresso", value: tasksByStatus.in_progress, icon: Clock, color: "text-yellow", bg: "from-yellow-light to-yellow-muted" },
    { label: "Em Review", value: tasksByStatus.review, icon: AlertCircle, color: "text-purple", bg: "from-purple-light to-purple-muted" },
    { label: "Concluídas", value: tasksByStatus.done, icon: CheckCircle2, color: "text-green", bg: "from-green-light to-green-muted" },
  ];

  return (
    <div className="p-8">
      <div className="stagger flex flex-col gap-8">

        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-8 shadow-lg">
          <div className="absolute inset-0 opacity-[0.04] gradient-primary" />
          <div className="absolute top-0 right-0 w-64 h-64 opacity-[0.06] bg-gradient-to-bl from-purple to-transparent rounded-full -translate-y-1/2 translate-x-1/4" />

          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-light to-green-muted px-3 py-1.5 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-green-dark" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                <span className="text-[12px] font-bold text-green-dark">Projeto Ativo</span>
              </div>
              <h1 className="text-[32px] font-bold tracking-tight text-text-primary leading-tight">
                {project.name}
              </h1>
              <p className="mt-2 text-[13px] text-text-tertiary font-mono bg-page/80 px-3 py-1.5 rounded-lg inline-block">{project.path}</p>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setShowExecuteDialog(true)}
                  className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white shadow-md"
                >
                  <Play className="h-4 w-4" />
                  Executar Agents
                </button>
                <Link
                  to={`/project/${id}/settings`}
                  className="flex items-center gap-2 rounded-xl bg-page px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-all hover:bg-surface-hover hover:shadow-sm"
                >
                  <Settings className="h-4 w-4" />
                  Configurar
                </Link>
              </div>
            </div>

            {/* Progress ring */}
            <div className="hidden lg:flex items-center gap-6">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                  <circle
                    cx="24" cy="24" r="20" fill="none"
                    stroke="url(#progressGradient)" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${donePercent * 1.257} 125.7`}
                    className="transition-all duration-1000"
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366F1" />
                      <stop offset="100%" stopColor="#A855F7" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute text-[18px] font-bold text-text-primary">{donePercent}%</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-bold text-text-primary">Progresso</p>
                <p className="text-[13px] text-text-tertiary">{tasksByStatus.done}/{totalTasks} tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat, index) => (
            <div key={stat.label} className="card-hover relative overflow-hidden rounded-2xl bg-white p-6 shadow-card" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="absolute inset-0 opacity-[0.03] gradient-primary" />
              <div className="relative">
                <div className={cn("mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-br p-2.5", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-1">{stat.label}</p>
                <p className="text-[28px] font-bold text-text-primary leading-none">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="group relative overflow-hidden flex items-start gap-4 rounded-2xl bg-white p-6 shadow-card card-hover">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] gradient-primary transition-opacity duration-300" />
              <div className={cn("relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm group-hover:shadow-md transition-shadow", item.gradient)}>
                <item.icon className="h-5 w-5 text-text-primary" strokeWidth={1.8} />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="text-[15px] font-bold text-text-primary group-hover:text-primary transition-colors">{item.label}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-text-tertiary">{item.desc}</p>
              </div>
              <ArrowRight className="relative mt-1 h-5 w-5 shrink-0 text-text-placeholder transition-all group-hover:text-primary group-hover:translate-x-1" />
            </Link>
          ))}
        </div>

        {/* Team Section */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-8 rounded-full bg-gradient-primary" />
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary">Equipe de Agentes</h3>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-light to-green-muted px-3 py-1.5 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-green-dark" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
              <span className="text-[11px] font-bold text-green-dark">{activeAgents.length} online</span>
            </span>
          </div>

          {activeAgents.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {activeAgents.map((agent) => (
                <div key={agent.id} className="group relative overflow-hidden flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-card card-hover">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] gradient-primary transition-opacity duration-300" />
                  <div
                    className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-[18px] font-bold text-white shadow-md group-hover:shadow-lg transition-all group-hover:scale-105"
                    style={{ backgroundColor: agent.color ?? "#6366F1" }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="relative text-center">
                    <p className="text-[14px] font-bold text-text-primary">{agent.name}</p>
                    <p className="text-[12px] font-medium text-text-secondary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                    <p className="mt-1 text-[10px] font-medium text-text-tertiary bg-page px-2 py-0.5 rounded-lg inline-block">{MODEL_LABELS[agent.model] ?? agent.model}</p>
                  </div>
                  <div className="relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-light to-green-muted px-3 py-1 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-dark" />
                    <span className="text-[10px] font-bold text-green-dark">Online</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white py-12 shadow-card">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-light to-purple-light">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <p className="text-[13px] font-medium text-text-tertiary">Nenhum agente ativo</p>
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
