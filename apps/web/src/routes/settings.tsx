import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Palette, Info, ExternalLink, Plug, User, ChevronDown, ChevronUp, Check, CheckCircle2, XCircle, RefreshCw, Cpu, Eye, EyeOff, Loader2, Trash2, Globe, Zap } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import { WhatsAppConfig } from "../components/integrations/whatsapp-config";
import { TelegramConfig } from "../components/integrations/telegram-config";
import { SUPPORTED_LANGUAGES } from "../i18n/i18n";
import i18n from "../i18n/i18n";
import { useThemeStore } from "../stores/theme-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useUserStore } from "../stores/user-store";
import { useUsageStore } from "../stores/usage-store";
import { AVATAR_PRESETS, getAgentAvatarUrl } from "../lib/agent-avatar";
import { api } from "../lib/utils";
import { SkillList } from "../components/skills/skill-list";
import { CLAUDE_MODELS } from "@agenthub/shared";

const LOCALE_CURRENCY: Record<string, string> = {
  "pt-BR": "BRL",
  "en-US": "USD",
  "es": "USD",
  "zh-CN": "CNY",
  "ja": "JPY",
};

function formatCurrency(cents: number): string {
  const lang = i18n.language || "en-US";
  const currency = LOCALE_CURRENCY[lang] ?? "USD";
  return new Intl.NumberFormat(lang, { style: "currency", currency }).format(cents / 100);
}

type SettingsTab = "perfil" | "providers" | "geral" | "integracoes" | "skills" | "aparencia" | "sobre";

const TABS: { key: SettingsTab; labelKey: string; icon: typeof FolderOpen }[] = [
  { key: "perfil", labelKey: "settings.profile", icon: User },
  { key: "providers", labelKey: "settings.aiProviders", icon: Cpu },
  { key: "geral", labelKey: "settings.general", icon: FolderOpen },
  { key: "integracoes", labelKey: "settings.integrations", icon: Plug },
  { key: "skills", labelKey: "skills.title", icon: Zap },
  { key: "aparencia", labelKey: "settings.appearance", icon: Palette },
  { key: "sobre", labelKey: "settings.about", icon: Info },
];

const COLOR_PRESETS = [
  "#6366F1", "#8B5CF6", "#A855F7", "#D946EF",
  "#EC4899", "#F43F5E", "#EF4444", "#F97316",
  "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#2563EB", "#6D28D9", "#BE185D",
];

function ProfileSection() {
  const { t } = useTranslation();
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
        <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.myProfile")}</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.profileDesc")}</p>
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
          {t("settings.name")}
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
          {t("settings.avatar")}
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
          {avatarOpen ? t("settings.lessAvatars") : `${t("settings.moreAvatars")} (${AVATAR_PRESETS.reduce((a, g) => a + g.avatars.length, 0)})`}
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
            {t("settings.removeAvatar")}
          </button>
        )}
      </div>

      {/* Color Picker */}
      <div className="card-glow p-6">
        <label className="mb-3 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
          {t("settings.profileColor")}
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
          {saved ? t("settings.saved") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

interface WhamWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
}

interface WhamRateLimit {
  allowed: boolean;
  limit_reached: boolean;
  primary_window: WhamWindow | null;
  secondary_window: WhamWindow | null;
}

interface WhamUsage {
  plan_type?: string;
  rate_limit?: WhamRateLimit;
  code_review_rate_limit?: WhamRateLimit;
}

function OpenAIUsageBars({ usage }: { usage: Record<string, unknown> }) {
  const { t } = useTranslation();
  const wham = usage as unknown as WhamUsage;
  const rl = wham.rate_limit;

  if (!rl) return null;

  const formatResetTime = (resetAt: number) => {
    const d = new Date(resetAt * 1000);
    return d.toLocaleString();
  };

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-stroke2 mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-1">{t("providers.usageLimits")}</p>

      {/* Primary window — session (5h) */}
      {rl.primary_window && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neutral-fg2">{t("providers.session")}</span>
            <span className={cn("text-[10px] font-semibold tabular-nums", rl.primary_window.used_percent >= 80 ? "text-danger" : "text-neutral-fg1")}>
              {Math.round(rl.primary_window.used_percent)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", rl.primary_window.used_percent >= 80 ? "bg-danger" : "bg-emerald-500")}
              style={{ width: `${Math.min(100, rl.primary_window.used_percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Secondary window — weekly (7d) */}
      {rl.secondary_window && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neutral-fg2">{t("providers.weekly")}</span>
            <span className={cn("text-[10px] font-semibold tabular-nums", rl.secondary_window.used_percent >= 80 ? "text-danger" : "text-neutral-fg1")}>
              {Math.round(rl.secondary_window.used_percent)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", rl.secondary_window.used_percent >= 80 ? "bg-danger" : "bg-purple")}
              style={{ width: `${Math.min(100, rl.secondary_window.used_percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Reset time */}
      {rl.primary_window?.reset_at && (
        <p className="text-[9px] text-neutral-fg-disabled mt-0.5">
          Resets {formatResetTime(rl.primary_window.reset_at)}
        </p>
      )}

      {/* Rate limit warning */}
      {rl.limit_reached && (
        <p className="text-[10px] text-danger font-medium mt-1">Rate limit reached</p>
      )}
    </div>
  );
}

function ProvidersSection() {
  const { t } = useTranslation();
  const connection = useUsageStore((s) => s.connection);
  const account = useUsageStore((s) => s.account);
  const limits = useUsageStore((s) => s.limits);
  const fetchConnection = useUsageStore((s) => s.fetchConnection);
  const fetchAccount = useUsageStore((s) => s.fetchAccount);
  const fetchLimits = useUsageStore((s) => s.fetchLimits);
  const [claudeChecking, setClaudeChecking] = useState(false);

  // OpenAI state
  const [openaiStatus, setOpenaiStatus] = useState<{
    connected: boolean; source?: string; masked?: string; email?: string;
    planType?: string; subscriptionActiveUntil?: string;
  } | null>(null);
  const [openaiLoading, setOpenaiLoading] = useState(true);
  const [openaiUsage, setOpenaiUsage] = useState<Record<string, unknown> | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openaiError, setOpenaiError] = useState<string | null>(null);
  const [openaiSuccess, setOpenaiSuccess] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  useEffect(() => {
    fetchConnection();
    fetchAccount();
    fetchLimits();
    fetchOpenAIStatus();
  }, [fetchConnection, fetchAccount, fetchLimits]);

  // Detect OAuth callback success via URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openai_oauth") === "success") {
      window.history.replaceState({}, "", "/settings");
      fetchOpenAIStatus();
    } else if (params.get("openai_oauth") === "error") {
      window.history.replaceState({}, "", "/settings");
      setOpenaiError(t("providers.oauthError"));
    }
  }, [t]);

  const fetchOpenAIUsage = async () => {
    try {
      const data = await api<Record<string, unknown>>("/openai/oauth/usage");
      setOpenaiUsage(data);
    } catch {
      // Usage not available — not critical
    }
  };

  const fetchOpenAIStatus = async () => {
    setOpenaiLoading(true);
    try {
      // Check OAuth first
      const oauthData = await api<{ connected: boolean; source?: string; email?: string; planType?: string; subscriptionActiveUntil?: string }>("/openai/oauth/connection");
      if (oauthData.connected) {
        setOpenaiStatus(oauthData);
        setOpenaiLoading(false);
        fetchOpenAIUsage(); // fetch usage in background
        return;
      }
    } catch { /* fall through */ }
    try {
      // Check API key / env
      const data = await api<{ connected: boolean; masked?: string; source?: string }>("/openai/status");
      setOpenaiStatus(data);
    } catch {
      setOpenaiStatus({ connected: false });
    } finally {
      setOpenaiLoading(false);
    }
  };

  const handleClaudeRecheck = async () => {
    setClaudeChecking(true);
    useUsageStore.setState({ connectionFetched: false, accountFetched: false, limitsLastFetched: null });
    await Promise.all([fetchConnection(), fetchAccount(), fetchLimits()]);
    setClaudeChecking(false);
  };

  const handleClaudeDisconnect = async () => {
    try {
      await api("/usage/disconnect", { method: "POST" });
      useUsageStore.setState({
        connection: { connected: false, email: null, subscriptionType: null, tokenSource: null, apiKeySource: null },
        account: null,
        limits: null,
        connectionFetched: false,
        accountFetched: false,
        limitsFetched: false,
        limitsLastFetched: null,
      });
    } catch {
      // silently fail
    }
  };

  const handleOpenAIApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setOpenaiError(null);
    try {
      const data = await api<{ connected: boolean; masked?: string; error?: string }>("/openai/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (data.connected) {
        setOpenaiStatus({ connected: true, masked: data.masked, source: "db" });
        setApiKey("");
        setOpenaiSuccess(true);
        setShowApiKeyInput(false);
        setTimeout(() => setOpenaiSuccess(false), 3000);
      } else {
        setOpenaiError(data.error ?? "Failed to connect");
      }
    } catch (err) {
      setOpenaiError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAIDisconnect = async () => {
    try {
      if (openaiStatus?.source === "oauth") {
        await api("/openai/oauth/disconnect", { method: "POST" });
      } else {
        await api("/openai/disconnect", { method: "POST" });
      }
      setOpenaiStatus({ connected: false });
      setApiKey("");
    } catch {
      setOpenaiError("Failed to disconnect");
    }
  };

  const claudeConnected = connection?.connected ?? false;
  const claudeEmail = connection?.email ?? account?.email;
  const claudePlan = connection?.subscriptionType ?? account?.subscriptionType;
  const claudeTokenSource = connection?.tokenSource ?? account?.tokenSource;

  const planLabel = claudePlan
    ? claudePlan.toLowerCase().includes("max_20x") || claudePlan.toLowerCase().includes("20x") ? "Max 20x"
    : claudePlan.toLowerCase().includes("max_5x") || claudePlan.toLowerCase().includes("5x") ? "Max 5x"
    : claudePlan.toLowerCase().includes("max") ? "Max"
    : claudePlan.toLowerCase().includes("enterprise") ? "Enterprise"
    : claudePlan.toLowerCase().includes("team") ? "Team"
    : claudePlan.toLowerCase().includes("pro") ? "Pro"
    : claudePlan.toLowerCase().includes("free") ? "Free"
    : claudePlan
    : null;

  const openaiConnected = openaiStatus?.connected ?? false;
  const openaiIsOAuth = openaiStatus?.source === "oauth";
  const openaiIsEnv = openaiStatus?.source === "env";

  const openaiPlanLabel = openaiStatus?.planType
    ? openaiStatus.planType.toLowerCase().includes("pro") ? "Pro"
    : openaiStatus.planType.toLowerCase().includes("plus") ? "Plus"
    : openaiStatus.planType.toLowerCase().includes("enterprise") ? "Enterprise"
    : openaiStatus.planType.toLowerCase().includes("team") ? "Team"
    : openaiStatus.planType.toLowerCase().includes("free") ? "Free"
    : openaiStatus.planType
    : null;

  const openaiSubscriptionActive = openaiStatus?.subscriptionActiveUntil
    ? new Date(openaiStatus.subscriptionActiveUntil) > new Date()
    : false;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.aiProviders")}</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.aiProvidersDesc")}</p>
      </div>

      {/* Two provider cards side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---- Claude (Anthropic) Card ---- */}
        <div className={cn(
          "card-glow p-6 border-2 flex flex-col",
          claudeConnected ? "border-success/30" : "border-danger/30",
        )}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {claudeConnected ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10">
                  <XCircle className="h-5 w-5 text-danger" />
                </div>
              )}
              <div>
                <p className="text-[14px] font-semibold text-neutral-fg1">{t("providers.claude")}</p>
                <p className={cn("text-[11px]", claudeConnected ? "text-success" : "text-danger")}>
                  {claudeConnected ? t("settings.connected") : t("settings.disconnected")}
                </p>
              </div>
            </div>
            {planLabel && (
              <span className="rounded-md bg-brand-light px-2 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">
                {planLabel}
              </span>
            )}
          </div>

          {/* Details */}
          {claudeConnected && (
            <div className="flex flex-col gap-2 pt-3 border-t border-stroke2 mb-4">
              {claudeEmail && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">Email</span>
                  <span className="text-[11px] font-medium text-neutral-fg1 truncate ml-2">{claudeEmail}</span>
                </div>
              )}
              {claudeTokenSource && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">{t("providers.source")}</span>
                  <span className="text-[11px] font-medium text-neutral-fg1 capitalize">
                    {claudeTokenSource === "claude_ai_oauth" ? t("providers.oauth")
                      : claudeTokenSource === "api_key" ? t("providers.apiKey")
                      : claudeTokenSource === "env" ? t("providers.envVar")
                      : claudeTokenSource}
                  </span>
                </div>
              )}
              {planLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">{t("providers.plan")}</span>
                  <span className="text-[11px] font-medium text-neutral-fg1">
                    Claude {planLabel}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-fg3">{t("openai.availableModels")}</span>
                <span className="text-[11px] font-medium text-neutral-fg1">{CLAUDE_MODELS.map((m) => m.label.replace("Claude ", "")).join(", ")}</span>
              </div>
            </div>
          )}

          {/* Usage bars */}
          {claudeConnected && limits && (
            <div className="flex flex-col gap-2 pt-3 border-t border-stroke2 mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-1">{t("providers.usageLimits")}</p>
              {limits.fiveHour && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-fg2">{t("providers.session")}</span>
                    <span className={cn("text-[10px] font-semibold tabular-nums", limits.fiveHour.utilization >= 80 ? "text-danger" : "text-neutral-fg1")}>
                      {Math.round(limits.fiveHour.utilization)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", limits.fiveHour.utilization >= 80 ? "bg-danger" : "bg-brand")} style={{ width: `${Math.min(100, limits.fiveHour.utilization)}%` }} />
                  </div>
                  {limits.fiveHour.resetsAt && (
                    <p className="text-[9px] text-neutral-fg-disabled mt-0.5">
                      Resets {new Date(limits.fiveHour.resetsAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {limits.sevenDay && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-fg2">{t("providers.weekly")}</span>
                    <span className={cn("text-[10px] font-semibold tabular-nums", limits.sevenDay.utilization >= 80 ? "text-danger" : "text-neutral-fg1")}>
                      {Math.round(limits.sevenDay.utilization)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", limits.sevenDay.utilization >= 80 ? "bg-danger" : "bg-purple")} style={{ width: `${Math.min(100, limits.sevenDay.utilization)}%` }} />
                  </div>
                  {limits.sevenDay.resetsAt && (
                    <p className="text-[9px] text-neutral-fg-disabled mt-0.5">
                      Resets {new Date(limits.sevenDay.resetsAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {limits.extraUsage?.isEnabled && (
                <div className="mt-1 pt-2 border-t border-stroke2/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-fg2">Extra Usage</span>
                    <span className={cn("text-[10px] font-semibold tabular-nums", (limits.extraUsage.utilization ?? 0) >= 80 ? "text-danger" : "text-neutral-fg1")}>
                      {formatCurrency(limits.extraUsage.usedCredits)} / {formatCurrency(limits.extraUsage.monthlyLimit)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-bg1 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", (limits.extraUsage.utilization ?? 0) >= 80 ? "bg-danger" : "bg-amber-500")}
                      style={{ width: `${Math.min(100, limits.extraUsage.utilization ?? 0)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action */}
          <div className="mt-auto">
            {claudeConnected ? (
              <div className="flex gap-2">
                <button
                  onClick={handleClaudeRecheck}
                  disabled={claudeChecking}
                  className="flex-1 flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-neutral-fg2 bg-neutral-bg2 border border-stroke hover:bg-neutral-bg-hover transition-all disabled:opacity-50 justify-center"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", claudeChecking && "animate-spin")} />
                  {t("providers.recheck")}
                </button>
                <button
                  onClick={handleClaudeDisconnect}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-danger bg-danger/10 border border-danger/20 hover:bg-danger/20 transition-all justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("providers.disconnect")}
                </button>
              </div>
            ) : (
              <div className="card-glow p-4 bg-neutral-bg3/30">
                <p className="text-[11px] text-neutral-fg3 leading-relaxed">
                  {t("providers.claudeInstructions")}
                </p>
                <p className="text-[11px] text-neutral-fg-disabled mt-2">
                  <code className="rounded bg-neutral-bg3 px-1.5 py-0.5 text-[10px] font-mono text-brand">npm i -g @anthropic-ai/claude-code && claude</code>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- OpenAI Card ---- */}
        <div className={cn(
          "card-glow p-6 border-2 flex flex-col",
          openaiConnected ? "border-success/30" : "border-stroke",
        )}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {openaiConnected ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-bg3">
                  <Cpu className="h-5 w-5 text-neutral-fg3" />
                </div>
              )}
              <div>
                <p className="text-[14px] font-semibold text-neutral-fg1">{t("providers.openai")}</p>
                <p className={cn("text-[11px]", openaiConnected ? "text-success" : "text-neutral-fg3")}>
                  {openaiLoading ? t("common.loading") : openaiConnected ? t("settings.connected") : t("providers.notConnected")}
                </p>
              </div>
            </div>
            {openaiPlanLabel && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                {openaiPlanLabel}
              </span>
            )}
          </div>

          {/* Connected details */}
          {openaiConnected && (
            <div className="flex flex-col gap-2 pt-3 border-t border-stroke2 mb-4">
              {openaiStatus?.email && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">Email</span>
                  <span className="text-[11px] font-medium text-neutral-fg1 truncate ml-2">{openaiStatus.email}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-fg3">{t("providers.source")}</span>
                <span className="text-[11px] font-medium text-neutral-fg1 capitalize">
                  {openaiIsOAuth ? t("providers.oauth") : openaiIsEnv ? t("providers.envVar") : t("providers.apiKey")}
                </span>
              </div>
              {openaiStatus?.masked && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">{t("providers.apiKey")}</span>
                  <span className="text-[11px] font-mono text-neutral-fg-disabled">{openaiStatus.masked}</span>
                </div>
              )}
              {openaiStatus?.planType && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">{t("providers.plan")}</span>
                  <span className="text-[11px] font-medium text-neutral-fg1 capitalize">
                    ChatGPT {openaiPlanLabel}
                  </span>
                </div>
              )}
              {openaiStatus?.subscriptionActiveUntil && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-fg3">{t("providers.subscriptionStatus")}</span>
                  <span className={cn("text-[11px] font-medium", openaiSubscriptionActive ? "text-success" : "text-danger")}>
                    {openaiSubscriptionActive
                      ? `${t("providers.activeUntil")} ${new Date(openaiStatus.subscriptionActiveUntil).toLocaleDateString()}`
                      : t("providers.expired")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-fg3">{t("openai.availableModels")}</span>
                <span className="text-[11px] font-medium text-neutral-fg1">GPT-5.3 Codex, GPT-5.2, o3, o4-mini</span>
              </div>
            </div>
          )}

          {/* OpenAI Usage bars */}
          {openaiConnected && openaiIsOAuth && openaiUsage && (
            <OpenAIUsageBars usage={openaiUsage} />
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-3">
            {openaiConnected && !openaiIsEnv ? (
              <div className="flex gap-2">
                <button
                  onClick={() => fetchOpenAIStatus()}
                  disabled={openaiLoading}
                  className="flex-1 flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-neutral-fg2 bg-neutral-bg2 border border-stroke hover:bg-neutral-bg-hover transition-all justify-center disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", openaiLoading && "animate-spin")} />
                  {t("providers.recheck")}
                </button>
                <button
                  onClick={handleOpenAIDisconnect}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-danger bg-danger/10 border border-danger/20 hover:bg-danger/20 transition-all justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("providers.disconnect")}
                </button>
              </div>
            ) : !openaiConnected ? (
              <>
                {/* Codex CLI instructions */}
                <div className="card-glow p-4 bg-neutral-bg3/30">
                  <p className="text-[11px] text-neutral-fg3 leading-relaxed mb-2">
                    {t("providers.codexInstructions")}
                  </p>
                  <p className="text-[11px] text-neutral-fg-disabled">
                    <code className="rounded bg-neutral-bg3 px-1.5 py-0.5 text-[10px] font-mono text-brand">npm i -g @openai/codex && codex login</code>
                  </p>
                </div>

                {/* Recheck after CLI login */}
                <button
                  onClick={() => fetchOpenAIStatus()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium text-neutral-fg2 bg-neutral-bg2 border border-stroke hover:bg-neutral-bg-hover transition-all w-full justify-center"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("providers.recheck")}
                </button>

                {/* API key fallback */}
                <button
                  onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                  className="text-[11px] font-medium text-neutral-fg3 hover:text-neutral-fg1 transition-colors flex items-center gap-1 justify-center"
                >
                  {showApiKeyInput ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {t("providers.apiKeyFallback")}
                </button>

                {showApiKeyInput && (
                  <div className="rounded-lg border border-stroke bg-neutral-bg3/30 p-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => { setApiKey(e.target.value); setOpenaiError(null); }}
                          placeholder="sk-..."
                          className="w-full input-fluent pr-10 text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-fg3 hover:text-neutral-fg1 transition-colors"
                        >
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <button
                        onClick={handleOpenAIApiKey}
                        disabled={!apiKey.trim() || saving}
                        className="btn-primary rounded-lg px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {t("settings.connect")}
                      </button>
                    </div>
                  </div>
                )}

                {openaiError && (
                  <p className="text-[11px] text-danger">{openaiError}</p>
                )}
                {openaiSuccess && (
                  <p className="text-[11px] text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("providers.oauthSuccess")}
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeMockup({ variant }: { variant: "dark" | "light" | "system" }) {
  const dark = (
    <div className="h-full w-full rounded-md bg-[#1C1917] p-1.5 flex gap-1">
      <div className="w-5 rounded-sm bg-[#292524] flex flex-col gap-1 p-0.5">
        <div className="h-1 w-full rounded-full bg-[#6366F1]" />
        <div className="h-0.5 w-3 rounded-full bg-[#44403C]" />
        <div className="h-0.5 w-3 rounded-full bg-[#44403C]" />
      </div>
      <div className="flex-1 rounded-sm bg-[#292524] p-1 flex flex-col gap-0.5">
        <div className="h-1 w-8 rounded-full bg-[#F5F5F4]" />
        <div className="h-0.5 w-full rounded-full bg-[#44403C]" />
        <div className="h-0.5 w-10 rounded-full bg-[#44403C]" />
        <div className="mt-auto flex gap-0.5">
          <div className="h-2 w-5 rounded-sm bg-[#6366F1]" />
          <div className="h-2 w-5 rounded-sm bg-[#44403C]" />
        </div>
      </div>
    </div>
  );
  const light = (
    <div className="h-full w-full rounded-md bg-[#FFFDF7] p-1.5 flex gap-1 border border-[#E7E5E4]">
      <div className="w-5 rounded-sm bg-[#F5F5F4] flex flex-col gap-1 p-0.5">
        <div className="h-1 w-full rounded-full bg-[#6366F1]" />
        <div className="h-0.5 w-3 rounded-full bg-[#D6D3D1]" />
        <div className="h-0.5 w-3 rounded-full bg-[#D6D3D1]" />
      </div>
      <div className="flex-1 rounded-sm bg-white p-1 flex flex-col gap-0.5 border border-[#E7E5E4]">
        <div className="h-1 w-8 rounded-full bg-[#1C1917]" />
        <div className="h-0.5 w-full rounded-full bg-[#D6D3D1]" />
        <div className="h-0.5 w-10 rounded-full bg-[#D6D3D1]" />
        <div className="mt-auto flex gap-0.5">
          <div className="h-2 w-5 rounded-sm bg-[#6366F1]" />
          <div className="h-2 w-5 rounded-sm bg-[#E7E5E4]" />
        </div>
      </div>
    </div>
  );

  if (variant === "dark") return dark;
  if (variant === "light") return light;
  // system: split
  return (
    <div className="h-full w-full rounded-md overflow-hidden flex">
      <div className="w-1/2 overflow-hidden">{dark}</div>
      <div className="w-1/2 overflow-hidden">{light}</div>
    </div>
  );
}

function ThemeSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();

  const options: { value: "system" | "dark" | "light"; labelKey: string; descKey: string }[] = [
    { value: "system", labelKey: "settings.system", descKey: "settings.systemDesc" },
    { value: "dark", labelKey: "settings.dark", descKey: "settings.darkDesc" },
    { value: "light", labelKey: "settings.light", descKey: "settings.lightDesc" },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.theme")}</h3>
        <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.themeDesc")}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {options.map((opt) => {
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "group flex flex-col items-center gap-3 rounded-xl p-4 transition-all",
                isActive
                  ? "bg-brand-light ring-2 ring-brand"
                  : "bg-neutral-bg3/50 ring-1 ring-stroke hover:ring-brand/40 hover:bg-neutral-bg-hover",
              )}
            >
              <div className="h-16 w-full">
                <ThemeMockup variant={opt.value} />
              </div>
              <div className="text-center">
                <p className={cn("text-[12px] font-semibold", isActive ? "text-brand" : "text-neutral-fg2")}>
                  {t(opt.labelKey)}
                </p>
                <p className="text-[10px] text-neutral-fg3 mt-0.5">{t(opt.descKey)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("perfil");
  const [workspacePath, setWorkspacePath] = useState(
    () => localStorage.getItem("agenthub:workspacePath") ?? "",
  );
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);

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
        <span className="text-[13px] font-semibold text-neutral-fg1">{t("settings.title")}</span>
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
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10">
          <div className="mx-auto max-w-2xl">
            {activeTab === "perfil" && <ProfileSection />}

            {activeTab === "providers" && <ProvidersSection />}

            {activeTab === "geral" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div className="card-glow p-8">
                  <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.workspace")}</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.workspaceDesc")}</p>
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
                      {t("common.save")}
                    </button>
                  </div>
                </div>

                {/* Language Switcher */}
                <div className="card-glow p-8">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="h-4 w-4 text-brand" />
                    <h3 className="text-title text-neutral-fg1">{t("settings.language")}</h3>
                  </div>
                  <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.languageDesc")}</p>
                  <div className="flex flex-col gap-2">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const isActive = i18n.language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => i18n.changeLanguage(lang.code)}
                          className={cn(
                            "card-glow flex items-center gap-4 px-5 py-3.5 text-left transition-all",
                            isActive && "border-2 border-brand",
                          )}
                        >
                          <img
                            src={`https://flagcdn.com/w40/${lang.flag.toLowerCase()}.png`}
                            srcSet={`https://flagcdn.com/w80/${lang.flag.toLowerCase()}.png 2x`}
                            alt={lang.label}
                            className="h-5 w-7 rounded-sm object-cover"
                          />
                          <div>
                            <p className={cn("text-[13px] font-semibold", isActive ? "text-brand" : "text-neutral-fg1")}>
                              {lang.label}
                            </p>
                            <p className="text-[11px] text-neutral-fg3">{lang.code}</p>
                          </div>
                          {isActive && (
                            <Check className="ml-auto h-4 w-4 text-brand" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "integracoes" && (
              <div className="flex flex-col gap-8 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.integrations")}</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">
                    {t("settings.integrations")}
                  </p>
                </div>

                {/* Project selector */}
                {projects.length > 1 && (
                  <div className="card-glow p-4">
                    <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                      {t("project.overview")}
                    </label>
                    <select
                      value={activeProjectId ?? ""}
                      onChange={(e) => setActiveProject(e.target.value || null)}
                      className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                    >
                      <option value="" disabled>{t("project.overview")}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {projects.length === 0 && (
                  <div className="card-glow px-6 py-8 text-center text-[13px] text-neutral-fg-disabled">
                    {t("dashboard.noProjects")}
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

            {activeTab === "skills" && <SkillList />}

            {activeTab === "aparencia" && <ThemeSection />}

            {activeTab === "sobre" && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <div>
                  <h3 className="text-title text-neutral-fg1 mb-1">{t("settings.aboutTitle")}</h3>
                  <p className="text-[12px] text-neutral-fg3 mb-6">{t("settings.about")}</p>
                </div>
                <dl className="flex flex-col divide-y divide-stroke2 card-glow overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">{t("settings.version")}</dt>
                    <dd className="text-[13px] font-semibold text-brand">0.15.0</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">{t("settings.agentSdk")}</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">Claude + OpenAI</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">{t("settings.database")}</dt>
                    <dd className="text-[13px] font-semibold text-neutral-fg1">SQLite (libsql)</dd>
                  </div>
                  <div className="flex items-center justify-between px-6 py-4">
                    <dt className="text-[13px] text-neutral-fg2">{t("settings.repository")}</dt>
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
