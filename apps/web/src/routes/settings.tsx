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
        <div className="mx-auto flex max-w-2xl flex-col gap-6 stagger">

          {/* Workspace Path */}
          <section className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
            <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-light to-purple-light shadow-sm">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-text-primary">Workspace Padrão</h3>
                  <p className="text-[12px] text-text-tertiary">Diretório padrão para escanear projetos</p>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="C:\Users\...\Projects"
                  className="flex-1 rounded-xl border border-edge-light bg-page px-4 py-2.5 text-[13px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:shadow-sm"
                />
                <button
                  onClick={handleSaveWorkspace}
                  className="btn-primary rounded-xl px-5 py-2.5 text-[13px] font-bold text-white shadow-md"
                >
                  Salvar
                </button>
              </div>
            </div>
          </section>

          {/* Theme */}
          <section className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
            <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-light to-purple-muted shadow-sm">
                  <Palette className="h-5 w-5 text-purple-dark" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-text-primary">Tema</h3>
                  <p className="text-[12px] text-text-tertiary">Personalize a aparência do AgentHub</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-light to-purple-light px-4 py-2.5 text-[13px] font-bold text-primary border border-primary/20 shadow-sm">
                  <span className="h-4 w-4 rounded-full bg-white border-2 border-primary shadow-sm" />
                  Claro
                </button>
                <button className="flex items-center gap-2 rounded-xl bg-page px-4 py-2.5 text-[13px] font-medium text-text-tertiary border border-edge-light hover:bg-surface-hover transition-all">
                  <span className="h-4 w-4 rounded-full bg-gradient-to-br from-gray-700 to-gray-900" />
                  Escuro
                </button>
                <span className="ml-2 rounded-full bg-gradient-to-r from-yellow-light to-yellow-muted px-3 py-1.5 text-[11px] font-bold text-yellow-dark shadow-sm">
                  Em breve
                </span>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
            <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-light to-blue-muted shadow-sm">
                  <Info className="h-5 w-5 text-blue-dark" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-text-primary">Sobre</h3>
                  <p className="text-[12px] text-text-tertiary">Informações do AgentHub</p>
                </div>
              </div>
              <div className="flex flex-col divide-y divide-edge-light/60 rounded-xl bg-page p-1">
                <div className="flex items-center justify-between px-4 py-3 rounded-t-lg hover:bg-surface-hover transition-colors">
                  <span className="text-[13px] font-medium text-text-secondary">Versão</span>
                  <span className="text-[13px] font-bold text-text-primary bg-gradient-to-r from-primary-light to-purple-light px-3 py-1 rounded-full">0.11.0</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors">
                  <span className="text-[13px] font-medium text-text-secondary">Agentes SDK</span>
                  <span className="text-[13px] font-bold text-text-primary">Claude Code CLI (OAuth)</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors">
                  <span className="text-[13px] font-medium text-text-secondary">Database</span>
                  <span className="text-[13px] font-bold text-text-primary">SQLite (libsql)</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-b-lg hover:bg-surface-hover transition-colors">
                  <span className="text-[13px] font-medium text-text-secondary">Repositório</span>
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-primary hover:underline cursor-pointer">
                    GitHub
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
