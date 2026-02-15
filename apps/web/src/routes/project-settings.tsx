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
        {/* Vertical Tab Nav */}
        <nav className="w-[200px] shrink-0 border-r border-stroke bg-neutral-bg1 py-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex w-full items-center gap-2.5 px-5 py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-brand-light text-brand"
                    : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                  tab.key === "avancado" && isActive && "bg-danger-light text-danger",
                )}
              >
                {isActive && (
                  <span className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full",
                    tab.key === "avancado" ? "bg-danger" : "bg-brand",
                  )} />
                )}
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-xl">

            {/* Geral */}
            {activeTab === "geral" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Caminho do Workspace</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Diretório raiz do projeto</p>
                </div>
                <div className="rounded-md bg-neutral-bg2 px-4 py-3 font-mono text-[13px] text-neutral-fg2">
                  {project.path}
                </div>
              </div>
            )}

            {/* Agentes */}
            {activeTab === "agentes" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Agentes Ativos</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Ative ou desative agentes para este workspace</p>
                </div>
                <div className="flex flex-col divide-y divide-stroke rounded-lg border border-stroke bg-neutral-bg1 shadow-2">
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                          style={{ backgroundColor: agent.color ?? "#0866FF" }}
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
                          "relative h-5 w-9 rounded-full transition-colors duration-200",
                          agent.isActive ? "bg-success" : "bg-stroke",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            agent.isActive ? "translate-x-4" : "translate-x-0.5",
                          )}
                        />
                      </button>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <div className="px-4 py-6 text-center text-[13px] text-neutral-fg-disabled">
                      Nenhum agente configurado
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Git */}
            {activeTab === "git" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Git</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Controle de versão e automação</p>
                </div>

                {loading ? (
                  <div className="rounded-md bg-neutral-bg2 px-4 py-6 text-center text-[13px] text-neutral-fg3">
                    Carregando status do Git...
                  </div>
                ) : !isGitRepo ? (
                  <div className="rounded-md bg-neutral-bg2 px-4 py-6 text-center">
                    <p className="text-[13px] text-neutral-fg3 mb-3">Repositório Git não inicializado</p>
                    <button
                      onClick={async () => {
                        try {
                          await initRepo();
                          addToast("success", "Git inicializado", "Repositório criado com sucesso");
                        } catch {
                          addToast("error", "Erro ao inicializar", "Não foi possível criar o repositório Git");
                        }
                      }}
                      className="rounded-md bg-purple px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-purple/90"
                    >
                      Inicializar Repositório
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Git Status */}
                    <div className="rounded-lg border border-stroke bg-neutral-bg1 shadow-2 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-neutral-fg3 uppercase">Branch Atual</span>
                          <span className="rounded-md bg-purple-light px-2 py-0.5 text-[11px] font-semibold text-purple">
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
                        <div className="border-t border-stroke pt-3">
                          <div className="text-[11px] font-semibold text-neutral-fg3 uppercase mb-1">Último Commit</div>
                          <div className="text-[12px] text-neutral-fg1 font-mono">{lastCommit.sha.slice(0, 7)}</div>
                          <div className="text-[12px] text-neutral-fg2 mt-1">{lastCommit.message}</div>
                          <div className="text-[11px] text-neutral-fg3 mt-1">
                            {lastCommit.author} · {formatRelativeTime(new Date(lastCommit.date))}
                          </div>
                        </div>
                      )}

                      {remoteStatus && (
                        <div className="border-t border-stroke pt-3 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[11px] font-semibold text-neutral-fg3 uppercase">Remote</div>
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
                              className="flex items-center gap-1.5 rounded-md bg-purple-light px-2.5 py-1 text-[11px] font-semibold text-purple hover:bg-purple hover:text-white transition-colors disabled:opacity-50"
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
                        <div className="mt-3 pt-3 border-t border-stroke">
                          <span className="rounded-md bg-danger-light px-2 py-0.5 text-[11px] font-semibold text-danger">
                            {status.staged.length + status.unstaged.length + status.untracked.length} modificações
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Git Configuration */}
                    <div className="rounded-lg border border-stroke bg-neutral-bg1 shadow-2 p-4">
                      <div className="text-[11px] font-semibold text-neutral-fg3 uppercase mb-3">Configuração</div>

                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-[12px] text-neutral-fg2 mb-1 block">Remote URL</label>
                          <input
                            type="text"
                            value={config?.remoteUrl || ""}
                            onChange={(e) => setGitConfigForm({ ...gitConfigForm, remoteUrl: e.target.value })}
                            placeholder="https://github.com/user/repo.git"
                            className="w-full input-fluent text-[12px]"
                          />
                        </div>

                        <div>
                          <label className="text-[12px] text-neutral-fg2 mb-1 block">Branch Padrão</label>
                          <select
                            value={config?.defaultBranch || "main"}
                            onChange={(e) => setGitConfigForm({ ...gitConfigForm, defaultBranch: e.target.value })}
                            className="w-full input-fluent text-[12px]"
                          >
                            <option value="main">main</option>
                            <option value="master">master</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <div>
                            <p className="text-[12px] font-semibold text-neutral-fg1">Auto-criar branch para tasks</p>
                            <p className="text-[11px] text-neutral-fg3">Cria branch automática ao atribuir task</p>
                          </div>
                          <button
                            onClick={() => setGitConfigForm({ ...gitConfigForm, autoCreateBranch: !gitConfigForm.autoCreateBranch })}
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-colors duration-200",
                              (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) ? "bg-success" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                                (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) ? "translate-x-4" : "translate-x-0.5"
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
                              "relative h-5 w-9 rounded-full transition-colors duration-200",
                              (config?.autoCommit ?? gitConfigForm.autoCommit) ? "bg-success" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                                (config?.autoCommit ?? gitConfigForm.autoCommit) ? "translate-x-4" : "translate-x-0.5"
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
                              "relative h-5 w-9 rounded-full transition-colors duration-200",
                              (config?.autoPR ?? gitConfigForm.autoPR) ? "bg-success" : "bg-stroke"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                                (config?.autoPR ?? gitConfigForm.autoPR) ? "translate-x-4" : "translate-x-0.5"
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
                          className="mt-2 w-full rounded-md bg-purple px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-purple/90"
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
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-danger mb-1">Zona de Perigo</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Ações irreversíveis</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-danger/20 bg-danger-light/50 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-fg1">Arquivar Projeto</p>
                    <p className="text-[11px] text-neutral-fg3">Remove o projeto do AgentHub (não afeta arquivos)</p>
                  </div>
                  <button
                    onClick={() => setShowArchiveDialog(true)}
                    className="rounded-md border border-danger/30 px-4 py-2 text-[12px] font-semibold text-danger transition-colors hover:bg-danger hover:text-white"
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
