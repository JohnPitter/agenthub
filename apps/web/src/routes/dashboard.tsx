import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Loader2, Check, ArrowUpRight, Play, Settings, Sparkles, Clock, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api, formatRelativeTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import type { Project, ScannedProject } from "@agenthub/shared";

interface DashboardStats {
  totalProjects: number;
  activeAgents: number;
  totalTasks: number;
  runningTasks: number;
  reviewTasks: number;
  doneTasks: number;
  recentActivities: {
    id: string;
    action: string;
    detail: string | null;
    agentName: string;
    agentColor: string;
    taskTitle: string;
    createdAt: string;
  }[];
}

const ACTION_LABELS: Record<string, string> = {
  created: "Task criada",
  assigned: "Task atribuída",
  started: "Execução iniciada",
  completed: "Task concluída",
  review: "Enviada para review",
  approved: "Task aprovada",
  rejected: "Task rejeitada",
  changes_requested: "Alterações solicitadas",
  queued: "Adicionada à fila",
  agent_error: "Erro na execução",
};

export function Dashboard() {
  const { projects, addProject } = useWorkspaceStore();
  const navigate = useNavigate();
  const [workspacePath, setWorkspacePath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api<DashboardStats>("/dashboard/stats")
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleScan = async () => {
    if (!workspacePath.trim()) return;
    setScanning(true);
    try {
      const { projects: scanned } = await api<{ projects: ScannedProject[] }>("/projects/scan", {
        method: "POST",
        body: JSON.stringify({ workspacePath: workspacePath.trim() }),
      });
      setScannedProjects(scanned);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setScanning(false);
    }
  };

  const handleAddProject = async (scanned: ScannedProject) => {
    try {
      const { project } = await api<{ project: Project }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: scanned.name,
          path: scanned.path,
          stack: scanned.stack,
          icon: scanned.icon,
        }),
      });
      addProject(project);
      setScannedProjects((prev) => prev.filter((p) => p.path !== scanned.path));
    } catch (error) {
      console.error("Add project failed:", error);
    }
  };

  const existingPaths = new Set(projects.map((p) => p.path));

  const activeProject = projects[0];

  const heroStats = [
    { label: "Agentes", value: stats?.activeAgents ?? 0, icon: Users, color: "text-primary", bg: "from-primary-light to-purple-light" },
    { label: "Em Progresso", value: stats?.runningTasks ?? 0, icon: Clock, color: "text-yellow-dark", bg: "from-yellow-light to-yellow-muted" },
    { label: "Em Review", value: stats?.reviewTasks ?? 0, icon: AlertCircle, color: "text-purple-dark", bg: "from-purple-light to-purple-muted" },
    { label: "Concluídas", value: stats?.doneTasks ?? 0, icon: CheckCircle2, color: "text-green-dark", bg: "from-green-light to-green-muted" },
  ];

  return (
    <div className="p-8">
      <div className="stagger flex flex-col gap-8">

        {/* Hero Section: Active Project */}
        {activeProject ? (
          <div className="relative overflow-hidden rounded-3xl bg-white p-10 shadow-xl">
            {/* Animated gradient overlay */}
            <div className="absolute inset-0 opacity-[0.06] gradient-primary" />
            <div className="absolute top-0 right-0 w-96 h-96 opacity-[0.08] bg-gradient-to-bl from-purple via-primary to-transparent rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl" />

            <div className="relative flex items-start justify-between gap-8">
              <div className="flex-1 min-w-0">
                <div className="mb-4 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-green-light to-green-muted px-4 py-2 shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-dark shadow-sm" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                  <span className="text-[13px] font-bold text-green-dark">Projeto Ativo</span>
                </div>
                <h1 className="text-[42px] font-bold tracking-tight text-text-primary leading-none mb-4">
                  {activeProject.name}
                </h1>
                <p className="text-[14px] text-text-tertiary font-mono bg-page/80 backdrop-blur-sm px-4 py-2 rounded-xl inline-block shadow-sm">
                  {activeProject.path}
                </p>

                <div className="mt-8 flex items-center gap-4">
                  <button
                    onClick={() => navigate(`/project/${activeProject.id}`)}
                    className="btn-primary flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:shadow-xl hover:scale-105"
                  >
                    <Play className="h-5 w-5" strokeWidth={2.5} />
                    Executar Agents
                  </button>
                  <button
                    onClick={() => navigate(`/project/${activeProject.id}/settings`)}
                    className="flex items-center gap-2.5 rounded-xl bg-page px-6 py-3.5 text-[15px] font-semibold text-text-secondary transition-all hover:bg-surface-hover hover:shadow-md"
                  >
                    <Settings className="h-5 w-5" strokeWidth={2} />
                    Configurar
                  </button>
                </div>
              </div>

              {/* Stats with modern gradient cards */}
              <div className="hidden lg:flex gap-5">
                <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg p-6 text-center min-w-[120px]">
                  <div className="absolute inset-0 opacity-[0.08] bg-gradient-to-br from-primary-light to-purple-light" />
                  <div className="relative">
                    <div className="mb-2 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light p-2.5 shadow-md">
                      <Users className="h-5 w-5 text-primary" strokeWidth={2.2} />
                    </div>
                    <p className="text-[32px] font-bold bg-gradient-primary bg-clip-text text-transparent leading-none mb-1.5">
                      {stats?.activeAgents ?? 0}
                    </p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">Agentes</p>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg p-6 text-center min-w-[120px]">
                  <div className="absolute inset-0 opacity-[0.08] bg-gradient-to-br from-green-light to-green-muted" />
                  <div className="relative">
                    <div className="mb-2 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-green-light to-green-muted p-2.5 shadow-md">
                      <CheckCircle2 className="h-5 w-5 text-green-dark" strokeWidth={2.2} />
                    </div>
                    <p className="text-[32px] font-bold text-green-dark leading-none mb-1.5">{stats?.totalTasks ?? 0}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">Tasks</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Scanner when no projects */
          <div className="relative overflow-hidden rounded-2xl bg-white p-10 shadow-lg">
            <div className="absolute inset-0 opacity-[0.04] gradient-primary" />
            <div className="absolute top-0 right-0 w-48 h-48 opacity-[0.08] bg-gradient-to-bl from-purple to-transparent rounded-full -translate-y-1/4 translate-x-1/4" />

            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light shadow-md">
                  <Search className="h-5 w-5 text-primary" strokeWidth={2.2} />
                </div>
                <div>
                  <span className="text-[15px] font-bold text-text-primary">Workspace Scanner</span>
                  <p className="text-[12px] text-text-tertiary">Detecte projetos automaticamente</p>
                </div>
              </div>
              <p className="text-[13px] text-text-secondary mb-5">
                Aponte para o seu diretório de projetos e deixe a IA descobrir tudo.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="C:\Users\...\Projects"
                  className="flex-1 rounded-xl border border-edge-light bg-page px-4 py-3 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                />
                <button
                  onClick={handleScan}
                  disabled={scanning || !workspacePath.trim()}
                  className="btn-primary flex items-center gap-2 rounded-xl px-6 py-3 text-[13px] font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" strokeWidth={2.5} />}
                  Escanear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanner (always available when has projects) */}
        {projects.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
            <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light shadow-md">
                <Search className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div className="flex-1">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    placeholder="Escanear outro workspace..."
                    className="flex-1 rounded-xl border border-edge-light bg-page px-4 py-2.5 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  />
                  <button
                    onClick={handleScan}
                    disabled={scanning || !workspacePath.trim()}
                    className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" strokeWidth={2.5} />}
                    Scan
                  </button>
                </div>
              </div>
            </div>

            {/* Scanned results */}
            {scannedProjects.length > 0 && (
              <div className="relative mt-5 border-t border-edge-light/60 pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-green-light to-green-muted shadow-sm">
                    <Sparkles className="h-3.5 w-3.5 text-green-dark" />
                  </div>
                  <span className="text-[13px] font-bold text-green-dark">
                    {scannedProjects.length} projeto(s) encontrado(s)
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {scannedProjects.map((scanned) => {
                    const alreadyAdded = existingPaths.has(scanned.path);
                    return (
                      <div
                        key={scanned.path}
                        className="flex items-center justify-between rounded-xl bg-page px-4 py-3.5 transition-all hover:bg-surface-hover hover:shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-light to-purple-light text-[12px] font-bold text-primary shadow-sm">
                            {scanned.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-bold text-text-primary">{scanned.name}</p>
                            <p className="truncate text-[11px] text-text-tertiary font-medium">{scanned.stack.join(" · ")}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddProject(scanned)}
                          disabled={alreadyAdded}
                          className={cn(
                            "ml-3 flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold transition-all shadow-sm",
                            alreadyAdded
                              ? "bg-gradient-to-r from-green-light to-green-muted text-green-dark"
                              : "btn-primary text-white hover:shadow-md hover:scale-105",
                          )}
                        >
                          {alreadyAdded ? <><Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionado</> : <><Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionar</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Row - Enhanced gradient cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {heroStats.map((stat, index) => (
              <div
                key={stat.label}
                className="card-hover relative overflow-hidden rounded-2xl bg-white p-7 shadow-lg"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Gradient overlay matching icon color */}
                <div className={cn("absolute inset-0 opacity-[0.06] bg-gradient-to-br", stat.bg)} />

                <div className="relative">
                  <div className={cn("mb-4 inline-flex items-center justify-center rounded-xl bg-gradient-to-br p-3 shadow-md", stat.bg)}>
                    <stat.icon className={cn("h-6 w-6", stat.color)} strokeWidth={2.2} />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-2">
                    {stat.label}
                  </p>
                  <p className={cn("text-[32px] font-bold leading-none", stat.color)}>{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activities - Enhanced feed */}
        {stats && stats.recentActivities.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-1.5 w-10 rounded-full bg-gradient-primary shadow-sm" />
              <h3 className="text-[14px] font-bold uppercase tracking-wider text-text-primary">
                Atividades Recentes
              </h3>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl">
              <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
              <div className="relative divide-y divide-edge-light/60">
                {stats.recentActivities.slice(0, 8).map((activity, index) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-5 px-6 py-5 hover:bg-gradient-to-r hover:from-surface-hover hover:to-transparent transition-all duration-300 group"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white shadow-md group-hover:shadow-lg transition-shadow"
                      style={{ backgroundColor: activity.agentColor }}
                    >
                      {activity.agentName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-text-primary leading-relaxed">
                        <span className="font-bold">{activity.agentName}</span>
                        <span className="text-text-tertiary"> · </span>
                        <span className="font-semibold">{ACTION_LABELS[activity.action] ?? activity.action}</span>
                        {activity.taskTitle && (
                          <span className="text-text-secondary"> — {activity.taskTitle}</span>
                        )}
                      </p>
                      {activity.detail && (
                        <p className="mt-2 text-[12px] text-text-tertiary truncate bg-page px-3 py-1.5 rounded-lg inline-block shadow-sm">
                          {activity.detail}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-text-placeholder bg-page px-3 py-1.5 rounded-full shadow-sm">
                      {formatRelativeTime(activity.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Projects Grid - Enhanced cards */}
        {projects.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-1.5 w-10 rounded-full bg-gradient-primary shadow-sm" />
              <h3 className="text-[14px] font-bold uppercase tracking-wider text-text-primary">
                Meus Projetos
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project, index) => {
                const stack: string[] = project.stack
                  ? typeof project.stack === "string" ? JSON.parse(project.stack as string) : project.stack
                  : [];
                const icon = getStackIcon(stack);

                return (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="group relative overflow-hidden flex items-center gap-5 rounded-2xl bg-white p-7 text-left shadow-lg card-hover"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Enhanced gradient overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.06] gradient-primary transition-opacity duration-300" />

                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light text-[18px] font-bold text-primary shadow-md group-hover:shadow-xl group-hover:scale-110 transition-all">
                      {icon}
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold text-text-primary group-hover:text-primary transition-colors mb-2">
                        {project.name}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stack.slice(0, 3).map((tech) => (
                          <span key={tech} className="rounded-lg bg-gradient-to-r from-page to-surface-hover px-2.5 py-1 text-[11px] font-bold text-text-secondary shadow-sm">
                            {tech}
                          </span>
                        ))}
                        {stack.length > 3 && (
                          <span className="rounded-lg bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
                            +{stack.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowUpRight className="relative h-6 w-6 shrink-0 text-text-placeholder group-hover:text-primary group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" strokeWidth={2} />
                  </button>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
