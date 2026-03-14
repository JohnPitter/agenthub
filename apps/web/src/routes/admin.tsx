import { useState, useEffect, useMemo } from "react";
import {
  Shield, CreditCard, Users, Router, BarChart3, Plus, Pencil, Trash2,
  Check, X, Loader2, Eye, EyeOff, Search, Crown, RefreshCw,
  TrendingUp, DollarSign, FolderOpen, ListTodo,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAdminStore } from "../stores/admin-store";
import { CommandBar } from "../components/layout/command-bar";
import { getModelLabel, getModelProvider, getModelCategory, getModelTags, TAG_CONFIG, MODEL_CATEGORIES } from "@agenthub/shared";

type AdminTab = "plans" | "users" | "openrouter" | "dashboard";

const TABS: { key: AdminTab; label: string; icon: typeof Shield }[] = [
  { key: "plans", label: "Planos", icon: CreditCard },
  { key: "users", label: "Usuários", icon: Users },
  { key: "openrouter", label: "OpenRouter", icon: Router },
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
];

// ============================================================
// PLANS TAB
// ============================================================
function PlansTab() {
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.plansLoading);
  const fetchPlans = useAdminStore((s) => s.fetchPlans);
  const createPlan = useAdminStore((s) => s.createPlan);
  const updatePlan = useAdminStore((s) => s.updatePlan);
  const deletePlan = useAdminStore((s) => s.deletePlan);
  const openrouterConfig = useAdminStore((s) => s.openrouterConfig);
  const fetchConfig = useAdminStore((s) => s.fetchConfig);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", maxProjects: 5, maxTasksPerMonth: 100,
    priceMonthly: "0", features: [] as string[], isDefault: false,
    maxStorageMb: 500, repoTtlDays: 30, allowedModels: [] as string[],
  });
  const [featureInput, setFeatureInput] = useState("");

  useEffect(() => { fetchPlans(); fetchConfig(); }, [fetchPlans, fetchConfig]);

  const resetForm = () => {
    setForm({ name: "", description: "", maxProjects: 5, maxTasksPerMonth: 100, priceMonthly: "0", features: [], isDefault: false, maxStorageMb: 500, repoTtlDays: 30, allowedModels: [] });
    setFeatureInput("");
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (plan: typeof plans[0]) => {
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      maxProjects: plan.maxProjects,
      maxTasksPerMonth: plan.maxTasksPerMonth,
      priceMonthly: plan.priceMonthly,
      features: plan.features ?? [],
      isDefault: plan.isDefault,
      maxStorageMb: plan.maxStorageMb ?? 500,
      repoTtlDays: plan.repoTtlDays ?? 30,
      allowedModels: plan.allowedModels ?? [],
    });
    setEditId(plan.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (editId) {
      await updatePlan(editId, form);
    } else {
      await createPlan(form);
    }
    resetForm();
  };

  const addFeature = () => {
    if (featureInput.trim()) {
      setForm({ ...form, features: [...form.features, featureInput.trim()] });
      setFeatureInput("");
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-title text-neutral-fg1">Planos de Acesso</h3>
          <p className="text-[12px] text-neutral-fg3 mt-1">Configure os planos disponíveis para os usuários</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Criar Plano
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card-glow p-6 animate-fade-up">
          <h4 className="text-[14px] font-semibold text-neutral-fg1 mb-4">{editId ? "Editar Plano" : "Novo Plano"}</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Nome</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full input-fluent" placeholder="Ex: Free, Pro, Enterprise" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Preço Mensal (USD)</label>
              <input type="text" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} className="w-full input-fluent" placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Max Projetos</label>
              <input type="number" value={form.maxProjects} onChange={(e) => setForm({ ...form, maxProjects: parseInt(e.target.value) || 0 })} className="w-full input-fluent" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Max Tasks/Mês</label>
              <input type="number" value={form.maxTasksPerMonth} onChange={(e) => setForm({ ...form, maxTasksPerMonth: parseInt(e.target.value) || 0 })} className="w-full input-fluent" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Max Storage (MB)</label>
              <input type="number" value={form.maxStorageMb} onChange={(e) => setForm({ ...form, maxStorageMb: parseInt(e.target.value) || 0 })} className="w-full input-fluent" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">TTL Repos (dias)</label>
              <input type="number" value={form.repoTtlDays} onChange={(e) => setForm({ ...form, repoTtlDays: parseInt(e.target.value) || 0 })} className="w-full input-fluent" />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Descrição</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full input-fluent" placeholder="Descrição breve do plano" />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">Features</label>
              <div className="flex gap-2 mb-2">
                <input type="text" value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFeature()} className="flex-1 input-fluent" placeholder="Adicionar feature..." />
                <button onClick={addFeature} className="btn-secondary px-3">+</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.features.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand">
                    {f}
                    <button onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })} className="hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            {/* Allowed Models */}
            <div className="col-span-2">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                Modelos Permitidos
              </label>
              <p className="text-[11px] text-neutral-fg3 mb-2">
                Vazio = todos os modelos habilitados
              </p>
              {openrouterConfig?.enabledModels && openrouterConfig.enabledModels.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, allowedModels: openrouterConfig.enabledModels.map((m) => m.id) })}
                      className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
                    >
                      Selecionar todos
                    </button>
                    <span className="text-neutral-fg-disabled">|</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, allowedModels: [] })}
                      className="text-[11px] font-medium text-neutral-fg3 hover:text-neutral-fg1 transition-colors"
                    >
                      Limpar
                    </button>
                    <span className="ml-auto text-[11px] text-neutral-fg3 tabular-nums">
                      {form.allowedModels.length}/{openrouterConfig.enabledModels.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {openrouterConfig.enabledModels.map((m) => {
                      const isSelected = form.allowedModels.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setForm({
                            ...form,
                            allowedModels: isSelected
                              ? form.allowedModels.filter((id) => id !== m.id)
                              : [...form.allowedModels, m.id],
                          })}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                            isSelected
                              ? "bg-brand text-white"
                              : "bg-neutral-bg2 text-neutral-fg3 hover:bg-stroke2 hover:text-neutral-fg2"
                          )}
                          title={`${getModelProvider(m.id)} — ${m.id}`}
                        >
                          {getModelLabel(m.id)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-neutral-fg3 italic">Configure modelos na aba OpenRouter primeiro</p>
              )}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} id="isDefault" className="rounded" />
              <label htmlFor="isDefault" className="text-[12px] text-neutral-fg2">Plano padrão (novos usuários)</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={resetForm} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={!form.name} className="btn-primary">
              {editId ? "Salvar" : "Criar"}
            </button>
          </div>
        </div>
      )}

      {/* Plans Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : plans.length === 0 ? (
        <div className="card-glow p-12 text-center">
          <CreditCard className="h-12 w-12 mx-auto text-neutral-fg-disabled mb-3" />
          <p className="text-[14px] text-neutral-fg3">Nenhum plano criado ainda</p>
        </div>
      ) : (
        <div className="card-glow overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stroke2 bg-neutral-bg2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Nome</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Max Projetos</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Max Tasks/Mês</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Preço</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Storage</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">TTL</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Modelos</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Default</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-stroke2 last:border-0 hover:bg-neutral-bg-hover/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-[13px] font-medium text-neutral-fg1">{plan.name}</span>
                    {plan.description && <p className="text-[11px] text-neutral-fg3 mt-0.5">{plan.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-neutral-fg2 tabular-nums">{plan.maxProjects}</td>
                  <td className="px-4 py-3 text-[13px] text-neutral-fg2 tabular-nums">{plan.maxTasksPerMonth}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-neutral-fg1 tabular-nums">${plan.priceMonthly}</td>
                  <td className="px-4 py-3 text-[13px] text-neutral-fg2 tabular-nums">{plan.maxStorageMb ?? "—"}MB</td>
                  <td className="px-4 py-3 text-[13px] text-neutral-fg2 tabular-nums">{plan.repoTtlDays ?? "—"}d</td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-neutral-fg2">
                      {plan.allowedModels?.length ? `${plan.allowedModels.length} modelo(s)` : "Todos"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {plan.isDefault && <span className="inline-flex items-center rounded-md bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand">DEFAULT</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleEdit(plan)} className="p-1.5 rounded-md hover:bg-neutral-bg-hover text-neutral-fg3 hover:text-neutral-fg1 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deletePlan(plan.id)} className="p-1.5 rounded-md hover:bg-danger/10 text-neutral-fg3 hover:text-danger transition-colors ml-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// USERS TAB
// ============================================================
function UsersTab() {
  const users = useAdminStore((s) => s.users);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.usersLoading);
  const fetchUsers = useAdminStore((s) => s.fetchUsers);
  const fetchPlans = useAdminStore((s) => s.fetchPlans);
  const updateUserPlan = useAdminStore((s) => s.updateUserPlan);
  const updateUserRole = useAdminStore((s) => s.updateUserRole);

  useEffect(() => { fetchUsers(); fetchPlans(); }, [fetchUsers, fetchPlans]);

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1">Gerenciar Usuários</h3>
        <p className="text-[12px] text-neutral-fg3 mt-1">Atribua planos e gerencie permissões</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : (
        <div className="card-glow overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stroke2 bg-neutral-bg2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Usuário</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Plano</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Projetos</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Tasks/Mês</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const userPlan = plans.find((p) => p.id === user.planId);
                return (
                  <tr key={user.id} className="border-b border-stroke2 last:border-0 hover:bg-neutral-bg-hover/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-brand-light flex items-center justify-center text-[12px] font-bold text-brand">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-[13px] font-medium text-neutral-fg1">{user.name}</p>
                          <p className="text-[11px] text-neutral-fg3">@{user.login}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.planId ?? ""}
                        onChange={(e) => updateUserPlan(user.id, e.target.value || null)}
                        className="input-fluent text-[12px] py-1 px-2 min-w-[120px]"
                      >
                        <option value="">Sem plano</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] tabular-nums text-neutral-fg2">{user.projectCount}</span>
                        {userPlan && (
                          <span className="text-[11px] text-neutral-fg-disabled">/ {userPlan.maxProjects}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] tabular-nums text-neutral-fg2">{user.taskCountThisMonth}</span>
                        {userPlan && (
                          <span className="text-[11px] text-neutral-fg-disabled">/ {userPlan.maxTasksPerMonth}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => updateUserRole(user.id, user.role === "admin" ? "user" : "admin")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                          user.role === "admin"
                            ? "bg-brand-light text-brand hover:bg-brand/20"
                            : "bg-neutral-bg2 text-neutral-fg3 hover:bg-neutral-bg-hover"
                        )}
                      >
                        {user.role === "admin" && <Crown className="h-3 w-3" />}
                        {user.role}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// OPENROUTER TAB
// ============================================================
function OpenRouterTab() {
  const config = useAdminStore((s) => s.openrouterConfig);
  const availableModels = useAdminStore((s) => s.availableModels);
  const modelsLoading = useAdminStore((s) => s.modelsLoading);
  const fetchConfig = useAdminStore((s) => s.fetchConfig);
  const saveConfig = useAdminStore((s) => s.saveConfig);
  const fetchAvailableModels = useAdminStore((s) => s.fetchAvailableModels);
  const testConnection = useAdminStore((s) => s.testConnection);

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  useEffect(() => {
    if (config?.enabledModels) {
      setEnabledIds(new Set(config.enabledModels.map((m) => m.id)));
    }
  }, [config]);

  const handleTest = async () => {
    setTesting(true);
    const result = await testConnection(apiKey || undefined);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = async () => {
    const enabledModels = availableModels
      .filter((m) => enabledIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0] ?? "unknown",
      }));
    await saveConfig(apiKey || "KEEP_EXISTING", enabledModels);
  };

  const toggleModel = (id: string) => {
    const next = new Set(enabledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabledIds(next);
  };

  // Extract unique providers from available models
  const providers = useMemo(() => {
    const set = new Set<string>();
    availableModels.forEach((m) => {
      const provider = m.id.split("/")[0];
      if (provider) set.add(provider);
    });
    return Array.from(set).sort();
  }, [availableModels]);

  const filteredModels = useMemo(() => {
    return availableModels.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (providerFilter && !m.id.startsWith(providerFilter + "/")) return false;
      return true;
    });
  }, [availableModels, search, providerFilter]);

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1">Configuração OpenRouter</h3>
        <p className="text-[12px] text-neutral-fg3 mt-1">Configure a API key e os modelos disponíveis para os agentes</p>
      </div>

      {/* API Key */}
      <div className="card-glow p-6">
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">API Key</label>
        {config?.apiKeyMasked && !apiKey && (
          <p className="text-[11px] text-neutral-fg3 mb-2">Atual: {config.apiKeyMasked}</p>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              className="w-full input-fluent pr-10"
              placeholder="sk-or-v1-..."
            />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-fg3 hover:text-neutral-fg1">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button onClick={handleTest} disabled={testing} className="btn-secondary flex items-center gap-1.5">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Testar
          </button>
          <button onClick={handleSave} className="btn-primary">Salvar</button>
        </div>
        {testResult !== null && (
          <p className={cn("mt-2 text-[12px] font-medium", testResult ? "text-success" : "text-danger")}>
            {testResult ? "Conexão bem-sucedida!" : "Falha na conexão. Verifique a API key."}
          </p>
        )}
      </div>

      {/* Models */}
      <div className="card-glow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-[14px] font-semibold text-neutral-fg1">Modelos Disponíveis</h4>
            <p className="text-[11px] text-neutral-fg3 mt-0.5">{enabledIds.size} modelo(s) habilitado(s)</p>
          </div>
          <button onClick={fetchAvailableModels} disabled={modelsLoading} className="btn-secondary flex items-center gap-1.5 text-[12px]">
            {modelsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Buscar Modelos
          </button>
        </div>

        {availableModels.length > 0 && (
          <>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-fg-disabled" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full input-fluent pl-9"
                  placeholder="Buscar modelo..."
                />
              </div>
              <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="input-fluent text-[12px] min-w-[140px]">
                <option value="">Todos providers</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-stroke2">
              {filteredModels.map((model) => {
                const enabled = enabledIds.has(model.id);
                return (
                  <div
                    key={model.id}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 border-b border-stroke2 last:border-0 cursor-pointer transition-colors",
                      enabled ? "bg-brand-light/30" : "hover:bg-neutral-bg-hover/50"
                    )}
                    onClick={() => toggleModel(model.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-medium text-neutral-fg1 truncate">{getModelLabel(model.id)}</p>
                        {(() => {
                          const cat = MODEL_CATEGORIES.find(c => c.id === getModelCategory(model.id));
                          return cat ? (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-bg3 text-neutral-fg3">{cat.label}</span>
                          ) : null;
                        })()}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-neutral-fg-disabled">{getModelProvider(model.id)}</span>
                        {getModelTags(model.id).slice(0, 3).map(tag => {
                          const cfg = TAG_CONFIG[tag];
                          return cfg ? (
                            <span key={tag} className={cn("text-[8px] font-medium px-1 py-0.5 rounded", cfg.color)}>{cfg.label}</span>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-[10px] text-neutral-fg3 tabular-nums">
                        ${(parseFloat(model.pricing.prompt) * 1_000_000).toFixed(2)}/M in
                      </span>
                      <div className={cn(
                        "h-4 w-4 rounded border-2 flex items-center justify-center transition-colors",
                        enabled ? "bg-brand border-brand" : "border-stroke2"
                      )}>
                        {enabled && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={handleSave} className="btn-primary">Salvar Modelos</button>
            </div>
          </>
        )}

        {availableModels.length === 0 && !modelsLoading && (
          <p className="text-[12px] text-neutral-fg3 text-center py-6">Clique em "Buscar Modelos" para carregar a lista do OpenRouter</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function DashboardTab() {
  const metrics = useAdminStore((s) => s.dashboardMetrics);
  const loading = useAdminStore((s) => s.dashboardLoading);
  const fetchDashboardMetrics = useAdminStore((s) => s.fetchDashboardMetrics);

  useEffect(() => { fetchDashboardMetrics(); }, [fetchDashboardMetrics]);

  if (loading || !metrics) {
    return (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
    );
  }

  const statCards = [
    { label: "Total Usuários", value: metrics.totalUsers, icon: Users, color: "text-brand" },
    { label: "Total Projetos", value: metrics.totalProjects, icon: FolderOpen, color: "text-purple" },
    { label: "Tasks (mês)", value: metrics.tasksThisMonth, icon: ListTodo, color: "text-success" },
    { label: "Custo (mês)", value: `$${metrics.costThisMonth.toFixed(2)}`, icon: DollarSign, color: "text-warning" },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1">Dashboard Admin</h3>
        <p className="text-[12px] text-neutral-fg3 mt-1">Visão geral do uso da plataforma</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card-glow p-5">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={cn("h-5 w-5", stat.color)} strokeWidth={1.5} />
              <TrendingUp className="h-3.5 w-3.5 text-neutral-fg-disabled" />
            </div>
            <p className="text-[24px] font-bold text-neutral-fg1 tabular-nums">{stat.value}</p>
            <p className="text-[11px] text-neutral-fg3 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Top Users */}
      <div className="card-glow p-6">
        <h4 className="text-[14px] font-semibold text-neutral-fg1 mb-4">Top Usuários por Uso</h4>
        {metrics.topUsersByUsage.length === 0 ? (
          <p className="text-[12px] text-neutral-fg3 text-center py-4">Sem dados este mês</p>
        ) : (
          <div className="space-y-3">
            {metrics.topUsersByUsage.map((user, i) => (
              <div key={user.userId} className="flex items-center gap-3">
                <span className="text-[12px] font-bold text-neutral-fg-disabled w-5 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-neutral-fg1 truncate">{user.name}</p>
                </div>
                <span className="text-[12px] tabular-nums text-neutral-fg2">{user.taskCount} tasks</span>
                <span className="text-[12px] tabular-nums font-medium text-neutral-fg1">${user.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Models */}
      <div className="card-glow p-6">
        <h4 className="text-[14px] font-semibold text-neutral-fg1 mb-4">Top Modelos por Uso</h4>
        {metrics.topModelsByUsage.length === 0 ? (
          <p className="text-[12px] text-neutral-fg3 text-center py-4">Sem dados este mês</p>
        ) : (
          <div className="space-y-3">
            {metrics.topModelsByUsage.map((model, i) => (
              <div key={model.model} className="flex items-center gap-3">
                <span className="text-[12px] font-bold text-neutral-fg-disabled w-5 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-neutral-fg1 truncate">{getModelLabel(model.model)}</p>
                </div>
                <span className="text-[12px] tabular-nums text-neutral-fg2">{model.taskCount} tasks</span>
                <span className="text-[12px] tabular-nums font-medium text-neutral-fg1">${model.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("plans");

  return (
    <>
      <CommandBar>Admin Panel</CommandBar>
      <div className="flex flex-col h-full overflow-y-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light">
            <Shield className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-neutral-fg1 tracking-tight">Painel de Administração</h1>
            <p className="text-[12px] text-neutral-fg3">Gerencie planos, usuários e configurações</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-stroke2 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 -mb-[1px]",
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-neutral-fg3 hover:text-neutral-fg1 hover:border-stroke2"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1">
          {activeTab === "plans" && <PlansTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "openrouter" && <OpenRouterTab />}
          {activeTab === "dashboard" && <DashboardTab />}
        </div>
      </div>
    </>
  );
}
