import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Loader2, Check, Sparkles, Activity, FolderOpen, ListTodo, Users, Zap, CheckCircle2,
  UserCheck, Play, Eye, ThumbsUp, XCircle, MessageSquare, Clock, AlertTriangle, ArrowRightLeft, HelpCircle,
  ChevronLeft, ChevronRight, Github, Star, Lock, Globe,
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
import { AgentAvatar } from "../components/agents/agent-avatar";
import type { Project, ScannedProject, GitHubRepo } from "@agenthub/shared";

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
  activityPage: number;
  activityPageSize: number;
  activityTotalCount: number;
  activityTotalPages: number;
  recentActivities: {
    id: string;
    action: string;
    detail: string | null;
    agentName: string;
    agentColor: string;
    agentAvatar: string | null;
    taskTitle: string;
    projectName: string;
    createdAt: string;
  }[];
}

const ACTION_MAP: Record<string, { icon: LucideIcon; key: string; color: string }> = {
  created: { icon: Plus, key: "actions.created", color: "text-brand" },
  assigned: { icon: UserCheck, key: "actions.assigned", color: "text-info" },
  agent_assigned: { icon: UserCheck, key: "actions.agent_assigned", color: "text-info" },
  started: { icon: Play, key: "actions.execution_started", color: "text-success" },
  completed: { icon: CheckCircle2, key: "actions.completed", color: "text-success" },
  review: { icon: Eye, key: "actions.sent_to_review", color: "text-purple" },
  approved: { icon: ThumbsUp, key: "actions.approved", color: "text-success" },
  rejected: { icon: XCircle, key: "actions.rejected", color: "text-danger" },
  changes_requested: { icon: MessageSquare, key: "actions.changes_requested", color: "text-warning" },
  queued: { icon: Clock, key: "actions.queued", color: "text-neutral-fg2" },
  agent_error: { icon: AlertTriangle, key: "actions.agent_error", color: "text-danger" },
  status_change: { icon: ArrowRightLeft, key: "actions.status_change", color: "text-neutral-fg2" },
};

const DEFAULT_ACTION = { icon: HelpCircle, key: "actions.unknown", color: "text-neutral-fg3" };

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
  const { t } = useTranslation();

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{t("dashboard.action")}</span>
      <button
        className="text-neutral-fg-disabled hover:text-neutral-fg2 transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 rounded-lg bg-neutral-bg1 border border-stroke p-3 shadow-16 animate-scale-in w-[200px]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">{t("dashboard.legend")}</p>
          <div className="flex flex-col gap-1.5">
            {Object.entries(ACTION_MAP).map(([actionKey, { icon: Icon, key, color }]) => (
              <div key={actionKey} className="flex items-center gap-2">
                <Icon className={cn("h-3 w-3 shrink-0", color)} />
                <span className="text-[11px] text-neutral-fg2">{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STAT_ITEMS = [
  { key: "totalProjects", i18nKey: "dashboard.totalProjects", icon: FolderOpen, color: "text-brand" },
  { key: "activeAgents", i18nKey: "dashboard.activeAgents", icon: Users, color: "text-purple" },
  { key: "runningTasks", i18nKey: "dashboard.runningTasks", icon: Zap, color: "text-warning" },
  { key: "reviewTasks", i18nKey: "taskStatus.review", icon: Activity, color: "text-purple" },
  { key: "doneTasks", i18nKey: "dashboard.doneTasks", icon: CheckCircle2, color: "text-success" },
] as const;

export function Dashboard() {
  const { t } = useTranslation();
  const projects = useWorkspaceStore((s) => s.projects);
  const addProject = useWorkspaceStore((s) => s.addProject);
  const navigate = useNavigate();
  const [workspacePath, setWorkspacePath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
  const [scanPage, setScanPage] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [importingRepo, setImportingRepo] = useState<number | null>(null);
  const [repoPage, setRepoPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const SCAN_PAGE_SIZE = 10;
  const REPO_PAGE_SIZE = 9;
  const ACTIVITY_PAGE_SIZE = 10;

  useEffect(() => {
    api<DashboardStats>(`/dashboard/stats?activityPage=${activityPage}&activityPageSize=${ACTIVITY_PAGE_SIZE}`)
      .then(setStats)
      .catch(() => {});
  }, [activityPage]);

  const [repoNeedsReauth, setRepoNeedsReauth] = useState(false);

  useEffect(() => {
    setLoadingRepos(true);
    fetch("/api/projects/github-repos")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error === "github_reauth") {
            setRepoNeedsReauth(true);
          } else {
            setRepoError(true);
          }
          return;
        }
        const { repos } = await res.json();
        setGithubRepos(repos);
      })
      .catch(() => setRepoError(true))
      .finally(() => setLoadingRepos(false));
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
      setScanPage(0);
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

  const handleImportRepo = async (repo: GitHubRepo) => {
    setImportingRepo(repo.id);
    try {
      const { project } = await api<{ project: Project }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: repo.name,
          path: repo.clone_url,
          stack: repo.language ? [repo.language] : [],
          description: repo.description,
        }),
      });
      addProject(project);
    } catch (error) {
      console.error("Import repo failed:", error);
    } finally {
      setImportingRepo(null);
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
              placeholder={t("dashboard.workspacePath")}
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
          {t("dashboard.projectCount", { count: projects.length })}
        </span>
      </CommandBar>

      {/* Scanned results banner */}
      {scannedProjects.length > 0 && (() => {
        const totalPages = Math.ceil(scannedProjects.length / SCAN_PAGE_SIZE);
        const pageItems = scannedProjects.slice(scanPage * SCAN_PAGE_SIZE, (scanPage + 1) * SCAN_PAGE_SIZE);
        return (
          <div className="border-b border-stroke bg-success-light px-8 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-3.5 w-3.5 text-success-dark" />
                <span className="text-[12px] font-semibold text-success-dark">
                  {t("dashboard.projectsFound", { count: scannedProjects.length })}
                </span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-success-dark">
                    {t("dashboard.pageOf", { current: scanPage + 1, total: totalPages })}
                  </span>
                  <button
                    onClick={() => setScanPage((p) => Math.max(0, p - 1))}
                    disabled={scanPage === 0}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setScanPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={scanPage >= totalPages - 1}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {pageItems.map((scanned) => {
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
                      {alreadyAdded ? <><Check className="h-3 w-3" /> {t("dashboard.added")}</> : <><Plus className="h-3 w-3" /> {t("common.add")}</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-10">
        {/* Hero area */}
        <div className="relative mb-12">
          <div className="glow-orb glow-orb-brand w-[300px] h-[300px] -top-32 -left-20 opacity-40" />
          <div className="glow-orb glow-orb-purple w-[200px] h-[200px] -top-16 right-10 opacity-30" />
          <div className="relative">
            <h1 className="text-display text-gradient animate-fade-up">{t("dashboard.title")}</h1>
            <p className="text-subtitle mt-2 animate-fade-up stagger-1">
              {t("dashboard.projectCount", { count: projects.length })}
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
                    <span className="text-label">{t(item.i18nKey)}</span>
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
            {t("dashboard.totalProjects")}
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
                title={t("dashboard.noProjects")}
                description={t("dashboard.scanToStart")}
              />
            </div>
          )}
        </div>

        {/* GitHub Repos section */}
        <div className="mb-12 animate-fade-up stagger-3">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <Github className="h-5 w-5 text-neutral-fg2" />
              <h3 className="section-heading !mb-0">{t("dashboard.githubRepos")}</h3>
            </div>
            {githubRepos.length > 0 && (
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-neutral-fg3" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => { setRepoSearch(e.target.value); setRepoPage(0); }}
                  placeholder={t("dashboard.searchRepo")}
                  className="w-48 input-fluent text-[12px]"
                />
              </div>
            )}
          </div>

          {loadingRepos ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : githubRepos.length > 0 ? (() => {
            const filtered = githubRepos.filter((r) => r.name.toLowerCase().includes(repoSearch.toLowerCase()));
            const totalRepoPages = Math.ceil(filtered.length / REPO_PAGE_SIZE);
            const pageRepos = filtered.slice(repoPage * REPO_PAGE_SIZE, (repoPage + 1) * REPO_PAGE_SIZE);
            return (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pageRepos.map((repo) => {
                    const alreadyImported = projects.some(
                      (p) => p.path === repo.clone_url || p.name === repo.name
                    );
                    return (
                      <div
                        key={repo.id}
                        className="card-glow p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[13px] font-semibold text-neutral-fg1 hover:text-brand truncate transition-colors"
                              >
                                {repo.name}
                              </a>
                              {repo.private ? (
                                <Lock className="h-3 w-3 shrink-0 text-warning" />
                              ) : (
                                <Globe className="h-3 w-3 shrink-0 text-neutral-fg3" />
                              )}
                            </div>
                            {repo.description && (
                              <p className="mt-1 text-[11px] text-neutral-fg3 line-clamp-2">
                                {repo.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-neutral-fg3">
                          {repo.language && (
                            <span className="flex items-center gap-1 rounded-full bg-neutral-bg3 px-2 py-0.5 font-medium">
                              {repo.language}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            {repo.stargazers_count}
                          </span>
                          <span className="ml-auto">{formatRelativeTime(repo.updated_at)}</span>
                        </div>

                        <button
                          onClick={() => handleImportRepo(repo)}
                          disabled={alreadyImported || importingRepo === repo.id}
                          className={cn(
                            "mt-auto flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                            alreadyImported
                              ? "bg-success-light text-success-dark"
                              : "btn-primary text-white"
                          )}
                        >
                          {alreadyImported ? (
                            <><Check className="h-3 w-3" /> {t("dashboard.imported")}</>
                          ) : importingRepo === repo.id ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> {t("dashboard.importing")}</>
                          ) : (
                            <><Plus className="h-3 w-3" /> {t("dashboard.import")}</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {totalRepoPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[11px] text-neutral-fg3">
                      {t("dashboard.repoCount", { count: filtered.length })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-neutral-fg2">
                        {t("dashboard.pageOf", { current: repoPage + 1, total: totalRepoPages })}
                      </span>
                      <button
                        onClick={() => setRepoPage((p) => Math.max(0, p - 1))}
                        disabled={repoPage === 0}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setRepoPage((p) => Math.min(totalRepoPages - 1, p + 1))}
                        disabled={repoPage >= totalRepoPages - 1}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })() : repoNeedsReauth ? (
            <div className="card-glow flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-light">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-fg1">
                  {t("dashboard.githubExpired")}
                </p>
                <p className="text-[12px] text-neutral-fg3 mt-0.5">
                  {t("dashboard.githubExpiredDesc")}
                </p>
              </div>
              <a
                href="/api/auth/github"
                className="btn-primary flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold text-white"
              >
                <Github className="h-3.5 w-3.5" />
                {t("dashboard.reconnectGithub")}
              </a>
            </div>
          ) : repoError ? (
            <div className="card-glow flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-light">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-fg1">
                  {t("dashboard.githubLoadError")}
                </p>
                <p className="text-[12px] text-neutral-fg3 mt-0.5">
                  {t("dashboard.githubLoadErrorDesc")}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Recent activities */}
        {stats && (stats.recentActivities.length > 0 || activityPage > 0) && (
          <div className="animate-fade-up stagger-3">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-heading !mb-0">
                {t("dashboard.recentActivity")}
              </h3>
              {stats.activityTotalCount > 0 && (
                <span className="text-[11px] text-neutral-fg3">
                  {t("dashboard.activityCount", { count: stats.activityTotalCount })}
                </span>
              )}
            </div>
            <div className="card-glow overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.agent")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.project")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                      <ActionLegendHeader />
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("dashboard.task")}</th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("dashboard.when")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke2">
                  {stats.recentActivities.map((activity) => (
                    <tr key={activity.id} className="table-row">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <AgentAvatar name={activity.agentName} avatar={activity.agentAvatar} color={activity.agentColor} size="sm" className="!h-8 !w-8 !text-[11px] !rounded-lg" />
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

              {/* Pagination controls */}
              {stats.activityTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-stroke2 px-5 py-3">
                  <span className="text-[11px] text-neutral-fg3">
                    {t("dashboard.pageOf", { current: activityPage + 1, total: stats.activityTotalPages })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                      disabled={activityPage === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setActivityPage((p) => Math.min(stats.activityTotalPages - 1, p + 1))}
                      disabled={activityPage >= stats.activityTotalPages - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
