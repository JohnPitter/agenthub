import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LayoutGrid, ListTodo, Users, Settings, ArrowRight, Play, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";
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
    return <div className="p-10 text-text-secondary">Projeto não encontrado.</div>;
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
    { to: `/project/${id}/agents`, icon: Users, label: "Agentes", desc: "Configure agentes IA" },
    { to: `/project/${id}/settings`, icon: Settings, label: "Configurações", desc: "Configurações do projeto" },
  ];

  const stats = [
    { label: "Total", value: totalTasks, icon: TrendingUp, color: "text-primary", bg: "bg-primary-light" },
    { label: "Em Progresso", value: tasksByStatus.in_progress, icon: Clock, color: "text-yellow", bg: "bg-yellow-light" },
    { label: "Em Review", value: tasksByStatus.review, icon: AlertCircle, color: "text-purple", bg: "bg-purple-light" },
    { label: "Concluídas", value: tasksByStatus.done, icon: CheckCircle2, color: "text-green", bg: "bg-green-light" },
  ];

  return (
    <div className="p-8">
      <div className="stagger flex flex-col gap-8">

        {/* ═══ Hero Section: Project Info ═══ */}
        <div className="rounded-3xl bg-gradient-to-r from-hero-from to-hero-to p-8 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                <span className="text-[12px] font-medium text-white/80">Projeto Ativo</span>
              </div>
              <h1 className="text-[32px] font-bold text-white leading-tight tracking-tight">
                {project.name}
              </h1>
              <p className="mt-2 text-[14px] text-white/50 font-mono">{project.path}</p>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setShowExecuteDialog(true)}
                  className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-white shadow-md transition-all duration-200 hover:bg-primary-hover hover:scale-105"
                >
                  <Play className="h-4 w-4" />
                  Executar Agents
                </button>
                <Link
                  to={`/project/${id}/settings`}
                  className="flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-white/10 hover:scale-105"
                >
                  <Settings className="h-4 w-4" />
                  Configurar Workflow
                </Link>
              </div>
            </div>

            {/* Progress ring + stats */}
            <div className="hidden lg:flex items-center gap-8">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle
                    cx="24" cy="24" r="20" fill="none"
                    stroke="#FF5C35" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${donePercent * 1.257} 125.7`}
                  />
                </svg>
                <span className="absolute text-[16px] font-bold text-white">{donePercent}%</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-semibold text-white">Progresso</p>
                <p className="text-[12px] text-white/50">{tasksByStatus.done}/{totalTasks} tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Stats Row ═══ */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-card card-hover">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <span className="text-[13px] font-medium text-text-secondary">{stat.label}</span>
              </div>
              <p className="text-[28px] font-bold text-text-primary leading-none">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ═══ Navigation Cards ═══ */}
        <div className="grid grid-cols-4 gap-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card card-hover"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light transition-all duration-200 group-hover:bg-primary group-hover:shadow-md">
                <item.icon className="h-5 w-5 text-primary transition-colors group-hover:text-white" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-text-primary">{item.label}</p>
                <p className="mt-0.5 text-[12px] text-text-tertiary">{item.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-text-placeholder transition-all duration-200 group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
        </div>

        {/* ═══ Team Section ═══ */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[18px] font-semibold text-text-primary">Equipe de Agentes</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-light px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
              <span className="text-[11px] font-semibold text-green">{activeAgents.length} online</span>
            </span>
          </div>

          {activeAgents.length > 0 ? (
            <div className="grid grid-cols-5 gap-4">
              {activeAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-card card-hover"
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-[18px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: agent.color ?? "#FF5C35" }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-text-primary">{agent.name}</p>
                    <p className="text-[12px] text-text-secondary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">{MODEL_LABELS[agent.model] ?? agent.model}</p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-green-light px-2.5 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                    <span className="text-[10px] font-semibold text-green">Online</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white py-12 shadow-card">
              <Users className="h-8 w-8 text-text-placeholder" />
              <p className="text-[14px] text-text-tertiary">Nenhum agente ativo</p>
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
