import { useState } from "react";
import { FolderOpen, Palette, Info, ExternalLink } from "lucide-react";

export function SettingsPage() {
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );

  const handleSaveWorkspace = () => {
    localStorage.setItem("agenthub:workspacePath", workspacePath.trim());
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">

          {/* Workspace Path */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-text-primary">Workspace Padrão</h3>
                <p className="text-[12px] text-text-tertiary">Diretório padrão para escanear projetos</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="C:\Users\...\Projects"
                className="flex-1 rounded-lg border border-edge-light bg-page px-3 py-2 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleSaveWorkspace}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover"
              >
                Salvar
              </button>
            </div>
          </section>

          {/* Theme (placeholder) */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-light">
                <Palette className="h-4 w-4 text-purple" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-text-primary">Tema</h3>
                <p className="text-[12px] text-text-tertiary">Personalize a aparência do AgentHub</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg bg-primary-light px-3 py-2 text-[13px] font-semibold text-primary border border-primary">
                <span className="h-3.5 w-3.5 rounded-full bg-white border border-edge" />
                Claro
              </button>
              <button className="flex items-center gap-2 rounded-lg bg-page px-3 py-2 text-[13px] text-text-tertiary border border-edge-light">
                <span className="h-3.5 w-3.5 rounded-full bg-hero-from" />
                Escuro
              </button>
              <span className="ml-2 rounded-md bg-yellow-light px-2 py-1 text-[10px] font-semibold text-yellow">
                Em breve
              </span>
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-light">
                <Info className="h-4 w-4 text-blue" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-text-primary">Sobre</h3>
                <p className="text-[12px] text-text-tertiary">Informações do AgentHub</p>
              </div>
            </div>
            <div className="flex flex-col divide-y divide-edge-light">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-text-secondary">Versão</span>
                <span className="text-[13px] font-semibold text-text-primary">0.4.0</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-text-secondary">Agentes SDK</span>
                <span className="text-[13px] font-semibold text-text-primary">Claude Code CLI (OAuth)</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-text-secondary">Database</span>
                <span className="text-[13px] font-semibold text-text-primary">SQLite (libsql)</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-text-secondary">Repositório</span>
                <span className="flex items-center gap-1 text-[13px] font-semibold text-primary">
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
