import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Key, CreditCard, Check, Loader2, ArrowRight, Shield } from "lucide-react";
import { api, cn } from "../lib/utils";

interface SetupStatus {
  isSetupComplete: boolean;
  steps: { hasAdmin: boolean; hasApiKey: boolean; hasPlans: boolean };
}

const PLAN_PRESETS = [
  {
    name: "Free",
    description: "Para experimentar",
    maxProjects: 2,
    maxTasksPerMonth: 20,
    maxStorageMb: 200,
    priceMonthly: "0",
    repoTtlDays: 7,
    isDefault: true,
    features: ["2 projetos", "20 tasks/mes", "Modelos economicos"],
    allowedModels: ["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash", "openai/gpt-4.1-nano", "deepseek/deepseek-chat-v3.1"],
  },
  {
    name: "Pro",
    description: "Para equipes",
    maxProjects: 10,
    maxTasksPerMonth: 200,
    maxStorageMb: 5000,
    priceMonthly: "29",
    repoTtlDays: 90,
    isDefault: false,
    features: ["10 projetos", "200 tasks/mes", "Modelos balanceados + coding"],
    allowedModels: ["anthropic/claude-sonnet-4.6", "openai/gpt-4.1", "google/gemini-2.5-pro", "mistralai/codestral-2508", "deepseek/deepseek-r1-0528", "meta-llama/llama-4-maverick"],
  },
  {
    name: "Enterprise",
    description: "Sem limites",
    maxProjects: -1,
    maxTasksPerMonth: -1,
    maxStorageMb: 50000,
    priceMonthly: "99",
    repoTtlDays: 365,
    isDefault: false,
    features: ["Projetos ilimitados", "Tasks ilimitadas", "Todos os modelos"],
    allowedModels: [], // empty = all models
  },
];

export function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [plansCreated, setPlansCreated] = useState(false);

  useEffect(() => {
    api<SetupStatus>("/admin/setup-status").then((data) => {
      setStatus(data);
      if (data.isSetupComplete) {
        navigate("/dashboard");
        return;
      }
      if (data.steps.hasPlans) { setStep(3); return; }
      if (data.steps.hasApiKey) { setStep(2); return; }
      if (data.steps.hasAdmin) { setStep(1); return; }
    }).catch(() => {});
  }, [navigate]);

  const handleTestKey = async () => {
    setTesting(true);
    try {
      const { success } = await api<{ success: boolean }>("/admin/openrouter/test", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      });
      setTestResult(success);
    } catch {
      setTestResult(false);
    }
    setTesting(false);
  };

  const handleSaveKey = async () => {
    setSaving(true);
    try {
      await api("/admin/openrouter/config", {
        method: "POST",
        body: JSON.stringify({ apiKey, enabledModels: [] }),
      });
      // Fetch models and enable all
      const { models } = await api<{ models: Array<{ id: string; name: string }> }>("/admin/openrouter/models");
      if (models.length > 0) {
        const enabledModels = models.map(m => ({ id: m.id, name: m.name, provider: m.id.split("/")[0] ?? "unknown" }));
        await api("/admin/openrouter/config", {
          method: "POST",
          body: JSON.stringify({ apiKey: "KEEP_EXISTING", enabledModels }),
        });
      }
      setStep(2);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleCreatePlans = async () => {
    setSaving(true);
    try {
      for (const preset of PLAN_PRESETS) {
        await api("/admin/plans", {
          method: "POST",
          body: JSON.stringify(preset),
        });
      }
      setPlansCreated(true);
      setStep(3);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleFinish = () => navigate("/dashboard");

  if (!status) {
    return (
      <div className="flex h-screen items-center justify-center bg-app-bg">
        <Loader2 className="h-8 w-8 text-brand animate-spin" />
      </div>
    );
  }

  const steps = [
    { icon: Shield, label: "Admin", done: status.steps.hasAdmin },
    { icon: Key, label: "API Key", done: status.steps.hasApiKey },
    { icon: CreditCard, label: "Planos", done: status.steps.hasPlans || plansCreated },
    { icon: Check, label: "Pronto", done: false },
  ];

  return (
    <div className="flex h-screen items-center justify-center bg-app-bg p-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-purple shadow-brand">
            <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[24px] font-bold text-neutral-fg1 tracking-tight">AgentHub</span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold transition-all",
                i === step ? "bg-brand text-white shadow-brand" :
                s.done ? "bg-success text-white" :
                "bg-neutral-bg3 text-neutral-fg3"
              )}>
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("h-0.5 w-8", i < step ? "bg-brand" : "bg-stroke2")} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card-glow p-8 animate-fade-up">
          {/* Step 0: Admin */}
          {step === 0 && (
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto text-brand mb-4" />
              <h2 className="text-[20px] font-bold text-neutral-fg1 mb-2">Bem-vindo ao AgentHub!</h2>
              <p className="text-[14px] text-neutral-fg3 mb-6 leading-relaxed">
                Voce e o primeiro usuario e foi automaticamente designado como <strong className="text-brand">administrador</strong>.
                Vamos configurar a plataforma em poucos passos.
              </p>
              <button onClick={() => setStep(1)} className="btn-primary px-6 py-3 flex items-center gap-2 mx-auto">
                Comecar configuracao <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 1: API Key */}
          {step === 1 && (
            <div>
              <Key className="h-10 w-10 text-brand mb-4" />
              <h2 className="text-[20px] font-bold text-neutral-fg1 mb-2">Configurar OpenRouter</h2>
              <p className="text-[13px] text-neutral-fg3 mb-6">
                O AgentHub usa o OpenRouter como gateway para modelos de IA. Insira sua API key.
              </p>
              <div className="space-y-4">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                  placeholder="sk-or-v1-..."
                  className="w-full input-fluent"
                />
                <div className="flex gap-2">
                  <button onClick={handleTestKey} disabled={!apiKey || testing} className="btn-secondary flex items-center gap-2">
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Testar conexao
                  </button>
                  <button onClick={handleSaveKey} disabled={!apiKey || saving} className="btn-primary flex items-center gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Salvar e continuar <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                {testResult !== null && (
                  <p className={cn("text-[12px] font-medium", testResult ? "text-success" : "text-danger")}>
                    {testResult ? "Conexao bem-sucedida!" : "Falha na conexao. Verifique a key."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Plans */}
          {step === 2 && (
            <div>
              <CreditCard className="h-10 w-10 text-brand mb-4" />
              <h2 className="text-[20px] font-bold text-neutral-fg1 mb-2">Criar Planos</h2>
              <p className="text-[13px] text-neutral-fg3 mb-6">
                Configure os planos disponiveis para seus usuarios. Clique para criar os planos recomendados.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {PLAN_PRESETS.map((plan) => (
                  <div key={plan.name} className="rounded-lg border border-stroke2 p-4 text-center">
                    <h3 className="text-[16px] font-bold text-neutral-fg1">{plan.name}</h3>
                    <p className="text-[24px] font-bold text-brand mt-1">
                      {plan.priceMonthly === "0" ? "Gratis" : `$${plan.priceMonthly}`}
                    </p>
                    <p className="text-[11px] text-neutral-fg3 mt-1">{plan.description}</p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="text-[11px] text-neutral-fg2 flex items-center gap-1">
                          <Check className="h-3 w-3 text-success shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <button onClick={handleCreatePlans} disabled={saving || plansCreated} className="btn-primary px-6 py-3 w-full flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : plansCreated ? <Check className="h-4 w-4" /> : null}
                {plansCreated ? "Planos criados!" : "Criar planos recomendados"}
              </button>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 mx-auto mb-4">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-[20px] font-bold text-neutral-fg1 mb-2">Tudo pronto!</h2>
              <p className="text-[14px] text-neutral-fg3 mb-6 leading-relaxed">
                O AgentHub esta configurado e pronto para uso. Seus agentes de IA estao prontos para trabalhar.
              </p>
              <button onClick={handleFinish} className="btn-primary px-8 py-3 flex items-center gap-2 mx-auto">
                Ir para o Dashboard <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
