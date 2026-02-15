import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Loader2, Check, Sparkles, Activity, FolderOpen, ListTodo, Users, Zap, CheckCircle2,
  UserCheck, Play, Eye, ThumbsUp, XCircle, MessageSquare, Clock, AlertTriangle, ArrowRightLeft, HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api, formatRelativeTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import { CommandBar } from "../components/layout/command-bar";
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
    projectName: string;
    createdAt: string;
  }[];
}

const ACTION_MAP: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  created: { icon: Plus, label: "Task criada", color: "text-brand" },
  assigned: { icon: UserCheck, label: "Task atribuída", color: "text-info" },
  agent_assigned: { icon: UserCheck, label: "Agente atribuído", color: "text-info" },
  started: { icon: Play, label: "Execução iniciada", color: "text-success" },
  completed: { icon: CheckCircle2, label: "Task concluída", color: "text-success" },
  review: { icon: Eye, label: "Enviada para review", color: "text-purple" },
  approved: { icon: ThumbsUp, label: "Task aprovada", color: "text-success" },
  rejected: { icon: XCircle, label: "Task rejeitada", color: "text-danger" },
  changes_requested: { icon: MessageSquare, label: "Alterações solicitadas", color: "text-warning" },
  queued: { icon: Clock, label: "Adicionada à fila", color: "text-neutral-fg2" },
  agent_error: { icon: AlertTriangle, label: "Erro na execução", color: "text-danger" },
  status_change: { icon: ArrowRightLeft, label: "Mudança de status", color: "text-neutral-fg2" },
};

const DEFAULT_ACTION = { icon: HelpCircle, label: "Ação desconhecida", color: "text-neutral-fg3" };

function ActionIcon({ action }: { action: string }) {
  const { icon: Icon, color } = ACTION_MAP[action] ?? DEFAULT_ACTION;

  return (
    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-bg3", color)}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function ActionLegendHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>Ação</span>
      <button
        className="text-neutral-fg-disabled hover:text-neutral-fg2 transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 rounded-lg bg-neutral-bg1 border border-stroke p-3 shadow-16 animate-scale-in w-[200px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">Legenda</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(ACTION_MAP).map(([key, { icon: Icon, label, color }]) => (
              <div key={key} className="flex items-center gap-2">
                <Icon className={cn("h-3 w-3 shrink-0", color)} />
                <span className="text-[11px] text-neutral-fg2">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STAT_ITEMS = [
  { key: "totalProjects", label: "Projetos", icon: FolderOpen, color: "text-brand" },
  { key: "activeAgents", label: "Agentes Ativos", icon: Users, color: "text-purple" },
  { key: "runningTasks", label: "Em Progresso", icon: Zap, color: "text-warning" },
  { key: "reviewTasks", label: "Em Review", icon: Activity, color: "text-purple" },
  { key: "doneTasks", label: "Concluídas", icon: CheckCircle2, color: "text-success" },
] as const;

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
              className="w-64 input-fluent text-[13px]"
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

      {/* Scanned results banner */}
      {scannedProjects.length > 0 && (
        <div className="border-b border-stroke bg-success-light px-8 py-4">
          <div className="flex items-center gap-2.5 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-success-dark" />
            <span className="text-[12px] font-semibold text-success-dark">
              {scannedProjects.length} projeto(s) encontrado(s)
            </span>
          </div>
          <div className="flex flex-col gap-2">
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
      <div className="flex-1 overflow-y-auto p-10">
        {/* Hero area */}
        <div className="relative mb-12">
          <div className="glow-orb glow-orb-brand w-[300px] h-[300px] -top-32 -left-20 opacity-40" />
          <div className="glow-orb glow-orb-purple w-[200px] h-[200px] -top-16 right-10 opacity-30" />
          <div className="relative">
            <h1 className="text-display text-gradient animate-fade-up">Dashboard</h1>
            <p className="text-subtitle mt-2 animate-fade-up stagger-1">
              {projects.length} projeto{projects.length !== 1 ? "s" : ""} no workspace
            </p>
          </div>
        </div>

        {/* Stat cards grid */}
        {stats && (
          <div className="grid grid-cols-5 gap-4 mb-12 animate-fade-up stagger-2">
            {STAT_ITEMS.map((item) => {
              const Icon = item.icon;
              const value = stats[item.key as keyof DashboardStats] as number;
              return (
                <div key={item.key} className="stat-card flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-label">{item.label}</span>
                    <Icon className={cn("h-4 w-4", item.color)} />
                  </div>
                  <span className={cn("text-[28px] font-bold tracking-tight", item.color)}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Projects grid */}
        <div className="mb-12">
          <h3 className="section-heading mb-6">
            Projetos
          </h3>
          {!stats ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project, i) => {
                const projectStat = stats.projectStats?.find(ps => ps.projectId === project.id);
                return (
                  <div key={project.id} className={cn("animate-fade-up", `stagger-${Math.min(i + 1, 5)}`)}>
                    <ProjectCard
                      project={project}
                      taskCount={projectStat?.taskCount ?? 0}
                      agentCount={projectStat?.agentCount ?? 0}
                      lastActivity={projectStat?.lastActivity ?? undefined}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card-glow p-12">
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
          <div className="animate-fade-up stagger-3">
            <h3 className="section-heading mb-6">
              Atividades Recentes
            </h3>
            <div className="card-glow overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Agente</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Projeto</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                      <ActionLegendHeader />
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Task</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Quando</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke2">
                  {stats.recentActivities.slice(0, 10).map((activity) => (
                    <tr key={activity.id} className="table-row">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white shadow-xs"
                            style={{ backgroundColor: activity.agentColor }}
                          >
                            {activity.agentName.charAt(0)}
                          </div>
                          <span className="text-[13px] font-medium text-neutral-fg1">{activity.agentName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] font-medium text-neutral-fg1 truncate max-w-[160px]">
                        {activity.projectName || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <ActionIcon action={activity.action} />
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-neutral-fg2 truncate max-w-[200px]">
                        {activity.taskTitle || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
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
