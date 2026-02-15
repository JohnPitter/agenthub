import { useState } from "react";
import { FolderOpen, Palette, Info, ExternalLink, Plug } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import { WhatsAppConfig } from "../components/integrations/whatsapp-config";
import { TelegramConfig } from "../components/integrations/telegram-config";

type SettingsTab = "geral" | "integracoes" | "aparencia" | "sobre";

const TABS: { key: SettingsTab; label: string; icon: typeof FolderOpen }[] = [
  { key: "geral", label: "Geral", icon: FolderOpen },
  { key: "integracoes", label: "Integrações", icon: Plug },
  { key: "aparencia", label: "Aparência", icon: Palette },
  { key: "sobre", label: "Sobre", icon: Info },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );

  const handleSaveWorkspace = () => {
    localStorage.setItem("agenthub:workspacePath", workspacePath.trim());
  };

  return (
    <div className="flex h-full flex-col">
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">Configurações</span>
      </CommandBar>

      <div className="flex flex-1 overflow-hidden">
        {/* Vertical Tab Nav */}
        <nav className="w-[200px] shrink-0 border-r border-stroke2 bg-neutral-bg1 py-2">
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
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                )}
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10">
          <div className="max-w-2xl">
            {activeTab === "geral" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Workspace Padrão</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Diretório padrão para escanear projetos automaticamente</p>
                </div>
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
                    className="btn-primary rounded-md px-5 py-2.5 text-[13px] font-medium text-white"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {activeTab === "integracoes" && (
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Integrações de Mensagens</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">
                    Conecte canais de comunicação para interagir com o Tech Lead via mensagens externas
                  </p>
                </div>
                <WhatsAppConfig />
                <TelegramConfig />
              </div>
            )}

            {activeTab === "aparencia" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Tema</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Personalize a aparência do AgentHub</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button className="flex items-center gap-3 rounded-lg border-2 border-brand bg-brand-light px-4 py-3 text-left transition-colors">
                    <span className="h-5 w-5 rounded-full bg-white border-2 border-brand" />
                    <div>
                      <p className="text-[13px] font-semibold text-brand">Claro</p>
                      <p className="text-[11px] text-neutral-fg3">Tema padrão com fundo claro</p>
                    </div>
                  </button>
                  <button className="flex items-center gap-3 rounded-lg border-2 border-stroke bg-neutral-bg1 px-4 py-3 text-left transition-colors hover:border-neutral-fg3 opacity-60">
                    <span className="h-5 w-5 rounded-full bg-gray-700" />
                    <div>
                      <p className="text-[13px] font-semibold text-neutral-fg2">Escuro</p>
                      <p className="text-[11px] text-neutral-fg3">Em breve</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "sobre" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-neutral-fg1 mb-1">Sobre o AgentHub</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-4">Informações sobre a aplicação</p>
                </div>
                <dl className="flex flex-col divide-y divide-stroke2 card">
                  <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-[13px] text-neutral-fg2">Versão</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">0.11.0</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-[13px] text-neutral-fg2">Agentes SDK</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">Claude Code CLI (OAuth)</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <dt className="text-[13px] text-neutral-fg2">Database</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">SQLite (libsql)</dd>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
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
    </div>
  );
}
