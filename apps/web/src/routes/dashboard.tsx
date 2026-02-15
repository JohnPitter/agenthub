import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Loader2, Check, Sparkles, Activity, FolderOpen } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api, formatRelativeTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import { CommandBar } from "../components/layout/command-bar";
import { StatBar } from "../components/ui/stat-bar";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonTable, SkeletonCard } from "../components/ui/skeleton";
import { ProjectCard } from "../components/projects/project-card";
import type { Project, ScannedProject } from "@agenthub/shared";

interface ProjectStats {
  projectId: string;
  taskCount: number;
  agentCount: number;
  lastActivity: string | null;
}

interface DashboardStats {
  totalProjects: number;
  activeAgents: number;
  totalTasks: number;
  runningTasks: number;
  reviewTasks: number;
  doneTasks: number;
  projectStats: ProjectStats[];
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

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar
        actions={
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder="Caminho do workspace..."
              className="w-64 rounded-md border border-stroke bg-neutral-bg2 px-3 py-1.5 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-colors focus:border-brand"
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
            />
            <button
              onClick={handleScan}
              disabled={scanning || !workspacePath.trim()}
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Scan
            </button>
          </div>
        }
      >
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {projects.length} projeto{projects.length !== 1 ? "s" : ""}
        </span>
      </CommandBar>

      {/* Stat Bar */}
      {stats && (
        <StatBar
          stats={[
            { label: "Projetos", value: stats.totalProjects },
            { label: "Agentes", value: stats.activeAgents },
            { label: "Em Progresso", value: stats.runningTasks, color: "var(--color-warning)" },
            { label: "Em Review", value: stats.reviewTasks, color: "var(--color-purple)" },
            { label: "Concluídas", value: stats.doneTasks, color: "var(--color-success)" },
          ]}
        />
      )}

      {/* Scanned results banner */}
      {scannedProjects.length > 0 && (
        <div className="border-b border-stroke bg-success-light px-6 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-success-dark" />
            <span className="text-[12px] font-semibold text-success-dark">
              {scannedProjects.length} projeto(s) encontrado(s)
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {scannedProjects.map((scanned) => {
              const alreadyAdded = existingPaths.has(scanned.path);
              return (
                <div
                  key={scanned.path}
                  className="flex items-center justify-between rounded-md bg-neutral-bg1 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-light text-[11px] font-semibold text-brand">
                      {scanned.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-neutral-fg1">{scanned.name}</p>
                      <p className="truncate text-[11px] text-neutral-fg3">{scanned.stack.join(" · ")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddProject(scanned)}
                    disabled={alreadyAdded}
                    className={cn(
                      "ml-3 flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                      alreadyAdded
                        ? "bg-success-light text-success-dark"
                        : "btn-primary text-white",
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

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Projects grid */}
        <div className="mb-8">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-4">
            Projetos
          </h3>
          {!stats ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((project) => {
                const projectStat = stats.projectStats?.find(ps => ps.projectId === project.id);
                return (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    taskCount={projectStat?.taskCount ?? 0}
                    agentCount={projectStat?.agentCount ?? 0}
                    lastActivity={projectStat?.lastActivity ?? undefined}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-stroke glass p-12">
              <EmptyState
                icon={FolderOpen}
                title="Nenhum projeto adicionado"
                description="Escaneie um workspace para começar"
              />
            </div>
          )}
        </div>

        {/* Recent activities */}
        {stats && stats.recentActivities.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-4">
              Atividades Recentes
            </h3>
            <div className="rounded-lg border border-stroke glass shadow-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Agente</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Ação</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Task</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Quando</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke2">
                  {stats.recentActivities.slice(0, 10).map((activity) => (
                    <tr key={activity.id} className="hover:bg-neutral-bg-hover transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                            style={{ backgroundColor: activity.agentColor }}
                          >
                            {activity.agentName.charAt(0)}
                          </div>
                          <span className="text-[13px] font-medium text-neutral-fg1">{activity.agentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-neutral-fg2">
                        {ACTION_LABELS[activity.action] ?? activity.action}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-neutral-fg2 truncate max-w-[200px]">
                        {activity.taskTitle || "—"}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
                        {formatRelativeTime(activity.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
