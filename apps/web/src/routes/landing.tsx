import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Zap, GitBranch, MessageSquare, Activity, BarChart3, Code2,
  ArrowRight, Github, Shield, Bot, Layers, Workflow, Eye,
  Smartphone, Brain, Terminal, Sparkles, Users, FileCode,
  Search, Wrench, BookOpen,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const SORA = "'Sora', var(--font-sans)";

/* ── Scroll-reveal wrapper ─────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(28px)",
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Animated counter ──────────────────────────────── */

function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          started = true;
          obs.disconnect();
          const t0 = performance.now();
          const animate = (now: number) => {
            const p = Math.min((now - t0) / 1800, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(eased * end));
            if (p < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [end]);

  return <span ref={ref}>{value}{suffix}</span>;
}

/* ── Dashboard Preview (replaces terminal) ─────────── */

function DashboardPreview() {
  return (
    <div className="relative mx-auto max-w-3xl mt-14 md:mt-20">
      {/* Ambient glow */}
      <div className="absolute -inset-8 rounded-3xl bg-gradient-to-b from-brand/6 via-purple/4 to-transparent blur-2xl pointer-events-none" />

      {/* Gradient border effect */}
      <div className="relative rounded-xl overflow-hidden p-px bg-gradient-to-br from-brand/30 via-stroke to-purple/20">
        <div className="rounded-[11px] bg-neutral-bg2/95 backdrop-blur-sm overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stroke2 bg-neutral-bg3/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/50" />
              <div className="w-3 h-3 rounded-full bg-warning/50" />
              <div className="w-3 h-3 rounded-full bg-success/50" />
            </div>
            <span className="text-[11px] text-neutral-fg3 ml-2 font-mono tracking-wide">
              AgentHub — Dashboard
            </span>
          </div>

          {/* Dashboard content — agent activity feed */}
          <div className="p-5 md:p-6 space-y-3.5">
            {/* Task header */}
            <div className="flex items-center gap-2.5 pb-3 border-b border-stroke2/50">
              <div className="h-6 w-6 rounded-md bg-brand/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-brand" />
              </div>
              <span className="text-[13px] font-semibold text-neutral-fg1">Implementar autenticação OAuth</span>
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">Em Progresso</span>
            </div>

            {/* Agent activity lines */}
            <div className="space-y-2.5 text-[12px] md:text-[13px]">
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-purple/10 flex items-center justify-center mt-0.5 shrink-0">
                  <Search className="h-3 w-3 text-purple" />
                </div>
                <div>
                  <span className="text-neutral-fg2 font-medium">Arquiteto</span>
                  <span className="text-neutral-fg3"> analisou requisitos → </span>
                  <span className="text-neutral-fg1 font-medium">3 subtasks criadas</span>
                </div>
                <span className="text-[10px] text-neutral-fg-disabled ml-auto shrink-0">2m atrás</span>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-brand/10 flex items-center justify-center mt-0.5 shrink-0">
                  <FileCode className="h-3 w-3 text-brand" />
                </div>
                <div>
                  <span className="text-neutral-fg2 font-medium">Backend Dev</span>
                  <span className="text-neutral-fg3"> codando → </span>
                  <span className="text-success text-[11px]">+auth-service.ts</span>
                  <span className="text-neutral-fg-disabled mx-1">·</span>
                  <span className="text-warning text-[11px]">~middleware/auth.ts</span>
                </div>
                <span className="text-[10px] text-neutral-fg-disabled ml-auto shrink-0">1m atrás</span>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center mt-0.5 shrink-0">
                  <Eye className="h-3 w-3 text-success" />
                </div>
                <div>
                  <span className="text-neutral-fg2 font-medium">Code Reviewer</span>
                  <span className="text-neutral-fg3"> revisou → </span>
                  <span className="text-success font-medium">Aprovado</span>
                  <span className="text-neutral-fg3"> — 0 issues</span>
                </div>
                <span className="text-[10px] text-neutral-fg-disabled ml-auto shrink-0">30s atrás</span>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-purple/10 flex items-center justify-center mt-0.5 shrink-0">
                  <GitBranch className="h-3 w-3 text-purple" />
                </div>
                <div>
                  <span className="text-neutral-fg2 font-medium">DevOps</span>
                  <span className="text-neutral-fg3"> push → </span>
                  <span className="text-purple font-mono text-[11px]">feature/oauth</span>
                  <span className="text-neutral-fg3"> → </span>
                  <span className="text-info font-medium">PR #47 criada</span>
                </div>
                <span className="text-[10px] text-neutral-fg-disabled ml-auto shrink-0">agora</span>
              </div>
            </div>

            {/* WhatsApp notification teaser */}
            <div className="mt-3 pt-3 border-t border-stroke2/50 flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                <Smartphone className="h-3 w-3 text-success" />
              </div>
              <span className="text-[11px] text-neutral-fg3">
                📱 WhatsApp: <span className="text-neutral-fg2">"Task #47 concluída — PR pronta para review"</span>
              </span>
              <span
                className="inline-block w-[7px] h-[15px] bg-brand/70 ml-auto rounded-[1px]"
                style={{ animation: "blink 1.2s step-end infinite" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Agent Role Card ───────────────────────────────── */

function AgentRoleCard({
  icon: Icon,
  name,
  desc,
  color,
  bg,
  delay,
}: {
  icon: typeof Bot;
  name: string;
  desc: string;
  color: string;
  bg: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="group flex items-center gap-4 p-4 rounded-xl border border-stroke/50 bg-neutral-bg2/30 hover:border-brand/20 hover:bg-neutral-bg2/60 transition-all duration-300">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg} transition-transform duration-300 group-hover:scale-110 shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-neutral-fg1" style={{ fontFamily: SORA }}>{name}</div>
          <div className="text-[12px] text-neutral-fg3 leading-snug">{desc}</div>
        </div>
      </div>
    </Reveal>
  );
}

/* ── Feature data ──────────────────────────────────── */

const FEATURES = [
  { icon: Bot, titleKey: "landing.featureAgentsTitle", descKey: "landing.featureAgentsDesc", color: "text-brand", bg: "bg-brand-light", span: "md:col-span-2" },
  { icon: Smartphone, titleKey: "landing.featureWhatsappTitle", descKey: "landing.featureWhatsappDesc", color: "text-success", bg: "bg-success-light", span: "" },
  { icon: GitBranch, titleKey: "landing.featureGitTitle", descKey: "landing.featureGitDesc", color: "text-purple", bg: "bg-purple-light", span: "" },
  { icon: Brain, titleKey: "landing.featureMultiModelTitle", descKey: "landing.featureMultiModelDesc", color: "text-info", bg: "bg-info-light", span: "md:col-span-2" },
  { icon: MessageSquare, titleKey: "landing.featureReviewTitle", descKey: "landing.featureReviewDesc", color: "text-warning", bg: "bg-warning-light", span: "" },
  { icon: Activity, titleKey: "landing.featureRealtimeTitle", descKey: "landing.featureRealtimeDesc", color: "text-orange", bg: "bg-orange/10", span: "md:col-span-2" },
  { icon: Code2, titleKey: "landing.featureEditorTitle", descKey: "landing.featureEditorDesc", color: "text-purple", bg: "bg-purple-light", span: "" },
  { icon: BarChart3, titleKey: "landing.featureAnalyticsTitle", descKey: "landing.featureAnalyticsDesc", color: "text-info", bg: "bg-info-light", span: "md:col-span-2" },
];

const STEPS = [
  { num: "01", titleKey: "landing.step1Title", descKey: "landing.step1Desc", icon: Layers },
  { num: "02", titleKey: "landing.step2Title", descKey: "landing.step2Desc", icon: Workflow },
  { num: "03", titleKey: "landing.step3Title", descKey: "landing.step3Desc", icon: Eye },
];

const AGENT_ROLES = [
  { icon: Search, nameKey: "landing.agentArchitect", descKey: "landing.agentArchitectDesc", color: "text-purple", bg: "bg-purple-light" },
  { icon: FileCode, nameKey: "landing.agentBackend", descKey: "landing.agentBackendDesc", color: "text-brand", bg: "bg-brand-light" },
  { icon: Layers, nameKey: "landing.agentFrontend", descKey: "landing.agentFrontendDesc", color: "text-info", bg: "bg-info-light" },
  { icon: Shield, nameKey: "landing.agentQA", descKey: "landing.agentQADesc", color: "text-success", bg: "bg-success-light" },
  { icon: Eye, nameKey: "landing.agentReviewer", descKey: "landing.agentReviewerDesc", color: "text-warning", bg: "bg-warning-light" },
  { icon: Wrench, nameKey: "landing.agentDevOps", descKey: "landing.agentDevOpsDesc", color: "text-orange", bg: "bg-orange/10" },
  { icon: BookOpen, nameKey: "landing.agentDocWriter", descKey: "landing.agentDocWriterDesc", color: "text-neutral-fg2", bg: "bg-neutral-bg3" },
];

/* ── Main Landing Page ─────────────────────────────── */

export function LandingPage() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="min-h-screen bg-app-bg text-neutral-fg1 overflow-x-hidden">
      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="glow-orb glow-orb-brand absolute -left-48 -top-24 h-[600px] w-[600px]"
          style={{ animation: "float 8s ease-in-out infinite" }}
        />
        <div
          className="glow-orb glow-orb-purple absolute -right-48 top-32 h-[500px] w-[500px]"
          style={{ animation: "float 8s ease-in-out infinite 2s" }}
        />
        <div className="dot-pattern absolute inset-0 opacity-30" />
      </div>

      {/* ── Mouse-following glow ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mouse.x}px ${mouse.y}px, rgba(99,102,241,0.06), transparent 70%)`,
        }}
      />

      {/* ── Nav ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "glass-strong shadow-xs" : ""
        }`}
      >
        <div className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple shadow-brand">
              <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span
              className="text-[17px] font-bold tracking-tight"
              style={{ fontFamily: SORA }}
            >
              AgentHub
            </span>
          </div>
          <Link
            to="/login"
            className="btn-primary flex items-center gap-2 px-5 py-2 text-[13px] font-medium"
          >
            <Github className="h-4 w-4" />
            {t("landing.login")}
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-28 md:pt-36 pb-4 max-w-7xl mx-auto px-6 md:px-8">
        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-light px-4 py-1.5 text-[12px] font-semibold text-brand mb-8">
              <Sparkles className="h-3.5 w-3.5" />
              {t("landing.badge")}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h1
              className="text-gradient-brand"
              style={{
                fontFamily: SORA,
                fontSize: "clamp(38px, 6vw, 72px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
              }}
            >
              {t("landing.hero")}
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p
              className="mt-6 text-neutral-fg2 leading-relaxed max-w-2xl mx-auto"
              style={{ fontSize: "clamp(16px, 2vw, 20px)" }}
            >
              {t("landing.heroSub")}
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
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
          </Reveal>
        </div>

        <Reveal delay={0.5}>
          <DashboardPreview />
        </Reveal>
      </section>

      {/* ── Stats bar ── */}
      <Reveal>
        <section className="relative z-10 border-y border-stroke/50 bg-neutral-bg2/30 backdrop-blur-sm mt-16 md:mt-24">
          <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-stroke/50">
            {[
              { value: 7, suffix: "", label: t("landing.statsAgents") },
              { value: 5, suffix: "+", label: t("landing.statsModels") },
              { value: 4, suffix: "", label: t("landing.statsIntegrations") },
              { value: 100, suffix: "%", label: t("landing.statsRealtime") },
            ].map((stat, i) => (
              <div key={i} className="text-center md:px-8">
                <div
                  className="text-gradient-brand font-bold tracking-tight"
                  style={{
                    fontFamily: SORA,
                    fontSize: "clamp(32px, 4vw, 48px)",
                  }}
                >
                  <Counter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-[12px] text-neutral-fg3 mt-1.5 uppercase tracking-[0.1em] font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Agent Roles ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="text-center mb-14">
            <div className="text-[12px] font-semibold text-purple uppercase tracking-[0.15em] mb-4">
              {t("landing.agentsSectionLabel")}
            </div>
            <h2
              className="font-bold tracking-tight"
              style={{
                fontFamily: SORA,
                fontSize: "clamp(28px, 4vw, 44px)",
              }}
            >
              {t("landing.agentsTitle")}
            </h2>
            <p className="mt-4 text-[16px] text-neutral-fg2 max-w-lg mx-auto leading-relaxed">
              {t("landing.agentsSubtitle")}
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-4xl mx-auto">
          {AGENT_ROLES.map((role, i) => (
            <AgentRoleCard
              key={role.nameKey}
              icon={role.icon}
              name={t(role.nameKey)}
              desc={t(role.descKey)}
              color={role.color}
              bg={role.bg}
              delay={0.05 * i}
            />
          ))}
        </div>
      </section>

      {/* ── Section divider ── */}
      <div className="section-divider max-w-3xl mx-auto" />

      {/* ── Features (Bento grid) ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="text-center mb-16">
            <div className="text-[12px] font-semibold text-brand uppercase tracking-[0.15em] mb-4">
              {t("landing.featuresSectionLabel")}
            </div>
            <h2
              className="font-bold tracking-tight"
              style={{
                fontFamily: SORA,
                fontSize: "clamp(28px, 4vw, 44px)",
              }}
            >
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-4 text-[16px] text-neutral-fg2 max-w-lg mx-auto leading-relaxed">
              {t("landing.featuresSubtitle")}
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.titleKey} delay={0.06 * i} className={feature.span}>
              <div className="card-glow group p-6 md:p-7 h-full">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}
                >
                  <feature.icon
                    className={`h-5.5 w-5.5 ${feature.color}`}
                    strokeWidth={1.8}
                  />
                </div>
                <h3
                  className="text-[16px] font-semibold text-neutral-fg1 mb-2"
                  style={{ fontFamily: SORA }}
                >
                  {t(feature.titleKey)}
                </h3>
                <p className="text-[14px] text-neutral-fg2 leading-relaxed">
                  {t(feature.descKey)}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Section divider ── */}
      <div className="section-divider max-w-3xl mx-auto" />

      {/* ── How It Works ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="text-center mb-20">
            <div className="text-[12px] font-semibold text-purple uppercase tracking-[0.15em] mb-4">
              {t("landing.howItWorksSectionLabel")}
            </div>
            <h2
              className="font-bold tracking-tight"
              style={{
                fontFamily: SORA,
                fontSize: "clamp(28px, 4vw, 44px)",
              }}
            >
              {t("landing.howItWorksTitle")}
            </h2>
            <p className="mt-4 text-[16px] text-neutral-fg2 max-w-md mx-auto leading-relaxed">
              {t("landing.howItWorksSubtitle")}
            </p>
          </div>
        </Reveal>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {/* Connecting gradient line (desktop) */}
          <div className="hidden md:block absolute top-[60px] left-[20%] right-[20%] h-px">
            <div className="h-full bg-gradient-to-r from-brand/40 via-purple/40 to-brand/40" />
          </div>

          {STEPS.map((step, i) => (
            <Reveal key={step.num} delay={0.12 * i}>
              <div className="text-center relative">
                <div className="relative z-10 inline-flex items-center justify-center w-[120px] h-[120px] rounded-2xl bg-neutral-bg2 border border-stroke mb-8 transition-all duration-300 hover:border-brand/30 hover:shadow-glow">
                  <step.icon
                    className="h-12 w-12 text-brand"
                    strokeWidth={1.3}
                  />
                </div>
                <div className="text-[13px] font-bold tracking-[0.2em] text-brand/70 uppercase mb-3">
                  {t("landing.stepLabel")} {step.num}
                </div>
                <h3
                  className="text-[20px] font-semibold mb-3"
                  style={{ fontFamily: SORA }}
                >
                  {t(step.titleKey)}
                </h3>
                <p className="text-[14px] text-neutral-fg2 leading-relaxed max-w-xs mx-auto">
                  {t(step.descKey)}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Section divider ── */}
      <div className="section-divider max-w-3xl mx-auto" />

      {/* ── CTA ── */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-stroke p-10 md:p-16 text-center">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand/8 via-purple/4 to-transparent" />
            <div className="glow-orb glow-orb-brand absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 opacity-60" />

            <div className="relative z-10">
              <Users className="h-10 w-10 text-brand mx-auto mb-6" strokeWidth={1.5} />
              <h2
                className="font-bold tracking-tight mb-4"
                style={{
                  fontFamily: SORA,
                  fontSize: "clamp(24px, 3.5vw, 36px)",
                }}
              >
                {t("landing.ctaTitle")}
              </h2>
              <p className="text-[16px] text-neutral-fg2 mb-8 max-w-lg mx-auto leading-relaxed">
                {t("landing.ctaSubtitle")}
              </p>
              <Link
                to="/login"
                className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-[15px] font-semibold"
              >
                {t("landing.ctaButton")}
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>

              {/* CLI note */}
              <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-neutral-fg3">
                <Terminal className="h-4 w-4" />
                {t("landing.cliNote")}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-stroke2 py-8">
        <div className="max-w-7xl mx-auto px-6 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand to-purple">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span
              className="text-[13px] text-neutral-fg3 font-semibold"
              style={{ fontFamily: SORA }}
            >
              AgentHub
            </span>
          </div>
          <p className="text-[12px] text-neutral-fg-disabled">
            &copy; {new Date().getFullYear()} AgentHub. Multi-Agent Orchestration Platform.
          </p>
          <a
            href="https://github.com/JohnPitter/agenthub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-neutral-fg3 hover:text-neutral-fg1 transition-colors flex items-center gap-1.5"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
