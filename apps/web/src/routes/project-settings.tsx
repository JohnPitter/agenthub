import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings, FolderOpen, Users, GitBranch, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useNotificationStore } from "../stores/notification-store";
import { useAgents } from "../hooks/use-agents";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { useGitStatus } from "../hooks/use-git-status";
import { api, cn, formatRelativeTime } from "../lib/utils";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

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
    } catch (error) {
      addToast("error", "Erro ao arquivar", "Não foi possível arquivar o projeto");
    }
  };

  if (!project) {
    return <div className="p-10 text-text-secondary">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 bg-white px-8 py-5 shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary">Configurações</h1>
          <p className="text-[12px] text-text-tertiary">{project.name}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">

          {/* Workspace Path */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Caminho do Workspace</h3>
                <p className="text-[12px] text-text-tertiary">Diretório raiz do projeto</p>
              </div>
            </div>
            <div className="rounded-lg bg-page px-4 py-3 font-mono text-[13px] text-text-secondary">
              {project.path}
            </div>
          </section>

          {/* Active Agents */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-light">
                <Users className="h-4 w-4 text-green" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Agentes Ativos</h3>
                <p className="text-[12px] text-text-tertiary">Ative ou desative agentes para este workspace</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-lg bg-page px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                      style={{ backgroundColor: agent.color ?? "#0866FF" }}
                    >
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-text-primary">{agent.name}</p>
                      <p className="text-[11px] text-text-tertiary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors duration-200",
                      agent.isActive ? "bg-green" : "bg-edge",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        agent.isActive ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="rounded-lg bg-page px-4 py-6 text-center text-[13px] text-text-placeholder">
                  Nenhum agente configurado
                </div>
              )}
            </div>
          </section>

          {/* Git Status & Configuration */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-light">
                <GitBranch className="h-4 w-4 text-purple" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Git</h3>
                <p className="text-[12px] text-text-tertiary">Controle de versão e automação</p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-lg bg-page px-4 py-6 text-center text-[13px] text-text-tertiary">
                Carregando status do Git...
              </div>
            ) : !isGitRepo ? (
              <div className="rounded-lg bg-page px-4 py-6 text-center">
                <p className="text-[13px] text-text-tertiary mb-3">Repositório Git não inicializado</p>
                <button
                  onClick={async () => {
                    try {
                      await initRepo();
                      addToast("success", "Git inicializado", "Repositório criado com sucesso");
                    } catch (error) {
                      addToast("error", "Erro ao inicializar", "Não foi possível criar o repositório Git");
                    }
                  }}
                  className="rounded-lg bg-purple px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-purple/90"
                >
                  Inicializar Repositório
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Git Status */}
                <div className="rounded-lg bg-page p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-text-tertiary uppercase">Branch Atual</span>
                      <span className="rounded-lg bg-purple-light px-2 py-0.5 text-[11px] font-semibold text-purple">
                        {status?.branch}
                      </span>
                    </div>
                    {status && (status.ahead > 0 || status.behind > 0) && (
                      <div className="text-[11px] text-text-tertiary">
                        {status.ahead > 0 && `↑ ${status.ahead}`}
                        {status.ahead > 0 && status.behind > 0 && " "}
                        {status.behind > 0 && `↓ ${status.behind}`}
                      </div>
                    )}
                  </div>

                  {lastCommit && (
                    <div className="border-t border-edge-light pt-3">
                      <div className="text-[11px] font-semibold text-text-tertiary uppercase mb-1">Último Commit</div>
                      <div className="text-[12px] text-text-primary font-mono">
                        {lastCommit.sha.slice(0, 7)}
                      </div>
                      <div className="text-[12px] text-text-secondary mt-1">{lastCommit.message}</div>
                      <div className="text-[11px] text-text-tertiary mt-1">
                        {lastCommit.author} · {formatRelativeTime(new Date(lastCommit.date))}
                      </div>
                    </div>
                  )}

                  {remoteStatus && (
                    <div className="border-t border-edge-light pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-semibold text-text-tertiary uppercase">Remote</div>
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
                            } catch (error) {
                              addToast("error", "Erro ao sincronizar", "Não foi possível sincronizar com remote");
                            } finally {
                              setSyncing(false);
                            }
                          }}
                          disabled={syncing}
                          className="flex items-center gap-1.5 rounded-lg bg-purple-light px-2.5 py-1 text-[11px] font-semibold text-purple hover:bg-purple hover:text-white transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                          Sync
                        </button>
                      </div>
                      <div className="text-[11px] text-text-tertiary font-mono mb-2">{remoteStatus.remoteUrl}</div>
                      {(remoteStatus.ahead > 0 || remoteStatus.behind > 0) ? (
                        <div className="flex items-center gap-2 text-[11px]">
                          {remoteStatus.ahead > 0 && (
                            <span className="text-text-tertiary">↑ {remoteStatus.ahead} ahead</span>
                          )}
                          {remoteStatus.behind > 0 && (
                            <span className="text-text-tertiary">↓ {remoteStatus.behind} behind</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-green">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Up to date</span>
                        </div>
                      )}
                    </div>
                  )}

                  {status && (status.staged.length + status.unstaged.length + status.untracked.length) > 0 && (
                    <div className="mt-3 pt-3 border-t border-edge-light">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-red-light px-2 py-0.5 text-[11px] font-semibold text-red">
                          {status.staged.length + status.unstaged.length + status.untracked.length} modificações
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Git Configuration */}
                <div className="rounded-lg bg-page p-4">
                  <div className="text-[11px] font-semibold text-text-tertiary uppercase mb-3">Configuração</div>

                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[12px] text-text-secondary mb-1 block">Remote URL</label>
                      <input
                        type="text"
                        value={config?.remoteUrl || ""}
                        onChange={(e) => setGitConfigForm({ ...gitConfigForm, remoteUrl: e.target.value })}
                        placeholder="https://github.com/user/repo.git"
                        className="w-full rounded-lg bg-white border border-edge px-3 py-2 text-[12px] text-text-primary"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] text-text-secondary mb-1 block">Branch Padrão</label>
                      <select
                        value={config?.defaultBranch || "main"}
                        onChange={(e) => setGitConfigForm({ ...gitConfigForm, defaultBranch: e.target.value })}
                        className="w-full rounded-lg bg-white border border-edge px-3 py-2 text-[12px] text-text-primary"
                      >
                        <option value="main">main</option>
                        <option value="master">master</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-text-primary">Auto-criar branch para tasks</p>
                        <p className="text-[11px] text-text-tertiary">Cria branch automática ao atribuir task</p>
                      </div>
                      <button
                        onClick={() => setGitConfigForm({ ...gitConfigForm, autoCreateBranch: !gitConfigForm.autoCreateBranch })}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors duration-200",
                          (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) ? "bg-green" : "bg-edge"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                            (config?.autoCreateBranch ?? gitConfigForm.autoCreateBranch) ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-text-primary">Auto-commit ao aprovar</p>
                        <p className="text-[11px] text-text-tertiary">Cria commit automático quando task aprovada</p>
                      </div>
                      <button
                        onClick={() => setGitConfigForm({ ...gitConfigForm, autoCommit: !gitConfigForm.autoCommit })}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors duration-200",
                          (config?.autoCommit ?? gitConfigForm.autoCommit) ? "bg-green" : "bg-edge"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                            (config?.autoCommit ?? gitConfigForm.autoCommit) ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-text-primary">Auto-PR após push</p>
                        <p className="text-[11px] text-text-tertiary">Cria PR automaticamente ao fazer push</p>
                      </div>
                      <button
                        onClick={() => setGitConfigForm({ ...gitConfigForm, autoPR: !gitConfigForm.autoPR })}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors duration-200",
                          (config?.autoPR ?? gitConfigForm.autoPR) ? "bg-green" : "bg-edge"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                            (config?.autoPR ?? gitConfigForm.autoPR) ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          await updateConfig(gitConfigForm);
                          addToast("success", "Configuração salva", "Configurações Git atualizadas");
                        } catch (error) {
                          addToast("error", "Erro ao salvar", "Não foi possível atualizar configurações");
                        }
                      }}
                      className="mt-2 w-full rounded-lg bg-purple px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-purple/90"
                    >
                      Salvar Configurações
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Danger Zone */}
          <section className="rounded-xl border border-red/20 bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-light">
                <AlertTriangle className="h-4 w-4 text-red" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-red">Zona de Perigo</h3>
                <p className="text-[12px] text-text-tertiary">Ações irreversíveis</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-light/50 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">Arquivar Projeto</p>
                <p className="text-[11px] text-text-tertiary">Remove o projeto do AgentHub (não afeta arquivos)</p>
              </div>
              <button
                onClick={() => setShowArchiveDialog(true)}
                className="rounded-lg border border-red/30 px-4 py-2 text-[12px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
              >
                Arquivar
              </button>
            </div>
          </section>

        </div>
      </div>

      {/* Archive Confirmation Dialog */}
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
