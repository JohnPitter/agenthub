import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Palette, Info, ExternalLink, Plug, User, ChevronDown, ChevronUp, Check, Globe, Zap } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import { WhatsAppConfig } from "../components/integrations/whatsapp-config";
import { TelegramConfig } from "../components/integrations/telegram-config";
import { SUPPORTED_LANGUAGES } from "../i18n/i18n";
import { useThemeStore } from "../stores/theme-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useUserStore } from "../stores/user-store";
import { AVATAR_PRESETS, getAgentAvatarUrl } from "../lib/agent-avatar";
import { SkillList } from "../components/skills/skill-list";

type SettingsTab = "perfil" | "geral" | "integracoes" | "skills" | "aparencia" | "sobre";

const TABS: { key: SettingsTab; labelKey: string; icon: typeof FolderOpen }[] = [
  { key: "perfil", labelKey: "settings.profile", icon: User },
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
    setProfile({ name: draftName.trim() || t("settings.defaultUser"), avatar: draftAvatar, color: draftColor });
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
        <p className="text-[15px] font-semibold text-neutral-fg1">{draftName || t("settings.defaultUser")}</p>
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
          placeholder={t("settings.namePlaceholder")}
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
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);

  // Auto-select first project if none is active (so integrations work)
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(projects[0].id);
    }
  }, [activeProjectId, projects, setActiveProject]);

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

            {activeTab === "geral" && (
              <div className="flex flex-col gap-6 animate-fade-up">
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
