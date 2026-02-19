import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { X, Lightbulb, Keyboard, Sparkles } from "lucide-react";
import { resolveHelpKey, HELP_PAGES } from "./help-content";

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_KEYS: Record<string, string> = {
  search: "Ctrl+K",
  toggleHelp: "Shift+?",
  saveFile: "Ctrl+S",
};

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  if (!open) return null;

  const pageKey = resolveHelpKey(pathname);
  const config = HELP_PAGES[pageKey];
  const Icon = config.icon;

  const features = Array.from({ length: config.featureCount }, (_, i) =>
    t(`help.${pageKey}.feature_${i}`)
  );
  const tips = Array.from({ length: config.tipCount }, (_, i) =>
    t(`help.${pageKey}.tip_${i}`)
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-neutral-bg1 shadow-16 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideInRight 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light">
              <Icon className="h-4.5 w-4.5 text-brand" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-neutral-fg1">
                {t(`help.${pageKey}.title`)}
              </h2>
              <p className="text-[11px] text-neutral-fg3">{t("help.contextualHelp")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Purpose */}
          <p className="text-[13px] leading-relaxed text-neutral-fg2">
            {t(`help.${pageKey}.purpose`)}
          </p>

          {/* Features */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
              <span className="text-[12px] font-semibold text-neutral-fg1 uppercase tracking-wider">
                {t("help.sections.features")}
              </span>
            </div>
            <div className="space-y-2">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg bg-neutral-bg2 px-3 py-2.5"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span className="text-[13px] text-neutral-fg2">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard className="h-3.5 w-3.5 text-purple" strokeWidth={2} />
              <span className="text-[12px] font-semibold text-neutral-fg1 uppercase tracking-wider">
                {t("help.sections.shortcuts")}
              </span>
            </div>
            <div className="space-y-2">
              {config.shortcuts.map((shortcut) => (
                <div
                  key={shortcut}
                  className="flex items-center justify-between rounded-lg bg-neutral-bg2 px-3 py-2.5"
                >
                  <span className="text-[13px] text-neutral-fg2">
                    {t(`help.shortcuts.${shortcut}`)}
                  </span>
                  <kbd className="rounded-md bg-neutral-bg1 border border-stroke px-2 py-0.5 text-[11px] font-semibold text-neutral-fg3">
                    {SHORTCUT_KEYS[shortcut]}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-3.5 w-3.5 text-warning" strokeWidth={2} />
              <span className="text-[12px] font-semibold text-neutral-fg1 uppercase tracking-wider">
                {t("help.sections.tips")}
              </span>
            </div>
            <div className="space-y-2">
              {tips.map((tip, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-warning-light/50 border border-warning/20 px-3 py-2.5"
                >
                  <span className="text-[13px] text-neutral-fg2">{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-stroke2 px-5 py-3 flex items-center justify-center gap-2">
          <span className="text-[11px] text-neutral-fg3">{t("help.footer")}</span>
          <kbd className="rounded-md bg-neutral-bg2 border border-stroke px-1.5 py-0.5 text-[10px] font-semibold text-neutral-fg3">
            Shift+?
          </kbd>
        </div>
      </div>
    </div>
  );
}
