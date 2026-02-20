import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Loader2, Check, Sparkles, FolderOpen, FolderPlus, ListTodo, Users,
  ChevronLeft, ChevronRight, Github, Star, Lock, Globe, AlertTriangle,
} from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api, formatRelativeTime } from "../lib/utils";
import { cn } from "../lib/utils";
import { getStackIcon } from "@agenthub/shared";
import { CommandBar } from "../components/layout/command-bar";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonCard } from "../components/ui/skeleton";
import { AgentAvatar } from "../components/agents/agent-avatar";
import { CreateProjectDialog } from "../components/projects/create-project-dialog";
import type { Project, ScannedProject, GitHubRepo } from "@agenthub/shared";

interface ProjectStats {
  projectId: string;
  taskCount: number;
  agentCount: number;
  lastActivity: string | null;
  agents: { id: string; name: string; color: string | null; avatar: string | null; role: string }[];
}

interface StatsResponse {
  projectStats: ProjectStats[];
}

const PROJECT_PAGE_SIZE = 12;
const SCAN_PAGE_SIZE = 10;
const REPO_PAGE_SIZE = 9;

export function ProjectsPage() {
  const { t } = useTranslation();
  const projects = useWorkspaceStore((s) => s.projects);
  const addProject = useWorkspaceStore((s) => s.addProject);
  const navigate = useNavigate();

  const [workspacePath, setWorkspacePath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
  const [scanPage, setScanPage] = useState(0);

  const [projectSearch, setProjectSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"all" | "active" | "archived">("all");
  const [projectPage, setProjectPage] = useState(0);

  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState(false);
  const [repoNeedsReauth, setRepoNeedsReauth] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [importingRepo, setImportingRepo] = useState<number | null>(null);
  const [repoPage, setRepoPage] = useState(0);

  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [statsKey, setStatsKey] = useState(0);
  const [reposKey, setReposKey] = useState(0);

  useEffect(() => {
    api<StatsResponse>("/dashboard/stats?activityPage=0&activityPageSize=1")
      .then(setStats)
      .catch(() => {});
  }, [statsKey]);

  useEffect(() => {
    setLoadingRepos(true);
    setRepoError(false);
    setRepoNeedsReauth(false);
    api<{ repos: GitHubRepo[] }>("/projects/github-repos")
      .then(({ repos }) => setGithubRepos(repos))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "github_reauth") {
          setRepoNeedsReauth(true);
        } else {
          setRepoError(true);
        }
      })
      .finally(() => setLoadingRepos(false));
  }, [reposKey]);

  const refreshPage = () => {
    setStatsKey((k) => k + 1);
    setReposKey((k) => k + 1);
  };

  const handleProjectCreated = (project: Project) => {
    addProject(project);
    refreshPage();
  };

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
    } catch {
      // scan failed silently
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
      setStatsKey((k) => k + 1);
      setScannedProjects((prev) => prev.filter((p) => p.path !== scanned.path));
    } catch {
      // add failed silently
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
      setStatsKey((k) => k + 1);
    } catch {
      // import failed silently
    } finally {
      setImportingRepo(null);
    }
  };

  const existingPaths = new Set(projects.map((p) => p.path));

  // Filtered & paginated projects
  const filteredProjects = projects.filter((p) => {
    if (projectSearch && !p.name.toLowerCase().includes(projectSearch.toLowerCase())) return false;
    if (projectFilter === "active" && p.status !== "active") return false;
    if (projectFilter === "archived" && p.status !== "archived") return false;
    return true;
  });
  const totalProjectPages = Math.ceil(filteredProjects.length / PROJECT_PAGE_SIZE);
  const pageProjects = filteredProjects.slice(
    projectPage * PROJECT_PAGE_SIZE,
    (projectPage + 1) * PROJECT_PAGE_SIZE,
  );

  // Reset page when filter/search changes
  useEffect(() => { setProjectPage(0); }, [projectSearch, projectFilter]);

  return (
    <div className="flex h-full flex-col">
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
            <button
              onClick={() => setShowCreateDialog(true)}
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t("createProject.button")}
            </button>
          </div>
        }
      >
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {t("projects.projectCount", { count: projects.length })}
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
        {/* Projects section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-heading !mb-0">{t("projects.title")}</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-neutral-fg3" />
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder={t("projects.searchPlaceholder")}
                  className="w-48 input-fluent text-[12px]"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-neutral-bg3 p-0.5">
                {(["all", "active", "archived"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setProjectFilter(f)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      projectFilter === f
                        ? "bg-neutral-bg1 text-neutral-fg1 shadow-sm"
                        : "text-neutral-fg3 hover:text-neutral-fg2",
                    )}
                  >
                    {t(`projects.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!stats ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredProjects.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pageProjects.map((project, i) => {
                  const projectStat = stats.projectStats?.find((ps) => ps.projectId === project.id);
                  const stack: string[] = project.stack
                    ? typeof project.stack === "string" ? JSON.parse(project.stack) : project.stack
                    : [];
                  const icon = getStackIcon(stack);
                  const agents = projectStat?.agents ?? [];
                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(`/project/${project.id}`)}
                      className={cn(
                        "group card-glow flex flex-col gap-3 p-4 text-left animate-fade-up",
                        `stagger-${Math.min(i + 1, 5)}`,
                      )}
                    >
                      {/* Header: icon + name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple text-[16px] font-bold text-white">
                          {icon === "??" ? project.name.charAt(0).toUpperCase() : icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[13px] font-semibold text-neutral-fg1 truncate group-hover:text-brand transition-colors">
                            {project.name}
                          </h4>
                          {stack.length > 0 && (
                            <p className="text-[10px] text-neutral-fg3 truncate">{stack.slice(0, 3).join(" · ")}</p>
                          )}
                        </div>
                        {project.status && (
                          <span className={cn(
                            "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                            project.status === "active" && "bg-success-light text-success",
                            project.status === "archived" && "bg-neutral-bg3 text-neutral-fg3",
                          )}>
                            {project.status === "active" && (
                              <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                            )}
                            {project.status}
                          </span>
                        )}
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1">
                          <ListTodo className="h-3 w-3 text-neutral-fg3" />
                          <span className="font-semibold text-brand">{projectStat?.taskCount ?? 0}</span>
                          <span className="text-neutral-fg3">tasks</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-neutral-fg3" />
                          <span className="font-semibold text-purple">{projectStat?.agentCount ?? 0}</span>
                          <span className="text-neutral-fg3">agents</span>
                        </div>
                      </div>

                      {/* Agent avatars */}
                      {agents.length > 0 && (
                        <div className="flex items-center -space-x-1">
                          {agents.slice(0, 5).map((agent) => (
                            <AgentAvatar
                              key={agent.id}
                              name={agent.name}
                              avatar={agent.avatar}
                              color={agent.color}
                              size="sm"
                              className="!h-6 !w-6 !text-[9px] !rounded-md ring-2 ring-neutral-bg1"
                            />
                          ))}
                          {agents.length > 5 && (
                            <span className="ml-2 text-[10px] font-medium text-neutral-fg3">
                              +{agents.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {totalProjectPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[11px] text-neutral-fg3">
                    {t("projects.projectCount", { count: filteredProjects.length })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-neutral-fg2">
                      {t("dashboard.pageOf", { current: projectPage + 1, total: totalProjectPages })}
                    </span>
                    <button
                      onClick={() => setProjectPage((p) => Math.max(0, p - 1))}
                      disabled={projectPage === 0}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setProjectPage((p) => Math.min(totalProjectPages - 1, p + 1))}
                      disabled={projectPage >= totalProjectPages - 1}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-bg1 text-neutral-fg2 hover:bg-neutral-bg-hover disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card-glow p-12">
              <EmptyState
                icon={FolderOpen}
                title={t("projects.noProjects")}
                description={t("dashboard.scanToStart")}
              />
            </div>
          )}
        </div>

        {/* GitHub Repos section */}
        <div className="mb-6 animate-fade-up stagger-3">
          <div className="flex items-center justify-between mb-4">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : githubRepos.length > 0 ? (() => {
            const filtered = githubRepos.filter((r) => r.name.toLowerCase().includes(repoSearch.toLowerCase()));
            const totalRepoPages = Math.ceil(filtered.length / REPO_PAGE_SIZE);
            const pageRepos = filtered.slice(repoPage * REPO_PAGE_SIZE, (repoPage + 1) * REPO_PAGE_SIZE);
            return (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pageRepos.map((repo) => {
                    const alreadyImported = projects.some(
                      (p) => p.path === repo.clone_url || p.name === repo.name,
                    );
                    return (
                      <div key={repo.id} className="card-glow p-4 flex flex-col gap-3">
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
                              : "btn-primary text-white",
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
      </div>

      <CreateProjectDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
