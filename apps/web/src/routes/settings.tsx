import { useState } from "react";
import { Settings as SettingsIcon, FolderOpen, Palette, Info, ExternalLink } from "lucide-react";

export function SettingsPage() {
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );

  const handleSaveWorkspace = () => {
    localStorage.setItem("agenthub:workspacePath", workspacePath.trim());
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-edge-light px-8 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary">Configurações</h1>
          <p className="text-[12px] text-text-tertiary">Configurações globais do AgentHub</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">

          {/* Workspace Path */}
          <section className="rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Workspace Padrão</h3>
                <p className="text-[12px] text-text-tertiary">Diretório padrão para escanear projetos</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="C:\Users\...\Projects"
                className="flex-1 rounded-xl border border-edge bg-page px-4 py-3 text-[14px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
              />
              <button
                onClick={handleSaveWorkspace}
                className="rounded-xl bg-primary px-5 py-3 text-[13px] font-medium text-white transition-all hover:bg-primary-hover active:scale-[0.98]"
              >
                Salvar
              </button>
            </div>
          </section>

          {/* Theme (placeholder) */}
          <section className="rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-light">
                <Palette className="h-4 w-4 text-purple" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Tema</h3>
                <p className="text-[12px] text-text-tertiary">Personalize a aparência do AgentHub</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 rounded-xl bg-page px-4 py-2.5 text-[13px] font-medium text-text-primary ring-2 ring-primary">
                <span className="h-4 w-4 rounded-full bg-page border border-edge" />
                Claro
              </button>
              <button className="flex items-center gap-2 rounded-xl bg-page px-4 py-2.5 text-[13px] font-medium text-text-tertiary">
                <span className="h-4 w-4 rounded-full bg-hero-from" />
                Escuro
              </button>
              <span className="ml-2 rounded-lg bg-yellow-light px-2.5 py-1 text-[10px] font-semibold text-yellow">
                Em breve
              </span>
            </div>
          </section>

          {/* About */}
          <section className="rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-light">
                <Info className="h-4 w-4 text-blue" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">Sobre</h3>
                <p className="text-[12px] text-text-tertiary">Informações do AgentHub</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
                <span className="text-[13px] text-text-secondary">Versão</span>
                <span className="text-[13px] font-semibold text-text-primary">0.4.0</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
                <span className="text-[13px] text-text-secondary">Agentes SDK</span>
                <span className="text-[13px] font-semibold text-text-primary">Claude Code CLI (OAuth)</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
                <span className="text-[13px] text-text-secondary">Database</span>
                <span className="text-[13px] font-semibold text-text-primary">SQLite (libsql)</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
                <span className="text-[13px] text-text-secondary">Repositório</span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                  GitHub
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
