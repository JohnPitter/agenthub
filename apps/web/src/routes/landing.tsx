import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Zap, GitBranch, MessageSquare, Activity, BarChart3, Code2,
  ArrowRight, Github, Shield, Bot
} from "lucide-react";

const FEATURES = [
  { icon: Bot, titleKey: "landing.featureAgentsTitle", descKey: "landing.featureAgentsDesc", color: "text-brand", bg: "bg-brand-light" },
  { icon: GitBranch, titleKey: "landing.featureGitTitle", descKey: "landing.featureGitDesc", color: "text-purple", bg: "bg-purple-light" },
  { icon: MessageSquare, titleKey: "landing.featureReviewTitle", descKey: "landing.featureReviewDesc", color: "text-success", bg: "bg-success-light" },
  { icon: Activity, titleKey: "landing.featureRealtimeTitle", descKey: "landing.featureRealtimeDesc", color: "text-warning", bg: "bg-warning-light" },
  { icon: BarChart3, titleKey: "landing.featureAnalyticsTitle", descKey: "landing.featureAnalyticsDesc", color: "text-info", bg: "bg-info-light" },
  { icon: Code2, titleKey: "landing.featureEditorTitle", descKey: "landing.featureEditorDesc", color: "text-orange", bg: "bg-orange/10" },
];

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-app-bg text-neutral-fg1">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple shadow-brand">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[18px] font-semibold tracking-tight">AgentHub</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium"
          >
            <Github className="h-4 w-4" />
            {t("landing.login")}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-32 max-w-7xl mx-auto px-8">
        {/* Glow effects */}
        <div className="glow-orb glow-orb-brand absolute left-1/4 top-0 h-[500px] w-[500px]" />
        <div className="glow-orb glow-orb-purple absolute right-1/4 top-20 h-[400px] w-[400px]" />

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-light px-4 py-1.5 text-[12px] font-semibold text-brand mb-8">
            <Zap className="h-3.5 w-3.5" />
            Powered by Claude Agent SDK
          </div>

          <h1 className="text-[52px] font-bold leading-[1.1] tracking-tight">
            {t("landing.hero")}
          </h1>

          <p className="mt-6 text-[18px] text-neutral-fg2 leading-relaxed max-w-2xl mx-auto">
            {t("landing.heroSub")}
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/login"
              className="btn-primary flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold"
            >
              {t("landing.getStarted")}
              <ArrowRight className="h-4.5 w-4.5" />
            </Link>
            <a
              href="https://github.com/JohnPitter/agenthub"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-medium"
            >
              <Github className="h-4.5 w-4.5" />
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-8 pb-32">
        <div className="text-center mb-16">
          <h2 className="text-[32px] font-bold tracking-tight">{t("landing.featuresTitle")}</h2>
          <p className="mt-3 text-[16px] text-neutral-fg2">
            {t("landing.featuresSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div key={feature.titleKey} className="card-interactive p-6">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-4`}>
                <feature.icon className={`h-5.5 w-5.5 ${feature.color}`} strokeWidth={1.8} />
              </div>
              <h3 className="text-[16px] font-semibold text-neutral-fg1 mb-2">{t(feature.titleKey)}</h3>
              <p className="text-[14px] text-neutral-fg2 leading-relaxed">{t(feature.descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-8 pb-24">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand/10 via-purple/5 to-transparent border border-stroke p-16 text-center">
          <div className="glow-orb glow-orb-brand absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2" />
          <div className="relative z-10">
            <Shield className="h-10 w-10 text-brand mx-auto mb-4" strokeWidth={1.5} />
            <h2 className="text-[28px] font-bold tracking-tight mb-3">{t("landing.ctaTitle")}</h2>
            <p className="text-[16px] text-neutral-fg2 mb-8 max-w-lg mx-auto">
              {t("landing.ctaSubtitle")}
            </p>
            <Link
              to="/login"
              className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold"
            >
              {t("landing.ctaButton")}
              <ArrowRight className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stroke2 py-8 text-center">
        <p className="text-[13px] text-neutral-fg-disabled">
          &copy; {new Date().getFullYear()} AgentHub. Built with Claude Agent SDK.
        </p>
      </footer>
    </div>
  );
}
