import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Zap, GitBranch, MessageSquare, Activity, BarChart3, Code2,
  ArrowRight, Github, Shield, Bot, Layers, Workflow, Eye,
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

/* ── Terminal Preview ──────────────────────────────── */

function TerminalPreview() {
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
              AgentHub Terminal
            </span>
          </div>

          {/* Terminal content */}
          <div className="p-5 md:p-6 font-mono text-[12px] md:text-[13px] leading-[1.8] space-y-2.5">
            <div className="text-neutral-fg2">
              <span className="text-brand font-semibold">$</span>{" "}
              agenthub task:run{" "}
              <span className="text-success">&quot;Implementar autenticação OAuth&quot;</span>
            </div>

            <div className="space-y-1 pl-2 border-l-2 border-brand/15 ml-1">
              <div>
                <span className="text-brand">▸</span>{" "}
                <span className="text-neutral-fg2">Arquiteto analisando requisitos...</span>
              </div>
              <div>
                <span className="text-success">✓</span>{" "}
                <span className="text-neutral-fg1">Plano criado</span>{" "}
                <span className="text-neutral-fg3">— 3 subtasks</span>
              </div>
            </div>

            <div className="space-y-1 pl-2 border-l-2 border-purple/15 ml-1">
              <div>
                <span className="text-purple">▸</span>{" "}
                <span className="text-neutral-fg2">Backend Dev codando...</span>
              </div>
              <div className="text-neutral-fg3 pl-3">
                → src/services/auth-service.ts{" "}
                <span className="text-success">(criado)</span>
              </div>
              <div className="text-neutral-fg3 pl-3">
                → src/middleware/auth.ts{" "}
                <span className="text-warning">(modificado)</span>
              </div>
              <div>
                <span className="text-success">✓</span>{" "}
                <span className="text-neutral-fg1">3 arquivos modificados</span>
              </div>
            </div>

            <div className="space-y-1 pl-2 border-l-2 border-info/15 ml-1">
              <div>
                <span className="text-info">▸</span>{" "}
                <span className="text-neutral-fg2">QA revisando código...</span>
              </div>
              <div>
                <span className="text-success">✓</span>{" "}
                <span className="text-neutral-fg1">Code review aprovado</span>{" "}
                <span className="text-neutral-fg3">— 0 issues</span>
              </div>
            </div>

            <div className="space-y-1 pl-2 border-l-2 border-success/15 ml-1">
              <div>
                <span className="text-brand">▸</span>{" "}
                Git push →{" "}
                <span className="text-purple">feature/oauth-auth</span>
              </div>
              <div>
                <span className="text-success">✓</span>{" "}
                <span className="text-neutral-fg1">PR #47 criada</span>
              </div>
            </div>

            <div className="pt-1.5 flex items-center gap-1.5">
              <span className="text-success font-semibold">✓ Task concluída</span>{" "}
              <span className="text-neutral-fg3">em 4m 32s</span>
              <span
                className="inline-block w-[7px] h-[15px] bg-brand/70 ml-0.5 rounded-[1px]"
                style={{ animation: "blink 1.2s step-end infinite" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature data ──────────────────────────────────── */

const FEATURES = [
  { icon: Bot, titleKey: "landing.featureAgentsTitle", descKey: "landing.featureAgentsDesc", color: "text-brand", bg: "bg-brand-light", span: "md:col-span-2" },
  { icon: GitBranch, titleKey: "landing.featureGitTitle", descKey: "landing.featureGitDesc", color: "text-purple", bg: "bg-purple-light", span: "" },
  { icon: MessageSquare, titleKey: "landing.featureReviewTitle", descKey: "landing.featureReviewDesc", color: "text-success", bg: "bg-success-light", span: "" },
  { icon: Activity, titleKey: "landing.featureRealtimeTitle", descKey: "landing.featureRealtimeDesc", color: "text-warning", bg: "bg-warning-light", span: "md:col-span-2" },
  { icon: Code2, titleKey: "landing.featureEditorTitle", descKey: "landing.featureEditorDesc", color: "text-orange", bg: "bg-orange/10", span: "" },
  { icon: BarChart3, titleKey: "landing.featureAnalyticsTitle", descKey: "landing.featureAnalyticsDesc", color: "text-info", bg: "bg-info-light", span: "md:col-span-2" },
];

const STEPS = [
  { num: "01", titleKey: "landing.step1Title", descKey: "landing.step1Desc", icon: Layers },
  { num: "02", titleKey: "landing.step2Title", descKey: "landing.step2Desc", icon: Workflow },
  { num: "03", titleKey: "landing.step3Title", descKey: "landing.step3Desc", icon: Eye },
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
              <Zap className="h-3.5 w-3.5" />
              Powered by Claude Agent SDK
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
          <TerminalPreview />
        </Reveal>
      </section>

      {/* ── Stats bar ── */}
      <Reveal>
        <section className="relative z-10 border-y border-stroke/50 bg-neutral-bg2/30 backdrop-blur-sm mt-16 md:mt-24">
          <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-stroke/50">
            {[
              { value: 6, suffix: "+", label: t("landing.statsRoles") },
              { value: 100, suffix: "%", label: t("landing.statsRealtime") },
              { value: 5, suffix: "+", label: t("landing.statsGit") },
              { value: 24, suffix: "/7", label: t("landing.statsAnalytics") },
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
              <Shield className="h-10 w-10 text-brand mx-auto mb-6" strokeWidth={1.5} />
              <h2
                className="font-bold tracking-tight mb-4"
                style={{
                  fontFamily: SORA,
                  fontSize: "clamp(24px, 3.5vw, 36px)",
                }}
              >
                {t("landing.ctaTitle")}
              </h2>
              <p className="text-[16px] text-neutral-fg2 mb-10 max-w-lg mx-auto leading-relaxed">
                {t("landing.ctaSubtitle")}
              </p>
              <Link
                to="/login"
                className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-[15px] font-semibold"
              >
                {t("landing.ctaButton")}
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
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
            &copy; {new Date().getFullYear()} AgentHub. Built with Claude Agent SDK.
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
