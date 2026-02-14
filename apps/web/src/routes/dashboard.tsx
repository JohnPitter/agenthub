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
    { label: "Agentes", value: stats?.activeAgents ?? 0, icon: Users, color: "text-primary" },
    { label: "Em Progresso", value: stats?.runningTasks ?? 0, icon: Clock, color: "text-yellow" },
    { label: "Em Review", value: stats?.reviewTasks ?? 0, icon: AlertCircle, color: "text-purple" },
    { label: "Concluídas", value: stats?.doneTasks ?? 0, icon: CheckCircle2, color: "text-green" },
  ];

  return (
    <div className="p-8">
      <div className="stagger flex flex-col gap-8">

        {/* Hero Section: Active Project */}
        {activeProject ? (
          <div className="relative overflow-hidden rounded-2xl bg-white p-8 shadow-lg">
            {/* Gradient overlay */}
            <div className="absolute inset-0 opacity-5 gradient-primary" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-light px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                  <span className="text-[12px] font-bold text-green-dark">Projeto Ativo</span>
                </div>
                <h2 className="text-[32px] font-bold tracking-tight text-text-primary leading-tight">
                  {activeProject.name}
                </h2>
                <p className="mt-2 text-[13px] text-text-tertiary font-mono bg-page px-3 py-1.5 rounded-lg inline-block">
                  {activeProject.path}
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => navigate(`/project/${activeProject.id}`)}
                    className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white shadow-md"
                  >
                    <Play className="h-4 w-4" />
                    Executar Agents
                  </button>
                  <button
                    onClick={() => navigate(`/project/${activeProject.id}/settings`)}
                    className="flex items-center gap-2 rounded-xl bg-page px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-all hover:bg-surface-hover hover:shadow-sm"
                  >
                    <Settings className="h-4 w-4" />
                    Configurar
                  </button>
                </div>
              </div>

              {/* Stats with modern cards */}
              <div className="hidden lg:flex gap-6">
                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 p-5 text-center min-w-[100px]">
                  <p className="text-[28px] font-bold bg-gradient-primary bg-clip-text text-transparent">
                    {stats?.activeAgents ?? 0}
                  </p>
                  <p className="text-[12px] font-semibold text-text-secondary">Agentes</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-5 text-center min-w-[100px]">
                  <p className="text-[28px] font-bold text-green-dark">{stats?.totalTasks ?? 0}</p>
                  <p className="text-[12px] font-semibold text-text-secondary">Tasks</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Scanner when no projects */
          <div className="rounded-xl bg-white p-8 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Search className="h-4 w-4 text-primary" />
              <span className="text-[12px] font-semibold uppercase tracking-wider text-primary">Workspace Scanner</span>
            </div>
            <p className="text-[13px] text-text-secondary mb-4">
              Comece escaneando seu diretório de projetos para detectá-los automaticamente.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="C:\Users\...\Projects"
                className="flex-1 rounded-lg border border-edge-light bg-page px-3 py-2 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
              />
              <button
                onClick={handleScan}
                disabled={scanning || !workspacePath.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Escanear
              </button>
            </div>
          </div>
        )}

        {/* Scanner (always available when has projects) */}
        {projects.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light">
                <Search className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    placeholder="Escanear outro workspace..."
                    className="flex-1 rounded-lg border border-edge-light bg-page px-3 py-2 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  />
                  <button
                    onClick={handleScan}
                    disabled={scanning || !workspacePath.trim()}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Scan
                  </button>
                </div>
              </div>
            </div>

            {/* Scanned results */}
            {scannedProjects.length > 0 && (
              <div className="mt-3 border-t border-edge-light pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-green" />
                  <span className="text-[12px] font-semibold text-green">
                    {scannedProjects.length} projeto(s) encontrado(s)
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {scannedProjects.map((scanned) => {
                    const alreadyAdded = existingPaths.has(scanned.path);
                    return (
                      <div
                        key={scanned.path}
                        className="flex items-center justify-between rounded-lg bg-page px-3 py-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-light text-[11px] font-bold text-primary">
                            {scanned.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-text-primary">{scanned.name}</p>
                            <p className="truncate text-[11px] text-text-tertiary">{scanned.stack.join(" · ")}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddProject(scanned)}
                          disabled={alreadyAdded}
                          className={cn(
                            "ml-3 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
                            alreadyAdded
                              ? "text-green"
                              : "bg-primary text-white hover:bg-primary-hover",
                          )}
                        >
                          {alreadyAdded ? <><Check className="h-3 w-3" /> Adicionado</> : <><Plus className="h-3 w-3" /> Adicionar</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Row - Modern gradient cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {heroStats.map((stat, index) => (
              <div
                key={stat.label}
                className="card-hover relative overflow-hidden rounded-2xl bg-white p-6 shadow-card"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 opacity-[0.03] gradient-primary" />

                <div className="relative">
                  <div className="mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light p-2.5">
                    <stat.icon className={cn("h-5 w-5", stat.color)} />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                    {stat.label}
                  </p>
                  <p className="text-[28px] font-bold text-text-primary leading-none">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activities - Modern feed */}
        {stats && stats.recentActivities.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 rounded-full bg-gradient-primary" />
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary">
                Atividades Recentes
              </h3>
            </div>
            <div className="rounded-2xl bg-white shadow-lg divide-y divide-edge-light/60 overflow-hidden">
              {stats.recentActivities.slice(0, 8).map((activity, index) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gradient-to-r hover:from-surface-hover hover:to-transparent transition-all duration-300"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white shadow-md"
                    style={{ backgroundColor: activity.agentColor }}
                  >
                    {activity.agentName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-text-primary leading-relaxed">
                      <span className="font-bold">{activity.agentName}</span>
                      <span className="text-text-tertiary"> · </span>
                      <span className="font-medium">{ACTION_LABELS[activity.action] ?? activity.action}</span>
                      {activity.taskTitle && (
                        <span className="text-text-secondary"> — {activity.taskTitle}</span>
                      )}
                    </p>
                    {activity.detail && (
                      <p className="mt-1 text-[11px] text-text-tertiary truncate bg-page px-2 py-1 rounded-md inline-block">
                        {activity.detail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-text-placeholder bg-page px-2.5 py-1 rounded-full">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects Grid - Modern cards */}
        {projects.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-8 rounded-full bg-gradient-primary" />
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary">
                Meus Projetos
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const stack: string[] = project.stack
                  ? typeof project.stack === "string" ? JSON.parse(project.stack as string) : project.stack
                  : [];
                const icon = getStackIcon(stack);

                return (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="group relative overflow-hidden flex items-center gap-4 rounded-2xl bg-white p-6 text-left shadow-card card-hover"
                  >
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] gradient-primary transition-opacity duration-300" />

                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light text-[16px] font-bold text-primary shadow-sm group-hover:shadow-md transition-shadow">
                      {icon}
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-text-primary group-hover:text-primary transition-colors">
                        {project.name}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {stack.slice(0, 3).map((tech) => (
                          <span key={tech} className="rounded-lg bg-page px-2 py-1 text-[10px] font-semibold text-text-secondary">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowUpRight className="relative h-5 w-5 shrink-0 text-text-placeholder group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
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
