import { Link } from "react-router-dom";
import {
  Zap, GitBranch, MessageSquare, Activity, BarChart3, Code2,
  ArrowRight, Github, Shield, Bot
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "Agentes Autonomos",
    description: "Agentes Claude executam tasks reais de desenvolvimento em branches isoladas.",
    color: "text-brand",
    bg: "bg-brand-light",
  },
  {
    icon: GitBranch,
    title: "Git Integration",
    description: "Branch, commit e push automaticos. Sync com remote e deteccao de conflitos.",
    color: "text-purple",
    bg: "bg-purple-light",
  },
  {
    icon: MessageSquare,
    title: "Code Review",
    description: "Ciclo approve/reject com feedback estruturado antes de cada merge.",
    color: "text-success",
    bg: "bg-success-light",
  },
  {
    icon: Activity,
    title: "Real-time",
    description: "WebSocket para acompanhar progresso, logs e status dos agentes ao vivo.",
    color: "text-warning",
    bg: "bg-warning-light",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Metricas de performance, taxa de sucesso e ranking de agentes.",
    color: "text-info",
    bg: "bg-info-light",
  },
  {
    icon: Code2,
    title: "Code Editor",
    description: "Monaco Editor com IntelliSense, diff viewer e historico git integrado.",
    color: "text-orange",
    bg: "bg-orange/10",
  },
];

export function LandingPage() {
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
            Entrar
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
            Orquestre agentes de IA para{" "}
            <span className="text-gradient-brand">automatizar desenvolvimento</span>
          </h1>

          <p className="mt-6 text-[18px] text-neutral-fg2 leading-relaxed max-w-2xl mx-auto">
            Multiplos agentes Claude trabalhando em paralelo — executando tasks,
            criando branches, fazendo commits e passando por code review automaticamente.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/login"
              className="btn-primary flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold"
            >
              Comecar agora
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
          <h2 className="text-[32px] font-bold tracking-tight">Tudo que voce precisa</h2>
          <p className="mt-3 text-[16px] text-neutral-fg2">
            Uma plataforma completa para orquestrar desenvolvimento com IA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card-interactive p-6">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} mb-4`}>
                <feature.icon className={`h-5.5 w-5.5 ${feature.color}`} strokeWidth={1.8} />
              </div>
              <h3 className="text-[16px] font-semibold text-neutral-fg1 mb-2">{feature.title}</h3>
              <p className="text-[14px] text-neutral-fg2 leading-relaxed">{feature.description}</p>
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
            <h2 className="text-[28px] font-bold tracking-tight mb-3">Pronto para automatizar?</h2>
            <p className="text-[16px] text-neutral-fg2 mb-8 max-w-lg mx-auto">
              Conecte com GitHub e comece a orquestrar agentes em minutos.
            </p>
            <Link
              to="/login"
              className="btn-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold"
            >
              Comecar gratuitamente
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
