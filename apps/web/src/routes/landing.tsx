import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Zap, GitBranch, MessageSquare, Activity, BarChart3, Code2,
  ArrowRight, Github, Bot, Layers, Workflow, Eye,
  Smartphone, Brain, Terminal, Sparkles, Users, FileCode,
  Search, Wrench, BookOpen, CheckCircle2, Clock, TrendingUp,
  Settings, LayoutDashboard, ChevronRight, Play, Pause,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

const SORA = "'Sora', var(--font-sans)";

/* ── Hooks ─────────────────────────────────────────── */

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const fn = () => setY(window.scrollY);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return y;
}

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
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
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
        transform: visible ? "none" : "translateY(32px)",
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
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
            setValue(Math.round((1 - Math.pow(1 - p, 3)) * end));
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

/* ── Typing animation ──────────────────────────────── */

function TypeWriter({ texts, speed = 50 }: { texts: string[]; speed?: number }) {
  const [idx, setIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const text = texts[idx];
    const timer = setTimeout(() => {
      if (!deleting) {
        if (charIdx < text.length) {
          setCharIdx(charIdx + 1);
        } else {
          setTimeout(() => setDeleting(true), 2000);
        }
      } else {
        if (charIdx > 0) {
          setCharIdx(charIdx - 1);
        } else {
          setDeleting(false);
          setIdx((idx + 1) % texts.length);
        }
      }
    }, deleting ? speed / 2 : speed);
    return () => clearTimeout(timer);
  }, [charIdx, deleting, idx, texts, speed]);

  return (
    <span>
      {texts[idx].slice(0, charIdx)}
      <span className="inline-block w-[2px] h-[1em] bg-brand ml-0.5 align-middle" style={{ animation: "blink 1.2s step-end infinite" }} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   App Mockups — CSS replicas of the actual AgentHub UI
   ═══════════════════════════════════════════════════════ */

/* ── Dashboard Mockup ──────────────────────────────── */

function DashboardMockup() {
  const [activeTask, setActiveTask] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveTask(i => (i + 1) % 3), 3000);
    return () => clearInterval(t);
  }, []);

  const tasks = [
    { title: "Implementar OAuth login", agent: "Backend Dev", status: "in_progress", color: "text-brand", bg: "bg-brand/10", progress: 72 },
    { title: "Refatorar componentes UI", agent: "Frontend Dev", status: "review", color: "text-purple", bg: "bg-purple/10", progress: 95 },
    { title: "Configurar CI/CD pipeline", agent: "DevOps", status: "done", color: "text-success", bg: "bg-success/10", progress: 100 },
  ];

  return (
    <div className="relative group">
      {/* Perspective container */}
      <div
        className="relative rounded-2xl overflow-hidden border border-stroke/60 bg-neutral-bg2/90 backdrop-blur-md shadow-2xl transition-transform duration-700 group-hover:scale-[1.01]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stroke2 bg-neutral-bg3/60">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <span className="text-[10px] text-neutral-fg3 ml-2 font-mono">localhost:5173/dashboard</span>
        </div>

        <div className="flex min-h-[340px]">
          {/* Sidebar */}
          <div className="hidden md:flex flex-col w-[180px] border-r border-stroke2 bg-neutral-bg3/30 p-3 gap-1">
            {[
              { icon: LayoutDashboard, label: "Dashboard", active: true },
              { icon: Layers, label: "Projetos", active: false },
              { icon: Bot, label: "Agentes", active: false },
              { icon: Workflow, label: "Workflows", active: false },
              { icon: BarChart3, label: "Analytics", active: false },
              { icon: Settings, label: "Settings", active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] ${
                  item.active
                    ? "bg-brand/10 text-brand font-semibold"
                    : "text-neutral-fg3 hover:text-neutral-fg2"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" strokeWidth={item.active ? 2 : 1.5} />
                {item.label}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 md:p-5 space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Tasks Ativas", value: "12", icon: Activity, color: "text-brand" },
                { label: "Em Progresso", value: "4", icon: Clock, color: "text-warning" },
                { label: "Concluídas", value: "38", icon: CheckCircle2, color: "text-success" },
                { label: "Agentes", value: "5", icon: Bot, color: "text-purple" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-stroke2/50 bg-neutral-bg3/20 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <stat.icon className={`h-3 w-3 ${stat.color}`} strokeWidth={2} />
                    <span className="text-[10px] text-neutral-fg3">{stat.label}</span>
                  </div>
                  <div className="text-[20px] font-bold text-neutral-fg1" style={{ fontFamily: SORA }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Task list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold text-neutral-fg2">Tasks Recentes</span>
                <span className="text-[10px] text-brand cursor-pointer">Ver todas →</span>
              </div>
              {tasks.map((task, i) => (
                <div
                  key={task.title}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-500 ${
                    i === activeTask
                      ? "border-brand/30 bg-brand/5 shadow-sm"
                      : "border-stroke2/30 bg-neutral-bg3/10"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-md ${task.bg} flex items-center justify-center shrink-0`}>
                    <FileCode className={`h-3.5 w-3.5 ${task.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-neutral-fg1 truncate">{task.title}</div>
                    <div className="text-[10px] text-neutral-fg3">{task.agent}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="w-16 h-1.5 rounded-full bg-neutral-bg3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          task.progress === 100 ? "bg-success" : "bg-brand"
                        }`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-neutral-fg3 mt-0.5 inline-block">{task.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Agents Mockup ─────────────────────────────────── */

function AgentsMockup() {
  const agents = [
    { name: "Arquiteto", role: "architect", model: "Claude Sonnet", enabled: true, color: "text-purple", bg: "bg-purple/10", tasks: 24 },
    { name: "Backend Dev", role: "backend", model: "Claude Opus", enabled: true, color: "text-brand", bg: "bg-brand/10", tasks: 47 },
    { name: "Frontend Dev", role: "frontend", model: "GPT Codex", enabled: true, color: "text-info", bg: "bg-info/10", tasks: 31 },
    { name: "QA Tester", role: "qa", model: "Claude Haiku", enabled: true, color: "text-success", bg: "bg-success/10", tasks: 56 },
    { name: "Code Reviewer", role: "reviewer", model: "Claude Sonnet", enabled: true, color: "text-warning", bg: "bg-warning/10", tasks: 42 },
    { name: "DevOps", role: "devops", model: "Claude Sonnet", enabled: false, color: "text-orange", bg: "bg-orange/10", tasks: 8 },
  ];

  const icons = [Search, FileCode, Layers, Eye, MessageSquare, Wrench];

  return (
    <div className="relative rounded-2xl overflow-hidden border border-stroke/60 bg-neutral-bg2/90 backdrop-blur-md shadow-2xl">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stroke2 bg-neutral-bg3/60">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
        <span className="text-[10px] text-neutral-fg3 ml-2 font-mono">Agentes · Configuração</span>
      </div>

      <div className="p-4 md:p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {agents.map((agent, i) => {
            const Icon = icons[i];
            return (
              <div
                key={agent.name}
                className={`relative rounded-xl border p-3.5 transition-all duration-300 hover:shadow-md ${
                  agent.enabled
                    ? "border-stroke2/60 bg-neutral-bg3/20 hover:border-brand/20"
                    : "border-stroke2/30 bg-neutral-bg3/10 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className={`h-8 w-8 rounded-lg ${agent.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${agent.color}`} strokeWidth={1.8} />
                  </div>
                  <div className={`w-7 h-4 rounded-full ${agent.enabled ? "bg-brand" : "bg-neutral-bg3"} relative`}>
                    <div className={`absolute top-0.5 ${agent.enabled ? "right-0.5" : "left-0.5"} w-3 h-3 rounded-full bg-white shadow-sm transition-all`} />
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-neutral-fg1">{agent.name}</div>
                <div className="text-[10px] text-neutral-fg3 mt-0.5">{agent.model}</div>
                <div className="flex items-center gap-1 mt-2.5">
                  <TrendingUp className="h-2.5 w-2.5 text-success" />
                  <span className="text-[10px] text-neutral-fg3">{agent.tasks} tasks</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Workflow Mockup ───────────────────────────────── */

function WorkflowMockup() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-stroke/60 bg-neutral-bg2/90 backdrop-blur-md shadow-2xl">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stroke2 bg-neutral-bg3/60">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
        <span className="text-[10px] text-neutral-fg3 ml-2 font-mono">Workflow Editor · Default Pipeline</span>
      </div>

      <div className="p-6 md:p-8 flex items-center justify-center min-h-[240px]">
        {/* Flow nodes */}
        <div className="flex items-center gap-3 md:gap-5 flex-wrap justify-center">
          {[
            { label: "Task Criada", icon: Zap, color: "border-brand/40 bg-brand/5", iconColor: "text-brand" },
            { label: "Arquiteto", icon: Search, color: "border-purple/40 bg-purple/5", iconColor: "text-purple" },
            { label: "Dev", icon: FileCode, color: "border-info/40 bg-info/5", iconColor: "text-info" },
            { label: "QA Review", icon: Eye, color: "border-warning/40 bg-warning/5", iconColor: "text-warning" },
            { label: "Git Push", icon: GitBranch, color: "border-success/40 bg-success/5", iconColor: "text-success" },
          ].map((node, i, arr) => (
            <div key={node.label} className="flex items-center gap-3 md:gap-5">
              <div
                className={`flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border-2 ${node.color} min-w-[80px]`}
                style={{
                  animation: `pulse-subtle 3s ease-in-out ${i * 0.6}s infinite`,
                }}
              >
                <node.icon className={`h-5 w-5 ${node.iconColor}`} strokeWidth={1.6} />
                <span className="text-[10px] font-medium text-neutral-fg2 text-center">{node.label}</span>
              </div>
              {i < arr.length - 1 && (
                <ChevronRight className="h-4 w-4 text-neutral-fg-disabled shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
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

/* ── Main Landing Page ─────────────────────────────── */

export function LandingPage() {
  const { t } = useTranslation();
  const scrollY = useScrollY();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setScrolled(scrollY > 20);
  }, [scrollY]);

  const handleMouse = useCallback((e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY }), []);
  useEffect(() => {
    window.addEventListener("mousemove", handleMouse, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [handleMouse]);

  return (
    <div className="min-h-screen bg-app-bg text-neutral-fg1 overflow-x-hidden">
      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="glow-orb glow-orb-brand absolute -left-48 -top-24 h-[600px] w-[600px]" style={{ animation: "float 8s ease-in-out infinite" }} />
        <div className="glow-orb glow-orb-purple absolute -right-48 top-32 h-[500px] w-[500px]" style={{ animation: "float 8s ease-in-out infinite 2s" }} />
        <div className="dot-pattern absolute inset-0 opacity-30" />
      </div>

      {/* ── Mouse glow ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{ background: `radial-gradient(600px circle at ${mouse.x}px ${mouse.y}px, rgba(99,102,241,0.06), transparent 70%)` }}
      />

      {/* ── Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass-strong shadow-xs" : ""}`}>
        <div className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple shadow-brand">
              <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-bold tracking-tight" style={{ fontFamily: SORA }}>AgentHub</span>
          </div>
          <Link to="/login" className="btn-primary flex items-center gap-2 px-5 py-2 text-[13px] font-medium">
            <Github className="h-4 w-4" />
            {t("landing.login")}
          </Link>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════
          HERO — Anthropic-style big headline + floating UI
          ════════════════════════════════════════════════ */}
      <section className="relative pt-28 md:pt-40 pb-8 max-w-7xl mx-auto px-6 md:px-8">
        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-light px-4 py-1.5 text-[12px] font-semibold text-brand mb-8">
              <Sparkles className="h-3.5 w-3.5" />
              {t("landing.badge")}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h1
              style={{
                fontFamily: SORA,
                fontSize: "clamp(32px, 5.5vw, 64px)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
              }}
            >
              <span className="text-neutral-fg1">Tenha uma equipe de </span>
              <span className="text-gradient-brand">desenvolvedores autônomos</span>
              <span className="text-neutral-fg1"> que você controla o ritmo</span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="mt-7 text-neutral-fg2 leading-relaxed max-w-2xl mx-auto" style={{ fontSize: "clamp(16px, 2vw, 19px)" }}>
              {t("landing.heroSub")}
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login" className="btn-primary flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold">
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

          {/* Typing line */}
          <Reveal delay={0.4}>
            <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-neutral-fg3">
              <Terminal className="h-4 w-4" />
              <TypeWriter texts={[
                "Arquiteto planejando implementação...",
                "Backend Dev codando auth-service.ts...",
                "QA Tester revisando 3 arquivos...",
                "DevOps criando PR #47...",
                "📱 WhatsApp: Task concluída!",
              ]} />
            </div>
          </Reveal>
        </div>

        {/* ── Floating Dashboard Preview ── */}
        <Reveal delay={0.6}>
          <div
            className="relative mt-16 md:mt-20 max-w-5xl mx-auto"
            style={{
              transform: `perspective(2000px) rotateX(${Math.max(0, 2 - scrollY * 0.008)}deg)`,
              transition: "transform 0.1s linear",
            }}
          >
            {/* Glow behind */}
            <div className="absolute -inset-12 rounded-3xl bg-gradient-to-b from-brand/8 via-purple/5 to-transparent blur-3xl pointer-events-none" />
            <DashboardMockup />
          </div>
        </Reveal>
      </section>

      {/* ── Stats bar ── */}
      <Reveal>
        <section className="relative z-10 border-y border-stroke/50 bg-neutral-bg2/30 backdrop-blur-sm mt-12 md:mt-20">
          <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-stroke/50">
            {[
              { value: 7, suffix: "", label: t("landing.statsAgents") },
              { value: 5, suffix: "+", label: t("landing.statsModels") },
              { value: 4, suffix: "", label: t("landing.statsIntegrations") },
              { value: 100, suffix: "%", label: t("landing.statsRealtime") },
            ].map((stat, i) => (
              <div key={i} className="text-center md:px-8">
                <div className="text-gradient-brand font-bold tracking-tight" style={{ fontFamily: SORA, fontSize: "clamp(32px, 4vw, 48px)" }}>
                  <Counter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-[12px] text-neutral-fg3 mt-1.5 uppercase tracking-[0.1em] font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ════════════════════════════════════════════════
          AGENTS SHOWCASE — Full mockup with side text
          ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text side */}
          <div>
            <Reveal>
              <div className="text-[12px] font-semibold text-purple uppercase tracking-[0.15em] mb-4">
                {t("landing.agentsSectionLabel")}
              </div>
              <h2 className="font-bold tracking-tight mb-5" style={{ fontFamily: SORA, fontSize: "clamp(28px, 3.5vw, 40px)" }}>
                {t("landing.agentsTitle")}
              </h2>
              <p className="text-[16px] text-neutral-fg2 leading-relaxed mb-8">
                {t("landing.agentsSubtitle")}
              </p>
            </Reveal>

            <div className="space-y-3">
              {[
                { icon: Search, name: t("landing.agentArchitect"), desc: t("landing.agentArchitectDesc"), color: "text-purple", bg: "bg-purple/10" },
                { icon: FileCode, name: t("landing.agentBackend"), desc: t("landing.agentBackendDesc"), color: "text-brand", bg: "bg-brand/10" },
                { icon: Layers, name: t("landing.agentFrontend"), desc: t("landing.agentFrontendDesc"), color: "text-info", bg: "bg-info/10" },
                { icon: Eye, name: t("landing.agentQA"), desc: t("landing.agentQADesc"), color: "text-success", bg: "bg-success/10" },
                { icon: MessageSquare, name: t("landing.agentReviewer"), desc: t("landing.agentReviewerDesc"), color: "text-warning", bg: "bg-warning/10" },
                { icon: Wrench, name: t("landing.agentDevOps"), desc: t("landing.agentDevOpsDesc"), color: "text-orange", bg: "bg-orange/10" },
                { icon: BookOpen, name: t("landing.agentDocWriter"), desc: t("landing.agentDocWriterDesc"), color: "text-neutral-fg2", bg: "bg-neutral-bg3" },
              ].map((role, i) => (
                <Reveal key={role.name} delay={0.04 * i}>
                  <div className="group flex items-center gap-3.5 p-3 rounded-xl border border-transparent hover:border-stroke/50 hover:bg-neutral-bg2/30 transition-all duration-300">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${role.bg} shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                      <role.icon className={`h-4.5 w-4.5 ${role.color}`} strokeWidth={1.8} />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-neutral-fg1">{role.name}</span>
                      <span className="text-[12px] text-neutral-fg3 ml-2">{role.desc}</span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Mockup side */}
          <Reveal delay={0.2}>
            <div
              style={{
                transform: `translateY(${Math.max(0, (scrollY - 600) * -0.03)}px)`,
                transition: "transform 0.1s linear",
              }}
            >
              <AgentsMockup />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Section divider ── */}
      <div className="section-divider max-w-3xl mx-auto" />

      {/* ════════════════════════════════════════════════
          WORKFLOW SHOWCASE — Mockup + text (reversed)
          ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Mockup side */}
          <Reveal>
            <div
              style={{
                transform: `translateY(${Math.max(0, (scrollY - 1400) * -0.025)}px)`,
                transition: "transform 0.1s linear",
              }}
            >
              <WorkflowMockup />
            </div>
          </Reveal>

          {/* Text side */}
          <div>
            <Reveal delay={0.1}>
              <div className="text-[12px] font-semibold text-brand uppercase tracking-[0.15em] mb-4">
                {t("landing.howItWorksSectionLabel")}
              </div>
              <h2 className="font-bold tracking-tight mb-5" style={{ fontFamily: SORA, fontSize: "clamp(28px, 3.5vw, 40px)" }}>
                Workflows visuais que automatizam seu pipeline
              </h2>
              <p className="text-[16px] text-neutral-fg2 leading-relaxed mb-8">
                Defina a ordem de execução dos agentes com um editor visual. Da criação da task até o push automático no GitHub.
              </p>
            </Reveal>

            <div className="space-y-5">
              {[
                { num: "01", title: t("landing.step1Title"), desc: t("landing.step1Desc"), icon: Layers },
                { num: "02", title: t("landing.step2Title"), desc: t("landing.step2Desc"), icon: Workflow },
                { num: "03", title: t("landing.step3Title"), desc: t("landing.step3Desc"), icon: Eye },
              ].map((step, i) => (
                <Reveal key={step.num} delay={0.08 * i}>
                  <div className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 border border-brand/20 group-hover:bg-brand/20 transition-colors">
                        <span className="text-[13px] font-bold text-brand">{step.num}</span>
                      </div>
                      {i < 2 && <div className="w-px h-full bg-gradient-to-b from-brand/20 to-transparent mt-1" />}
                    </div>
                    <div className="pb-5">
                      <div className="text-[15px] font-semibold text-neutral-fg1 mb-1" style={{ fontFamily: SORA }}>{step.title}</div>
                      <p className="text-[13px] text-neutral-fg3 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section divider ── */}
      <div className="section-divider max-w-3xl mx-auto" />

      {/* ════════════════════════════════════════════════
          FEATURES — Bento grid
          ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="text-center mb-16">
            <div className="text-[12px] font-semibold text-brand uppercase tracking-[0.15em] mb-4">
              {t("landing.featuresSectionLabel")}
            </div>
            <h2 className="font-bold tracking-tight" style={{ fontFamily: SORA, fontSize: "clamp(28px, 4vw, 44px)" }}>
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
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                  <feature.icon className={`h-5.5 w-5.5 ${feature.color}`} strokeWidth={1.8} />
                </div>
                <h3 className="text-[16px] font-semibold text-neutral-fg1 mb-2" style={{ fontFamily: SORA }}>
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

      {/* ════════════════════════════════════════════════
          CTA
          ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-24 md:py-32">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-stroke p-10 md:p-16 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-brand/8 via-purple/4 to-transparent" />
            <div className="glow-orb glow-orb-brand absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 opacity-60" />

            <div className="relative z-10">
              <Users className="h-10 w-10 text-brand mx-auto mb-6" strokeWidth={1.5} />
              <h2 className="font-bold tracking-tight mb-4" style={{ fontFamily: SORA, fontSize: "clamp(24px, 3.5vw, 36px)" }}>
                {t("landing.ctaTitle")}
              </h2>
              <p className="text-[16px] text-neutral-fg2 mb-8 max-w-lg mx-auto leading-relaxed">
                {t("landing.ctaSubtitle")}
              </p>
              <Link to="/login" className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-[15px] font-semibold">
                {t("landing.ctaButton")}
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
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
            <span className="text-[13px] text-neutral-fg3 font-semibold" style={{ fontFamily: SORA }}>AgentHub</span>
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
