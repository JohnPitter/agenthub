import { useState, useEffect } from "react";
import { FolderOpen, Palette, Info, ExternalLink, Plug, User, ChevronDown, ChevronUp, Check, Unplug, CheckCircle2, XCircle, RefreshCw, Terminal } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import { WhatsAppConfig } from "../components/integrations/whatsapp-config";
import { TelegramConfig } from "../components/integrations/telegram-config";
import { useThemeStore } from "../stores/theme-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useUserStore } from "../stores/user-store";
import { useUsageStore } from "../stores/usage-store";
import { AVATAR_PRESETS, getAgentAvatarUrl } from "../lib/agent-avatar";

type SettingsTab = "perfil" | "conexao" | "geral" | "integracoes" | "aparencia" | "sobre";

const TABS: { key: SettingsTab; label: string; icon: typeof FolderOpen }[] = [
  { key: "perfil", label: "Perfil", icon: User },
  { key: "conexao", label: "Conexão", icon: Unplug },
  { key: "geral", label: "Geral", icon: FolderOpen },
  { key: "integracoes", label: "Integrações", icon: Plug },
  { key: "aparencia", label: "Aparência", icon: Palette },
  { key: "sobre", label: "Sobre", icon: Info },
];

const COLOR_PRESETS = [
  "#6366F1", "#8B5CF6", "#A855F7", "#D946EF",
  "#EC4899", "#F43F5E", "#EF4444", "#F97316",
  "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#2563EB", "#6D28D9", "#BE185D",
];

function ProfileSection() {
  const { name, avatar, color, setProfile } = useUserStore();
  const [draftName, setDraftName] = useState(name);
  const [draftAvatar, setDraftAvatar] = useState(avatar);
  const [draftColor, setDraftColor] = useState(color);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const avatarUrl = getAgentAvatarUrl(draftAvatar, 80);
  const initials = draftName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSave = () => {
    setProfile({ name: draftName.trim() || "Usuário", avatar: draftAvatar, color: draftColor });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges = draftName !== name || draftAvatar !== avatar || draftColor !== color;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">Meu Perfil</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">Personalize seu nome, avatar e cor de identificação</p>
      </div>

      {/* Avatar Preview */}
      <div className="card-glow p-8 flex flex-col items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={draftName}
            className="h-20 w-20 rounded-2xl bg-neutral-bg2 ring-2 ring-stroke2"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl text-[24px] font-bold text-white ring-2 ring-white/10"
            style={{ backgroundColor: draftColor }}
          >
            {initials}
          </div>
        )}
        <p className="text-[15px] font-semibold text-neutral-fg1">{draftName || "Usuário"}</p>
      </div>

      {/* Name */}
      <div className="card-glow p-6">
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
          Nome
        </label>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Seu nome"
          className="w-full input-fluent"
        />
      </div>

      {/* Avatar Picker */}
      <div className="card-glow p-6">
        <label className="mb-3 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
          Avatar
        </label>

        {/* First category always visible */}
        <div className="grid grid-cols-8 gap-2">
          {AVATAR_PRESETS[0].avatars.map((preset) => {
            const isSelected = draftAvatar === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setDraftAvatar(isSelected ? "" : preset.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
                  isSelected
                    ? "bg-brand-light ring-2 ring-brand"
                    : "hover:bg-neutral-bg-hover",
                )}
                title={preset.label}
              >
                <img
                  src={getAgentAvatarUrl(preset.value, 48)!}
                  alt={preset.label}
                  className="h-10 w-10 rounded-md"
                  loading="lazy"
                />
                <span className="text-[9px] font-medium text-neutral-fg3 truncate w-full text-center">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Expand to show all categories */}
        <button
          type="button"
          onClick={() => setAvatarOpen(!avatarOpen)}
          className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
        >
          {avatarOpen ? "Menos avatares" : `Ver todos (${AVATAR_PRESETS.reduce((a, g) => a + g.avatars.length, 0)})`}
          {avatarOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {avatarOpen && (
          <div className="mt-3 space-y-4 rounded-lg border border-stroke bg-neutral-bg2 p-4 animate-fade-up">
            {AVATAR_PRESETS.slice(1).map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  {group.category}
                </p>
                <div className="grid grid-cols-8 gap-2">
                  {group.avatars.map((preset) => {
                    const isSelected = draftAvatar === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setDraftAvatar(isSelected ? "" : preset.value)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
                          isSelected
                            ? "bg-brand-light ring-2 ring-brand"
                            : "hover:bg-neutral-bg-hover",
                        )}
                        title={preset.label}
                      >
                        <img
                          src={getAgentAvatarUrl(preset.value, 48)!}
                          alt={preset.label}
                          className="h-10 w-10 rounded-md"
                          loading="lazy"
                        />
                        <span className="text-[9px] font-medium text-neutral-fg3 truncate w-full text-center">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {draftAvatar && (
          <button
            type="button"
            onClick={() => setDraftAvatar("")}
            className="mt-2 text-[11px] font-medium text-danger hover:underline"
          >
            Remover avatar
          </button>
        )}
      </div>

      {/* Color Picker */}
      <div className="card-glow p-6">
        <label className="mb-3 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
          Cor do Perfil
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => {
            const isSelected = draftColor === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setDraftColor(c)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                  isSelected ? "ring-2 ring-offset-2 ring-offset-neutral-bg1" : "hover:scale-110",
                )}
                style={{
                  backgroundColor: c,
                  ...(isSelected ? { "--tw-ring-color": c } as React.CSSProperties : {}),
                }}
                title={c}
              >
                {isSelected && <Check className="h-4 w-4 text-white drop-shadow-md" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          className={cn(
            "btn-primary rounded-lg px-6 py-2.5 text-[13px] font-medium text-white transition-all",
            !hasChanges && !saved && "opacity-50 cursor-not-allowed",
          )}
        >
          {saved ? "Salvo!" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function ConnectionSection() {
  const { connection, account, fetchConnection, fetchAccount } = useUsageStore();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetchConnection();
    fetchAccount();
  }, [fetchConnection, fetchAccount]);

  const handleRecheck = async () => {
    setChecking(true);
    useUsageStore.setState({ connectionFetched: false, accountFetched: false });
    await Promise.all([fetchConnection(), fetchAccount()]);
    setChecking(false);
  };

  const connected = connection?.connected ?? false;
  const email = connection?.email ?? account?.email;
  const plan = connection?.subscriptionType ?? account?.subscriptionType;
  const tokenSource = connection?.tokenSource ?? account?.tokenSource;

  const planLabel = plan
    ? plan.toLowerCase().includes("max_20x") || plan.toLowerCase().includes("20x") ? "Max 20x"
    : plan.toLowerCase().includes("max_5x") || plan.toLowerCase().includes("5x") ? "Max 5x"
    : plan.toLowerCase().includes("max") ? "Max"
    : plan.toLowerCase().includes("enterprise") ? "Enterprise"
    : plan.toLowerCase().includes("team") ? "Team"
    : plan.toLowerCase().includes("pro") ? "Pro"
    : plan.toLowerCase().includes("free") ? "Free"
    : plan
    : null;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">Claude Code CLI</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">
          Conexão com o Claude Code CLI via OAuth para execução de agentes
        </p>
      </div>

      {/* Connection status card */}
      <div className={cn(
        "card-glow p-6 border-2",
        connected ? "border-success/30" : "border-danger/30",
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {connected ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10">
                <XCircle className="h-5 w-5 text-danger" />
              </div>
            )}
            <div>
              <p className={cn("text-[14px] font-semibold", connected ? "text-success" : "text-danger")}>
                {connected ? "Conectado" : "Desconectado"}
              </p>
              <p className="text-[11px] text-neutral-fg3">
                {connected ? "Claude Code CLI autenticado via OAuth" : "CLI não autenticado"}
              </p>
            </div>
          </div>
          <button
            onClick={handleRecheck}
            disabled={checking}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-neutral-fg2 bg-neutral-bg2 border border-stroke hover:bg-neutral-bg-hover transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            Verificar
          </button>
        </div>

        {connected && (
          <div className="flex flex-col gap-2 pt-4 border-t border-stroke2">
            {email && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-fg3">Email</span>
                <span className="text-[12px] font-medium text-neutral-fg1">{email}</span>
              </div>
            )}
            {planLabel && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-fg3">Plano</span>
                <span className="text-[12px] font-semibold text-brand">{planLabel}</span>
              </div>
            )}
            {tokenSource && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-neutral-fg3">Autenticação</span>
                <span className="text-[12px] font-medium text-neutral-fg1 capitalize">{tokenSource}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instructions when not connected */}
      {!connected && (
        <div className="card-glow p-6">
          <h4 className="text-[13px] font-semibold text-neutral-fg1 mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-brand" />
            Como conectar
          </h4>
          <ol className="flex flex-col gap-2.5 text-[12px] text-neutral-fg2 leading-relaxed">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand">1</span>
              <span>Instale o Claude Code CLI: <code className="rounded bg-neutral-bg3 px-1.5 py-0.5 text-[11px] font-mono text-brand">npm install -g @anthropic-ai/claude-code</code></span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand">2</span>
              <span>Execute <code className="rounded bg-neutral-bg3 px-1.5 py-0.5 text-[11px] font-mono text-brand">claude</code> no terminal e faça login via OAuth</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand">3</span>
              <span>Reinicie o orchestrator e clique em "Verificar" acima</span>
            </li>
          </ol>
        </div>
      )}

      {/* Note about rate limits */}
      {connected && (
        <div className="card-glow p-6">
          <h4 className="text-[13px] font-semibold text-neutral-fg1 mb-2">Sobre os limites de uso</h4>
          <p className="text-[12px] text-neutral-fg3 leading-relaxed">
            O widget de uso no menu lateral mostra o custo estimado das tarefas executadas pelo AgentHub.
            Os limites de sessão e semanais (como exibidos no claude.ai) não são expostos pela API do SDK,
            então usamos estimativas baseadas no seu plano (<span className="font-semibold text-brand">{planLabel ?? "Pro"}</span>).
          </p>
        </div>
      )}
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<SettingsTab>("perfil");
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );
  const { projects, activeProjectId, setActiveProject } = useWorkspaceStore();

  // Auto-select first project if none is active (so integrations work)
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(projects[0].id);
    }
  }, [activeProjectId, projects, setActiveProject]);

  const handleSaveWorkspace = () => {
    localStorage.setItem("agenthub:workspacePath", workspacePath.trim());
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
          <div className="mx-auto max-w-2xl">
            {activeTab === "perfil" && <ProfileSection />}

            {activeTab === "conexao" && <ConnectionSection />}

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
                    <dd className="text-[13px] font-semibold text-brand">0.14.0</dd>
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
                    <dd>
                      <a
                        href="https://github.com/JohnPitter/agenthub"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                      >
                        GitHub
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
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
