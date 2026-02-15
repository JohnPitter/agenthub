import { useState, useEffect } from "react";
import { FolderOpen, Palette, Info, ExternalLink, Plug, Users } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import { WhatsAppConfig } from "../components/integrations/whatsapp-config";
import { TelegramConfig } from "../components/integrations/telegram-config";
import { useThemeStore } from "../stores/theme-store";
import { useAgents } from "../hooks/use-agents";
import { useWorkspaceStore } from "../stores/workspace-store";
import { AgentCard } from "../components/agents/agent-card";
import { AgentConfigDialog } from "../components/agents/agent-config-dialog";
import type { Agent } from "@agenthub/shared";

type SettingsTab = "geral" | "agentes" | "integracoes" | "aparencia" | "sobre";

const TABS: { key: SettingsTab; label: string; icon: typeof FolderOpen }[] = [
  { key: "geral", label: "Geral", icon: FolderOpen },
  { key: "agentes", label: "Agentes", icon: Users },
  { key: "integracoes", label: "Integrações", icon: Plug },
  { key: "aparencia", label: "Aparência", icon: Palette },
  { key: "sobre", label: "Sobre", icon: Info },
];

function ThemeSection() {
  const { theme, setTheme } = useThemeStore();

  const options = [
    { value: "dark" as const, label: "Escuro", desc: "Tema padrão premium dark", preview: "bg-neutral-bg1" },
    { value: "light" as const, label: "Claro", desc: "Tema claro para ambientes iluminados", preview: "bg-white" },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">Tema</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">Personalize a aparência do AgentHub</p>
      </div>
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "card-glow flex items-center gap-4 px-6 py-4 text-left transition-all",
                isActive && "border-2 border-brand",
              )}
            >
              <span
                className={cn(
                  "h-6 w-6 rounded-full border-2",
                  isActive ? "border-brand shadow-brand" : "border-stroke",
                  opt.preview,
                )}
              />
              <div>
                <p className={cn("text-[13px] font-semibold", isActive ? "text-brand" : "text-neutral-fg2")}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-neutral-fg3">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );
  const { agents, toggleAgent, updateAgent } = useAgents();
  const { projects, activeProjectId, setActiveProject } = useWorkspaceStore();
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);

  // Auto-select first project if none is active (so integrations work)
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(projects[0].id);
    }
  }, [activeProjectId, projects, setActiveProject]);

  const handleSaveWorkspace = () => {
    localStorage.setItem("agenthub:workspacePath", workspacePath.trim());
  };

  const handleSaveAgent = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  return (
    <div className="flex h-full flex-col">
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">Configurações</span>
      </CommandBar>

      <div className="flex flex-1 overflow-hidden">
        {/* Pill Tab Nav */}
        <nav className="w-[220px] shrink-0 border-r border-stroke2 bg-neutral-bg-subtle p-4">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-brand-light to-transparent text-brand shadow-xs"
                      : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                  )}
                >
                  <tab.icon className={cn("h-4 w-4", isActive && "text-brand")} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10">
          <div className={cn("mx-auto", activeTab === "agentes" ? "max-w-4xl" : "max-w-2xl")}>
            {activeTab === "geral" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div className="card-glow p-8">
                  <h3 className="text-title text-neutral-fg1 mb-1">Workspace Padrão</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Diretório padrão para escanear projetos automaticamente</p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={workspacePath}
                      onChange={(e) => setWorkspacePath(e.target.value)}
                      placeholder="C:\Users\...\Projects"
                      className="flex-1 input-fluent"
                    />
                    <button
                      onClick={handleSaveWorkspace}
                      className="btn-primary rounded-lg px-5 py-2.5 text-[13px] font-medium text-white"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agentes" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">Agentes</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">
                    Gerencie os agentes de IA disponíveis no AgentHub
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onToggle={toggleAgent}
                      onConfigure={setConfigAgent}
                    />
                  ))}
                </div>
                {agents.length === 0 && (
                  <div className="card-glow px-6 py-8 text-center text-[13px] text-neutral-fg-disabled">
                    Nenhum agente configurado
                  </div>
                )}
              </div>
            )}

            {activeTab === "integracoes" && (
              <div className="flex flex-col gap-8 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">Integrações de Mensagens</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">
                    Conecte canais de comunicação para interagir com o Tech Lead via mensagens externas
                  </p>
                </div>

                {/* Project selector */}
                {projects.length > 1 && (
                  <div className="card-glow p-4">
                    <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                      Projeto
                    </label>
                    <select
                      value={activeProjectId ?? ""}
                      onChange={(e) => setActiveProject(e.target.value || null)}
                      className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                    >
                      <option value="" disabled>Selecione um projeto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {projects.length === 0 && (
                  <div className="card-glow px-6 py-8 text-center text-[13px] text-neutral-fg-disabled">
                    Nenhum projeto encontrado. Adicione um projeto primeiro.
                  </div>
                )}

                {activeProjectId && (
                  <>
                    <WhatsAppConfig />
                    <TelegramConfig />
                  </>
                )}
              </div>
            )}

            {activeTab === "aparencia" && <ThemeSection />}

            {activeTab === "sobre" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">Sobre o AgentHub</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">Informações sobre a aplicação</p>
                </div>
                <dl className="flex flex-col divide-y divide-stroke2 card-glow overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">Versão</dt>
                    <dd className="text-[13px] font-semibold text-brand">0.11.0</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">Agentes SDK</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">Claude Code CLI (OAuth)</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">Database</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">SQLite (libsql)</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">Repositório</dt>
                    <dd className="flex items-center gap-1.5 text-[13px] font-semibold text-brand cursor-pointer hover:underline">
                      GitHub
                      <ExternalLink className="h-3.5 w-3.5" />
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={handleSaveAgent}
          onClose={() => setConfigAgent(null)}
        />
      )}
    </div>
  );
}
