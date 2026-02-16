import { useState, useCallback, useMemo } from "react";
import { Plus, Trash2, ArrowDown, GripVertical, Play, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { AgentAvatar } from "./agent-avatar";
import type { Agent, WorkflowStep, AgentWorkflow } from "@agenthub/shared";

interface WorkflowEditorProps {
  agents: Agent[];
  workflow: AgentWorkflow | null;
  onSave: (workflow: AgentWorkflow) => void;
}

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
  custom: "Custom",
};

let nextStepId = 1;
function genId() {
  return `step-${Date.now()}-${nextStepId++}`;
}

function buildDefaultWorkflow(agents: Agent[]): AgentWorkflow {
  const techLead = agents.find((a) => a.role === "tech_lead");
  const entryId = genId();

  const steps: WorkflowStep[] = techLead
    ? [{ id: entryId, agentId: techLead.id, label: "Recepcionar tarefa", nextSteps: [] }]
    : [];

  return {
    id: `wf-${Date.now()}`,
    name: "Workflow Principal",
    description: "Hierarquia de execução dos agentes",
    entryStepId: steps[0]?.id ?? "",
    steps,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function WorkflowEditor({ agents, workflow, onSave }: WorkflowEditorProps) {
  const [wf, setWf] = useState<AgentWorkflow>(() => workflow ?? buildDefaultWorkflow(agents));
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

  const stepMap = useMemo(() => {
    const map = new Map<string, WorkflowStep>();
    for (const s of wf.steps) map.set(s.id, s);
    return map;
  }, [wf.steps]);

  const updateSteps = useCallback((fn: (steps: WorkflowStep[]) => WorkflowStep[]) => {
    setWf((prev) => ({ ...prev, steps: fn(prev.steps), updatedAt: new Date() }));
  }, []);

  const addStep = useCallback((parentId: string | null) => {
    const newId = genId();
    const newStep: WorkflowStep = {
      id: newId,
      agentId: agents[0]?.id ?? "",
      label: "Novo passo",
      nextSteps: [],
    };

    updateSteps((steps) => {
      const updated = [...steps, newStep];
      if (parentId) {
        return updated.map((s) =>
          s.id === parentId ? { ...s, nextSteps: [...s.nextSteps, newId] } : s,
        );
      }
      return updated;
    });

    if (!parentId && wf.steps.length === 0) {
      setWf((prev) => ({ ...prev, entryStepId: newId }));
    }

    setSelectedStepId(newId);
  }, [agents, updateSteps, wf.steps.length]);

  const removeStep = useCallback((stepId: string) => {
    updateSteps((steps) => {
      const target = steps.find((s) => s.id === stepId);
      return steps
        .filter((s) => s.id !== stepId)
        .map((s) => ({
          ...s,
          nextSteps: s.nextSteps
            .filter((id) => id !== stepId)
            .concat(s.nextSteps.includes(stepId) ? (target?.nextSteps ?? []) : []),
        }));
    });

    setWf((prev) => ({
      ...prev,
      entryStepId: prev.entryStepId === stepId
        ? (prev.steps.find((s) => s.id !== stepId)?.id ?? "")
        : prev.entryStepId,
    }));

    if (selectedStepId === stepId) setSelectedStepId(null);
  }, [selectedStepId, updateSteps]);

  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    updateSteps((steps) =>
      steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
    );
  }, [updateSteps]);

  const setEntryStep = useCallback((stepId: string) => {
    setWf((prev) => ({ ...prev, entryStepId: stepId }));
  }, []);

  // Build tree from entry point
  const renderTree = useCallback((stepId: string, depth: number, visited: Set<string>): React.ReactNode => {
    if (visited.has(stepId)) return null;
    visited.add(stepId);

    const step = stepMap.get(stepId);
    if (!step) return null;

    const agent = agentMap.get(step.agentId);
    const isSelected = selectedStepId === stepId;
    const isEntry = wf.entryStepId === stepId;

    return (
      <div key={step.id} className="flex flex-col items-center">
        {/* Step node */}
        <div
          onClick={() => setSelectedStepId(isSelected ? null : step.id)}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-5 py-4 cursor-pointer transition-all duration-200 min-w-[220px]",
            isSelected
              ? "bg-brand-light ring-2 ring-brand shadow-4"
              : "card-glow hover:shadow-4",
          )}
        >
          {isEntry && (
            <span className="absolute -top-2.5 left-4 rounded-md bg-brand px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
              Entrada
            </span>
          )}

          <div className="flex items-center gap-3 flex-1 min-w-0">
            {agent ? (
              <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-bg2 text-neutral-fg-disabled">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-neutral-fg1">
                {agent?.name ?? "Agente removido"}
              </p>
              <p className="truncate text-[11px] text-neutral-fg3">{step.label}</p>
            </div>
          </div>

          {agent && (
            <span className="shrink-0 rounded-md bg-neutral-bg2 px-2 py-0.5 text-[10px] font-medium text-neutral-fg3">
              {ROLE_LABELS[agent.role] ?? agent.role}
            </span>
          )}
        </div>

        {/* Children */}
        {step.nextSteps.length > 0 && (
          <>
            {/* Connector line */}
            <div className="flex flex-col items-center my-1">
              <div className="h-6 w-px bg-stroke2" />
              <ArrowDown className="h-3.5 w-3.5 text-neutral-fg-disabled -my-0.5" />
            </div>

            {step.nextSteps.length === 1 ? (
              renderTree(step.nextSteps[0], depth + 1, visited)
            ) : (
              <div className="flex items-start gap-6">
                {step.nextSteps.map((childId, i) => (
                  <div key={childId} className="flex flex-col items-center">
                    {i > 0 && <div className="h-px w-6 bg-stroke2 self-start -mt-[27px] -ml-6" />}
                    {renderTree(childId, depth + 1, visited)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Add child button */}
        {isSelected && (
          <div className="flex flex-col items-center mt-1 animate-fade-up">
            <div className="h-4 w-px bg-stroke2" />
            <button
              onClick={(e) => { e.stopPropagation(); addStep(step.id); }}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-brand/40 text-brand transition-all hover:border-brand hover:bg-brand-light hover:shadow-glow"
              title="Adicionar próximo passo"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }, [stepMap, agentMap, selectedStepId, wf.entryStepId, addStep]);

  // Find orphan steps (not reachable from entry)
  const reachable = useMemo(() => {
    const set = new Set<string>();
    const queue = wf.entryStepId ? [wf.entryStepId] : [];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (set.has(id)) continue;
      set.add(id);
      const step = stepMap.get(id);
      if (step) queue.push(...step.nextSteps);
    }
    return set;
  }, [wf.entryStepId, stepMap]);

  const orphanSteps = wf.steps.filter((s) => !reachable.has(s.id));

  const selectedStep = selectedStepId ? stepMap.get(selectedStepId) : null;

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
          {/* Workflow header */}
          <div className="mb-8 animate-fade-up">
            <input
              value={wf.name}
              onChange={(e) => setWf((prev) => ({ ...prev, name: e.target.value }))}
              className="bg-transparent text-[20px] font-semibold text-neutral-fg1 outline-none border-b border-transparent focus:border-brand transition-colors w-full"
              placeholder="Nome do workflow"
            />
            <input
              value={wf.description}
              onChange={(e) => setWf((prev) => ({ ...prev, description: e.target.value }))}
              className="mt-1 bg-transparent text-[13px] text-neutral-fg3 outline-none border-b border-transparent focus:border-stroke transition-colors w-full"
              placeholder="Descrição do workflow"
            />
          </div>

          {/* Flow tree */}
          {wf.entryStepId && stepMap.has(wf.entryStepId) ? (
            <div className="flex flex-col items-center">
              {renderTree(wf.entryStepId, 0, new Set())}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                <Play className="h-8 w-8 text-brand" />
              </div>
              <p className="text-[14px] font-semibold text-neutral-fg2">
                Nenhum passo definido
              </p>
              <p className="text-[12px] text-neutral-fg3 max-w-xs leading-relaxed">
                Comece adicionando o primeiro passo do workflow — geralmente o agente que recepciona as tarefas.
              </p>
              <button
                onClick={() => addStep(null)}
                className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Adicionar primeiro passo
              </button>
            </div>
          )}

          {/* Orphan steps */}
          {orphanSteps.length > 0 && (
            <div className="mt-10 border-t border-stroke2 pt-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                Passos desconectados
              </p>
              <div className="flex flex-wrap gap-3">
                {orphanSteps.map((step) => {
                  const agent = agentMap.get(step.agentId);
                  return (
                    <div
                      key={step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-3 cursor-pointer transition-all",
                        selectedStepId === step.id
                          ? "bg-brand-light ring-2 ring-brand"
                          : "bg-neutral-bg2 border border-stroke hover:bg-neutral-bg-hover",
                      )}
                    >
                      {agent && <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />}
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-neutral-fg1">{agent?.name ?? "?"}</p>
                        <p className="truncate text-[10px] text-neutral-fg3">{step.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — Step editor */}
      {selectedStep && (
        <div className="w-[300px] shrink-0 border-l border-stroke2 bg-neutral-bg-subtle p-5 overflow-y-auto animate-slide-in-right">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-semibold text-neutral-fg1">Editar Passo</h3>
            <button
              onClick={() => removeStep(selectedStep.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-fg3 transition-colors hover:bg-danger/10 hover:text-danger"
              title="Remover passo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Agent selector */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                Agente
              </label>
              <select
                value={selectedStep.agentId}
                onChange={(e) => updateStep(selectedStep.id, { agentId: e.target.value })}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ROLE_LABELS[a.role] ?? a.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Label */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                Descrição do passo
              </label>
              <input
                value={selectedStep.label}
                onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                placeholder="Ex: Planejar arquitetura"
              />
            </div>

            {/* Set as entry */}
            {wf.entryStepId !== selectedStep.id && (
              <button
                onClick={() => setEntryStep(selectedStep.id)}
                className="flex items-center gap-2 rounded-md bg-neutral-bg2 px-3 py-2.5 text-[12px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
              >
                <Play className="h-3.5 w-3.5" />
                Definir como ponto de entrada
              </button>
            )}

            {/* Next steps */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                Próximos passos
              </label>
              {selectedStep.nextSteps.length > 0 ? (
                <div className="space-y-1.5">
                  {selectedStep.nextSteps.map((nextId) => {
                    const nextStep = stepMap.get(nextId);
                    const nextAgent = nextStep ? agentMap.get(nextStep.agentId) : null;
                    return (
                      <div key={nextId} className="flex items-center gap-2 rounded-md bg-neutral-bg2 px-3 py-2 text-[12px]">
                        <ChevronRight className="h-3.5 w-3.5 text-neutral-fg-disabled shrink-0" />
                        <span className="text-neutral-fg1 truncate flex-1">
                          {nextAgent?.name ?? "?"} — {nextStep?.label ?? "?"}
                        </span>
                        <button
                          onClick={() => {
                            updateStep(selectedStep.id, {
                              nextSteps: selectedStep.nextSteps.filter((id) => id !== nextId),
                            });
                          }}
                          className="text-neutral-fg-disabled hover:text-danger transition-colors shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-fg-disabled italic">
                  Nenhum — selecione o nó e clique + abaixo
                </p>
              )}
            </div>

            {/* Connect to existing */}
            {wf.steps.filter((s) => s.id !== selectedStep.id && !selectedStep.nextSteps.includes(s.id)).length > 0 && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Conectar a passo existente
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateStep(selectedStep.id, {
                      nextSteps: [...selectedStep.nextSteps, e.target.value],
                    });
                  }}
                  className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[12px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                >
                  <option value="">Selecionar passo...</option>
                  {wf.steps
                    .filter((s) => s.id !== selectedStep.id && !selectedStep.nextSteps.includes(s.id))
                    .map((s) => {
                      const a = agentMap.get(s.agentId);
                      return (
                        <option key={s.id} value={s.id}>
                          {a?.name ?? "?"} — {s.label}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save FAB */}
      <button
        onClick={() => onSave(wf)}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-[13px] font-semibold text-white shadow-brand transition-all hover:bg-brand-hover hover:shadow-glow z-10"
      >
        Salvar Workflow
      </button>
    </div>
  );
}
