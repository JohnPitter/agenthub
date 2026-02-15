import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FolderOpen, Users, GitBranch, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useNotificationStore } from "../stores/notification-store";
import { useAgents } from "../hooks/use-agents";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { useGitStatus } from "../hooks/use-git-status";
import { CommandBar } from "../components/layout/command-bar";
import { api, cn, formatRelativeTime } from "../lib/utils";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

type SettingsTab = "geral" | "agentes" | "git" | "avancado";

const TABS: { key: SettingsTab; label: string; icon: typeof FolderOpen }[] = [
  { key: "geral", label: "Geral", icon: FolderOpen },
  { key: "agentes", label: "Agentes", icon: Users },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "avancado", label: "Avançado", icon: AlertTriangle },
];

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, removeProject } = useWorkspaceStore();
  const { addToast } = useNotificationStore();
  const project = projects.find((p) => p.id === id);
  const { agents, toggleAgent } = useAgents();
  const { status, remoteStatus, lastCommit, config, isGitRepo, loading, initRepo, updateConfig } = useGitStatus(id);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");
  const [gitConfigForm, setGitConfigForm] = useState({
    remoteUrl: "",
    defaultBranch: "main",
    autoCommit: false,
    autoCreateBranch: false,
    autoPR: false,
  });

  const handleArchive = async () => {
    if (!id) return;

    try {
      await api(`/projects/${id}`, { method: "DELETE" });
      removeProject(id);
      addToast("success", "Projeto arquivado", "O projeto foi removido do AgentHub");
      navigate("/");
    } catch {
      addToast("error", "Erro ao arquivar", "Não foi possível arquivar o projeto");
    }
  };

  if (!project) {
    return <div className="p-10 text-neutral-fg2">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">{project.name}</span>
      </CommandBar>

      <div className="flex flex-1 overflow-hidden">
        {/* Pill Tab Nav */}
        <nav className="w-[220px] shrink-0 border-r border-stroke2 bg-neutral-bg-subtle p-4">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const isDanger = tab.key === "avancado";
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200",
                    isActive && isDanger
                      ? "bg-danger-light text-danger"
                      : isActive
                      ? "bg-gradient-to-r from-brand-light to-transparent text-brand shadow-xs"
                      : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                  )}
                >
                  <tab.icon className={cn("h-4 w-4", isActive && (isDanger ? "text-danger" : "text-brand"))} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10">
          <div className="max-w-xl">

            {/* Geral */}
            {activeTab === "geral" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div className="card-glow p-8">
                  <h3 className="text-title text-neutral-fg1 mb-1">Caminho do Workspace</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Diretório raiz do projeto</p>
                  <div className="rounded-lg bg-neutral-bg3 border border-stroke px-4 py-3 font-mono text-[13px] text-neutral-fg2">
                    {project.path}
                  </div>
                </div>
              </div>
            )}

            {/* Agentes */}
            {activeTab === "agentes" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">Agentes Ativos</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Ative ou desative agentes para este workspace</p>
                </div>
                <div className="flex flex-col divide-y divide-stroke2 card-glow overflow-hidden">
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between px-6 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-semibold text-white shadow-xs"
                          style={{ backgroundColor: agent.color ?? "#6366F1" }}
                        >
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-neutral-fg1">{agent.name}</p>
                          <p className="text-[11px] text-neutral-fg3">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleAgent(agent.id)}
                        className={cn(
                          "relative h-5 w-9 rounded-full transition-all duration-200",
                          agent.isActive ? "bg-gradient-to-r from-brand to-purple shadow-brand" : "bg-stroke",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                            agent.isActive && "left-[18px]",
                          )}
                        />
                      </button>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <div className="px-6 py-8 text-center text-[13px] text-neutral-fg-disabled">
                      Nenhum agente configurado
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Git */}
            {activeTab === "git" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">Git</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Controle de versão e automação</p>
                </div>

                {loading ? (
                  <div className="card-glow px-6 py-8 text-center text-[13px] text-neutral-fg3">
                    Carregando status do Git...
                  </div>
                ) : !isGitRepo ? (
                  <div className="card-glow px-6 py-8 text-center">
                    <p className="text-[13px] text-neutral-fg3 mb-4">Repositório Git não inicializado</p>
                    <button
                      onClick={async () => {
                        try {
                          await initRepo();
                          addToast("success", "Git inicializado", "Repositório criado com sucesso");
                        } catch {
                          addToast("error", "Erro ao inicializar", "Não foi possível criar o repositório Git");
                        }
                      }}
                      className="btn-primary rounded-lg px-5 py-2.5 text-[12px] font-semibold text-white"
                    >
                      Inicializar Repositório
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {/* Git Status */}
                    <div className="card-glow p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-label">Branch Atual</span>
                          <span className="rounded-full bg-purple-light px-2.5 py-0.5 text-[11px] font-semibold text-purple">
                            {status?.branch}
                          </span>
                        </div>
                        {status && (status.ahead > 0 || status.behind > 0) && (
                          <div className="text-[11px] text-neutral-fg3">
                            {status.ahead > 0 && `↑ ${status.ahead}`}
                            {status.ahead > 0 && status.behind > 0 && " "}
                            {status.behind > 0 && `↓ ${status.behind}`}
                          </div>
                        )}
                      </div>

                      {lastCommit && (
                        <div className="border-t border-stroke pt-4">
                          <div className="text-label mb-2">Último Commit</div>
                          <div className="text-[12px] text-neutral-fg1 font-mono">{lastCommit.sha.slice(0, 7)}</div>
                          <div className="text-[12px] text-neutral-fg2 mt-1">{lastCommit.message}</div>
                          <div className="text-[11px] text-neutral-fg3 mt-1">
                            {lastCommit.author} · {formatRelativeTime(new Date(lastCommit.date))}
                          </div>
                        </div>
                      )}

                      {remoteStatus && (
                        <div className="border-t border-stroke pt-4 mt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-label">Remote</div>
                            <button
                              onClick={async () => {
                                setSyncing(true);
                                try {
                                  const result = await api(`/projects/${id}/git/sync`, { method: "POST" }) as { success: boolean; conflicts?: boolean };
                                  if (result.conflicts) {
                                    addToast("warning", "Conflitos de merge", "Conflitos detectados ao sincronizar");
                                  } else {
                                    addToast("success", "Sincronizado", "Sincronizado com remote com sucesso");
                                  }
                                } catch {
                                  addToast("error", "Erro ao sincronizar", "Não foi possível sincronizar com remote");
                                } finally {
                                  setSyncing(false);
                                }
                              }}
                              disabled={syncing}
                              className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                              Sync
                            </button>
                          </div>
                          <div className="text-[11px] text-neutral-fg3 font-mono mb-2">{remoteStatus.remoteUrl}</div>
                          {(remoteStatus.ahead > 0 || remoteStatus.behind > 0) ? (
                            <div className="flex items-center gap-2 text-[11px]">
                              {remoteStatus.ahead > 0 && <span className="text-neutral-fg3">↑ {remoteStatus.ahead} ahead</span>}
                              {remoteStatus.behind > 0 && <span className="text-neutral-fg3">↓ {remoteStatus.behind} behind</span>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px] text-success">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Up to date</span>
                            </div>
                          )}
                        </div>
                      )}

                      {status && (status.staged.length + status.unstaged.length + status.untracked.length) > 0 && (
                        <div className="mt-4 pt-4 border-t border-stroke">
                          <span className="rounded-full bg-danger-light px-2.5 py-0.5 text-[11px] font-semibold text-danger">
                            {status.staged.length + status.unstaged.length + status.untracked.length} modificações
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Git Configuration */}
                    <div className="card-glow p-6">
                      <div className="text-label mb-4">Configuração</div>

                      <div className="flex flex-col gap-4">
                        <div>
                          <label className="text-[12px] text-neutral-fg2 mb-1.5 block">Remote URL</label>
                          <input
                            type="text"
                            value={config?.remoteUrl || ""}
                            onChange={(e) => setGitConfigForm({ ...gitConfigForm, remoteUrl: e.target.value })}
                            placeholder="https://github.com/user/repo.git"
                            className="w-full input-fluent text-[12px]"
                          />
                        </div>

                        <div>
                          <label className="text-[12px] text-neutral-fg2 mb-1.5 block">Branch Padrão</label>
                          <select
                            value={config?.defaultBranch || "main"}
                            onChange={(e) => setGitConfigForm({ ...gitConfigForm, defaultBranch: e.target.value })}
                            className="w-full input-fluent text-[12px]"
                          >
                            <option value="main">main</option>
                            <option value="master">master</option>
                          </select>
                        </div>

                        <div className="section-divider" />

                        <div className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-[12px] font-semibold text-neutral-fg1">Auto-criar branch para tasks</p>
                            <p className="text-[11px] text-neutral-fg3">Cria branch automática ao atribuir task</p>
                          </div>
                          <button
                            onClick={() => setGitConfigForm({ ...gitConfigForm, autoCreateBranch: !gitConfigForm.autoCreateBranch })}
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-all duration-200",
                              (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) ? "bg-gradient-to-r from-brand to-purple shadow-brand" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                                (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) && "left-[18px]"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-[12px] font-semibold text-neutral-fg1">Auto-commit ao aprovar</p>
                            <p className="text-[11px] text-neutral-fg3">Cria commit automático quando task aprovada</p>
                          </div>
                          <button
                            onClick={() => setGitConfigForm({ ...gitConfigForm, autoCommit: !gitConfigForm.autoCommit })}
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-all duration-200",
                              (config?.autoCommit ?? gitConfigForm.autoCommit) ? "bg-gradient-to-r from-brand to-purple shadow-brand" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                                (config?.autoCommit ?? gitConfigForm.autoCommit) && "left-[18px]"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-[12px] font-semibold text-neutral-fg1">Auto-PR após push</p>
                            <p className="text-[11px] text-neutral-fg3">Cria PR automaticamente ao fazer push</p>
                          </div>
                          <button
                            onClick={() => setGitConfigForm({ ...gitConfigForm, autoPR: !gitConfigForm.autoPR })}
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-all duration-200",
                              (config?.autoPR ?? gitConfigForm.autoPR) ? "bg-gradient-to-r from-brand to-purple shadow-brand" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                                (config?.autoPR ?? gitConfigForm.autoPR) && "left-[18px]"
                              )}
                            />
                          </button>
                        </div>

                        <button
                          onClick={async () => {
                            try {
                              await updateConfig(gitConfigForm);
                              addToast("success", "Configuração salva", "Configurações Git atualizadas");
                            } catch {
                              addToast("error", "Erro ao salvar", "Não foi possível atualizar configurações");
                            }
                          }}
                          className="mt-2 w-full btn-primary rounded-lg py-2.5 text-[12px] font-semibold text-white"
                        >
                          Salvar Configurações
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Avançado (Danger Zone) */}
            {activeTab === "avancado" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-danger mb-1">Zona de Perigo</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Ações irreversíveis</p>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-danger/20 bg-danger-light/30 px-6 py-5">
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-fg1">Arquivar Projeto</p>
                    <p className="text-[11px] text-neutral-fg3 mt-0.5">Remove o projeto do AgentHub (não afeta arquivos)</p>
                  </div>
                  <button
                    onClick={() => setShowArchiveDialog(true)}
                    className="rounded-lg border border-danger/30 px-5 py-2.5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
                  >
                    Arquivar
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {showArchiveDialog && (
        <ConfirmDialog
          title="Arquivar Projeto?"
          message={`Tem certeza que deseja arquivar "${project.name}"? Esta ação remove o projeto do AgentHub, mas não afeta os arquivos no disco.`}
          confirmLabel="Arquivar Projeto"
          variant="danger"
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveDialog(false)}
        />
      )}
    </div>
  );
}
