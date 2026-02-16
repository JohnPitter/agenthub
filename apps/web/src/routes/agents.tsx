import { useState } from "react";
import { Plus, Power, Settings, Users, GitBranch } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { useAgents } from "../hooks/use-agents";
import { AgentConfigDialog } from "../components/agents/agent-config-dialog";
import { AgentAvatar } from "../components/agents/agent-avatar";
import { WorkflowEditor } from "../components/agents/workflow-editor";
import { cn } from "../lib/utils";
import type { Agent, AgentWorkflow } from "@agenthub/shared";

type AgentsTab = "agentes" | "workflow";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
  custom: "Custom",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
};

const WORKFLOW_STORAGE_KEY = "agenthub:workflow";

function loadWorkflow(): AgentWorkflow | null {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveWorkflow(wf: AgentWorkflow) {
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(wf));
}

export function AgentsPage() {
  const { agents, toggleAgent, updateAgent, createAgent } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<AgentsTab>("agentes");
  const [savedWorkflow, setSavedWorkflow] = useState<AgentWorkflow | null>(loadWorkflow);

  const activeCount = agents.filter((a) => a.isActive).length;
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  const handleSaveAgent = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  const handleAddAgent = async () => {
    const agent = await createAgent({
      name: "Novo Agente",
      role: "custom",
      model: "claude-sonnet-4-5-20250929",
      description: "Agente personalizado",
    });
    setSelectedId(agent.id);
    setConfigAgent(agent);
  };

  const handleSaveWorkflow = (wf: AgentWorkflow) => {
    saveWorkflow(wf);
    setSavedWorkflow(wf);
  };

  return (
    <div className="flex h-full flex-col">
      <CommandBar>
        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-neutral-bg2 p-1">
            <button
              onClick={() => setActiveTab("agentes")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all",
                activeTab === "agentes"
                  ? "bg-neutral-bg1 text-neutral-fg1 shadow-xs"
                  : "text-neutral-fg3 hover:text-neutral-fg2",
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Agentes
            </button>
            <button
              onClick={() => setActiveTab("workflow")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all",
                activeTab === "workflow"
                  ? "bg-neutral-bg1 text-neutral-fg1 shadow-xs"
                  : "text-neutral-fg3 hover:text-neutral-fg2",
              )}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Workflow
            </button>
          </div>

          {activeTab === "agentes" && agents.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
              {activeCount}/{agents.length}
            </span>
          )}
        </div>
      </CommandBar>

      {activeTab === "agentes" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left — Agent List */}
          <nav className="w-[280px] shrink-0 border-r border-stroke2 bg-neutral-bg-subtle flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="section-heading !mb-0">Agentes</span>
              <button
                onClick={handleAddAgent}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white transition-all hover:bg-brand-hover hover:shadow-glow"
                title="Adicionar agente"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
              {agents.map((agent) => {
                const isActive = selected?.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-brand-light to-transparent text-brand shadow-xs"
                        : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                    )}
                  >
                    <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "truncate text-[13px] font-medium",
                        isActive ? "text-brand" : "text-neutral-fg1",
                      )}>
                        {agent.name}
                      </p>
                      <p className="truncate text-[11px] text-neutral-fg3">
                        {ROLE_LABELS[agent.role] ?? agent.role}
                      </p>
                    </div>
                    <span className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      agent.isActive ? "bg-success" : "bg-neutral-fg-disabled",
                    )} style={agent.isActive ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined} />
                  </button>
                );
              })}

              {agents.length === 0 && (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light">
                    <Users className="h-6 w-6 text-brand" />
                  </div>
                  <p className="text-[12px] text-neutral-fg3 leading-relaxed">
                    Nenhum agente configurado.<br />Clique em + para adicionar.
                  </p>
                </div>
              )}
            </div>
          </nav>

          {/* Right — Agent Detail */}
          <div className="flex-1 overflow-y-auto p-10">
            {selected ? (
              <div className="mx-auto max-w-2xl animate-fade-up">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <AgentAvatar name={selected.name} avatar={selected.avatar} color={selected.color} size="lg" className="shadow-2" />
                    <div>
                      <h2 className="text-[20px] font-semibold text-neutral-fg1">{selected.name}</h2>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[13px] font-medium text-neutral-fg2">
                          {ROLE_LABELS[selected.role] ?? selected.role}
                        </span>
                        <span className="text-neutral-fg-disabled">·</span>
                        <span className="text-[12px] font-medium text-neutral-fg3 bg-neutral-bg2 px-2 py-0.5 rounded-md">
                          {MODEL_LABELS[selected.model] ?? selected.model}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                    selected.isActive ? "bg-success-light" : "bg-neutral-bg2",
                  )}>
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      selected.isActive ? "bg-success-dark" : "bg-neutral-fg-disabled",
                    )} style={selected.isActive ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined} />
                    <span className={cn(
                      "text-[11px] font-semibold",
                      selected.isActive ? "text-success-dark" : "text-neutral-fg-disabled",
                    )}>
                      {selected.isActive ? "Online" : "Offline"}
                    </span>
                  </span>
                </div>

                {/* Description */}
                {selected.description && (
                  <div className="card-glow p-6 mb-6">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2 mb-2">
                      Descrição
                    </h3>
                    <p className="text-[13px] text-neutral-fg1 leading-relaxed">{selected.description}</p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="card-glow overflow-hidden mb-6">
                  <dl className="flex flex-col divide-y divide-stroke2">
                    <div className="flex items-center justify-between px-6 py-4">
                      <dt className="text-[13px] text-neutral-fg2">Nível</dt>
                      <dd className="inline-flex items-center rounded-md bg-brand-light px-3 py-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                          {selected.level}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4">
                      <dt className="text-[13px] text-neutral-fg2">Permissões</dt>
                      <dd className="text-[13px] font-semibold text-neutral-fg1">
                        {selected.permissionMode === "default" ? "Padrão" : selected.permissionMode === "acceptEdits" ? "Auto-aceitar edições" : "Bypass total"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4">
                      <dt className="text-[13px] text-neutral-fg2">Extended Thinking</dt>
                      <dd className="text-[13px] font-semibold text-neutral-fg1">
                        {selected.maxThinkingTokens ? `${(selected.maxThinkingTokens / 1000).toFixed(0)}k tokens` : "Desativado"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4">
                      <dt className="text-[13px] text-neutral-fg2">Tipo</dt>
                      <dd className="text-[13px] font-semibold text-neutral-fg1">
                        {selected.isDefault ? "Padrão do sistema" : "Personalizado"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Tools */}
                <div className="card-glow p-6 mb-6">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2 mb-3">
                    Ferramentas Permitidas
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(typeof selected.allowedTools === "string"
                      ? JSON.parse(selected.allowedTools)
                      : selected.allowedTools ?? []
                    ).map((tool: string) => (
                      <span
                        key={tool}
                        className="rounded-md bg-brand-light px-3 py-1.5 text-[12px] font-medium text-brand"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleAgent(selected.id)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-semibold transition-colors",
                      selected.isActive
                        ? "bg-success-light text-success-dark hover:bg-success-light/80"
                        : "bg-neutral-bg2 text-neutral-fg3 hover:bg-neutral-bg-hover",
                    )}
                  >
                    <Power className="h-4 w-4" />
                    {selected.isActive ? "Ativo" : "Inativo"}
                  </button>
                  <button
                    onClick={() => setConfigAgent(selected)}
                    className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-semibold text-white"
                  >
                    <Settings className="h-4 w-4" />
                    Configurar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                    <Users className="h-8 w-8 text-brand" />
                  </div>
                  <p className="text-[14px] font-semibold text-neutral-fg2">Nenhum agente selecionado</p>
                  <p className="mt-1 text-[12px] text-neutral-fg3">
                    Selecione um agente na lista ou crie um novo
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Workflow tab */
        <div className="flex-1 overflow-hidden">
          <WorkflowEditor
            agents={agents}
            workflow={savedWorkflow}
            onSave={handleSaveWorkflow}
          />
        </div>
      )}

      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={handleSaveAgent}
          onClose={() => setConfigAgent(null)}
        />
      )}
    </div>
  );
}
