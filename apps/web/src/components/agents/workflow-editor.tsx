import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ArrowDown, Play, ChevronRight, CornerDownLeft, CornerUpLeft, Zap, Bot, GitFork, Merge, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { AgentAvatar } from "./agent-avatar";
import { WorkflowToolbar } from "../workflows/workflow-toolbar";
import { WorkflowConditionEditor } from "../workflows/workflow-condition-editor";
import { getNodeBadgeClasses } from "../workflows/workflow-node";
import type { Agent, WorkflowStep, AgentWorkflow, Workflow, WorkflowNode, WorkflowEdge, WorkflowNodeType } from "@agenthub/shared";

/* ───────────────────────────────────────────────── */
/*  Props — supports both legacy and new formats     */
/* ───────────────────────────────────────────────── */

interface WorkflowEditorProps {
  agents: Agent[];
  /** Legacy workflow (AgentWorkflow from localStorage) */
  workflow: AgentWorkflow | null;
  onSave: (workflow: AgentWorkflow) => void;
  /** New workflow API integration */
  apiWorkflow?: Workflow | null;
  onSaveApi?: (workflow: Workflow) => void;
  workflows?: Workflow[];
  onSelectWorkflow?: (id: string) => void;
  onSetDefault?: (id: string) => void;
  saving?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
  receptionist: "Team Lead",
  doc_writer: "Doc Writer",
  support: "Support",
  custom: "Custom",
};

let nextStepId = 1;
function genId() {
  return `step-${Date.now()}-${nextStepId++}`;
}

/** Special marker for the Web App source node (not a real agent) */
const SOURCE_WEBAPP_ID = "_source:webapp";

const NODE_TYPE_ICONS: Record<WorkflowNodeType, typeof Bot> = {
  agent: Bot,
  condition: GitFork,
  parallel: Zap,
  merge: Merge,
};

function buildDefaultWorkflow(agents: Agent[]): AgentWorkflow {
  const receptionist = agents.find((a) => a.role === "receptionist");
  const techLead = agents.find((a) => a.role === "tech_lead");
  const architect = agents.find((a) => a.role === "architect");
  const frontendDev = agents.find((a) => a.role === "frontend_dev");
  const backendDev = agents.find((a) => a.role === "backend_dev");
  const qa = agents.find((a) => a.role === "qa");
  const support = agents.find((a) => a.role === "support");

  const steps: WorkflowStep[] = [];
  const addEdge = (fromId: string, toId: string, label: string) => {
    const s = steps.find((st) => st.id === fromId);
    if (s) {
      s.nextSteps.push(toId);
      s.nextStepLabels = s.nextStepLabels ?? [];
      s.nextStepLabels.push(label);
    }
  };

  // ── Entry point nodes (how tasks enter the system) ────

  // 0a. WhatsApp — Team Lead (receptionist) receives via WhatsApp
  const waId = genId();
  if (receptionist) {
    steps.push({ id: waId, agentId: receptionist.id, label: "Recebe task via WhatsApp", nextSteps: [], nextStepLabels: [] });
  }

  // 0b. Web App — User creates task via interface
  const webId = genId();
  steps.push({ id: webId, agentId: SOURCE_WEBAPP_ID, label: "Pagina de tasks — cria e gerencia tasks", nextSteps: [], nextStepLabels: [] });

  // ── Step nodes ──────────────────────────────────────────

  // 1. Tech Lead — triage / fix plan
  const tlId = genId();
  if (techLead) {
    steps.push({ id: tlId, agentId: techLead.id, label: "Triagem / Plano de melhoria", nextSteps: [], nextStepLabels: [] });
  }

  // 2. Architect — planning (complex tasks or escalation)
  const archId = genId();
  if (architect) {
    steps.push({ id: archId, agentId: architect.id, label: "Plano de arquitetura", nextSteps: [], nextStepLabels: [] });
  }

  // 3. Devs — execution
  const feId = genId();
  const beId = genId();
  const devIds: string[] = [];
  if (frontendDev) {
    steps.push({ id: feId, agentId: frontendDev.id, label: "Implementar frontend", nextSteps: [], nextStepLabels: [] });
    devIds.push(feId);
  }
  if (backendDev) {
    steps.push({ id: beId, agentId: backendDev.id, label: "Implementar backend", nextSteps: [], nextStepLabels: [] });
    devIds.push(beId);
  }

  // 4. QA — review
  const qaId = genId();
  if (qa) {
    steps.push({ id: qaId, agentId: qa.id, label: "Revisar e testar implementacao", nextSteps: [], nextStepLabels: [] });
  }

  // 5. Support — critical issue resolution (escalated by Tech Lead)
  const supportId = genId();
  if (support) {
    steps.push({ id: supportId, agentId: support.id, label: "Resolver issue critico (acesso total)", nextSteps: [], nextStepLabels: [] });
  }

  // ── Entry edges (how tasks reach the Tech Lead) ────────

  // 0a. WhatsApp (Team Lead) → Tech Lead
  if (receptionist && techLead) {
    addEdge(waId, tlId, "Escalação");
  }

  // 0b. Web App → Tech Lead
  if (techLead) {
    addEdge(webId, tlId, "Nova task");
  }

  // ── Forward edges (happy path) ─────────────────────────

  // 1a. Tech Lead → Architect (task complexa)
  if (techLead && architect) {
    addEdge(tlId, archId, "Complexa");
  }

  // 1b. Tech Lead → Devs (task simples — TL planeja direto)
  if (techLead) {
    for (const dId of devIds) addEdge(tlId, dId, "Simples");
  }

  // 1c. Architect → Tech Lead (devolve plano)
  if (architect && techLead) {
    addEdge(archId, tlId, "Plano pronto");
  }

  // 2. Devs → QA (dev concluiu)
  if (qa) {
    for (const dId of devIds) addEdge(dId, qaId, "Concluiu");
  }

  // ── Back edges (QA rejection cycle) ────────────────────

  // 3a. QA → Dev (rejeitou — dev tenta corrigir)
  if (qa && devIds.length > 0) {
    for (const dId of devIds) addEdge(qaId, dId, "Rejeitou");
  }

  // 4. Dev → Tech Lead (dev nao conseguiu resolver)
  if (techLead) {
    for (const dId of devIds) addEdge(dId, tlId, "Precisa de ajuda");
  }

  // 5. Tech Lead → Architect (TL nao conseguiu criar plano — escalar)
  if (techLead && architect) {
    addEdge(tlId, archId, "Escalar");
  }

  // 6. Tech Lead → Support (issue critico — precisa acesso total)
  if (techLead && support) {
    addEdge(tlId, supportId, "Issue critico");
  }

  // 7. Support → Tech Lead (resolucao concluida)
  if (support && techLead) {
    addEdge(supportId, tlId, "Resolvido");
  }

  const entryStepId = steps[0]?.id ?? "";

  return {
    id: `wf-${Date.now()}`,
    name: "Workflow Principal",
    description: "WhatsApp / AgentHub → Tech Lead → Devs → QA | Escalacao: Dev → Tech Lead → Arquiteto",
    entryStepId,
    steps,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** BFS layer assignment for graph layout — seeds from ALL root nodes (no incoming edges) */
function assignLayers(steps: WorkflowStep[], entryId: string): Map<string, number> {
  const layers = new Map<string, number>();
  const stepMap = new Map<string, WorkflowStep>();
  for (const s of steps) stepMap.set(s.id, s);

  // Find all nodes that have incoming forward edges
  const hasIncoming = new Set<string>();
  for (const s of steps) {
    for (const nextId of s.nextSteps) hasIncoming.add(nextId);
  }

  // Seed BFS with all root nodes (no incoming edges) at layer 0
  const queue: string[] = [];
  for (const s of steps) {
    if (!hasIncoming.has(s.id)) {
      layers.set(s.id, 0);
      queue.push(s.id);
    }
  }
  // Fallback: if no roots found, use entryId
  if (queue.length === 0 && entryId) {
    layers.set(entryId, 0);
    queue.push(entryId);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const step = stepMap.get(id);
    if (!step) continue;

    const currentLayer = layers.get(id) ?? 0;
    for (const nextId of step.nextSteps) {
      if (!layers.has(nextId)) {
        layers.set(nextId, currentLayer + 1);
        queue.push(nextId);
      }
    }
  }
  return layers;
}

/** Get step "type" — inferred from agentId or future metadata */
function getStepNodeType(step: WorkflowStep): WorkflowNodeType {
  // Check if the step has metadata for type (for new-style nodes)
  const meta = (step as WorkflowStep & { _nodeType?: WorkflowNodeType })._nodeType;
  if (meta) return meta;
  return "agent";
}

export function WorkflowEditor({ agents, workflow, onSave, apiWorkflow, onSaveApi, workflows = [], onSelectWorkflow, onSetDefault, saving = false }: WorkflowEditorProps) {
  const { t } = useTranslation();
  const [wf, setWf] = useState<AgentWorkflow>(() => workflow ?? buildDefaultWorkflow(agents));
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [conditionNode, setConditionNode] = useState<WorkflowNode | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [simulationOrder, setSimulationOrder] = useState<Map<string, number> | null>(null);

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

  const addNodeOfType = useCallback((type: WorkflowNodeType) => {
    const newId = genId();
    const labels: Record<WorkflowNodeType, string> = {
      agent: t("workflow.newAgentStep", "Novo passo"),
      condition: t("workflow.newCondition", "Nova condicao"),
      parallel: t("workflow.newParallel", "Execucao paralela"),
      merge: t("workflow.newMerge", "Merge"),
    };
    const newStep: WorkflowStep & { _nodeType?: WorkflowNodeType } = {
      id: newId,
      agentId: type === "agent" ? (agents[0]?.id ?? "") : `_${type}:${newId}`,
      label: labels[type],
      nextSteps: [],
      _nodeType: type,
    };

    updateSteps((steps) => [...steps, newStep]);
    setSelectedStepId(newId);
  }, [agents, t, updateSteps]);

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

  // Validate workflow
  const handleValidate = useCallback(() => {
    const errors: string[] = [];
    if (wf.steps.length === 0) {
      errors.push(t("workflow.validation.noSteps", "Workflow vazio — adicione pelo menos um passo"));
    }
    if (!wf.entryStepId || !stepMap.has(wf.entryStepId)) {
      errors.push(t("workflow.validation.noEntry", "Nenhum ponto de entrada definido"));
    }
    // Check for disconnected nodes
    const hasIncoming = new Set<string>();
    for (const s of wf.steps) {
      for (const nId of s.nextSteps) hasIncoming.add(nId);
    }
    const roots = wf.steps.filter((s) => !hasIncoming.has(s.id));
    const reachableSet = new Set<string>();
    const queue = roots.map((r) => r.id);
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachableSet.has(id)) continue;
      reachableSet.add(id);
      const step = stepMap.get(id);
      if (step) queue.push(...step.nextSteps);
    }
    const orphanCount = wf.steps.filter((s) => !reachableSet.has(s.id)).length;
    if (orphanCount > 0) {
      errors.push(t("workflow.validation.orphans", "{{count}} passos desconectados", { count: orphanCount }));
    }
    // Check agent assignments
    for (const step of wf.steps) {
      const nodeType = getStepNodeType(step);
      if (nodeType === "agent" && step.agentId !== SOURCE_WEBAPP_ID && !agentMap.has(step.agentId)) {
        errors.push(t("workflow.validation.missingAgent", "Passo \"{{label}}\" sem agente valido", { label: step.label }));
      }
    }
    setValidationErrors(errors);
    setSimulationOrder(null);
  }, [wf, stepMap, agentMap, t]);

  // Simulate execution order
  const handleSimulate = useCallback(() => {
    setValidationErrors([]);
    const order = new Map<string, number>();
    const visited = new Set<string>();
    const queue: string[] = [];
    let layer = 0;

    // Start from entry
    if (wf.entryStepId) {
      queue.push(wf.entryStepId);
    }

    while (queue.length > 0) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        order.set(id, layer);
        const step = stepMap.get(id);
        if (step) {
          for (const nextId of step.nextSteps) {
            if (!visited.has(nextId)) queue.push(nextId);
          }
        }
      }
      layer++;
    }

    setSimulationOrder(order);
  }, [wf.entryStepId, stepMap]);

  // Handle save — uses API if available, falls back to localStorage
  const handleSave = useCallback(() => {
    onSave(wf);
  }, [wf, onSave]);

  // Compute layers and identify back-edges
  const layers = useMemo(() => assignLayers(wf.steps, wf.entryStepId), [wf.steps, wf.entryStepId]);

  const { layerGroups, backEdges } = useMemo(() => {
    const groups = new Map<number, WorkflowStep[]>();
    const backs: Array<{ fromId: string; toId: string; label: string }> = [];

    for (const step of wf.steps) {
      const layer = layers.get(step.id);
      if (layer === undefined) continue;

      if (!groups.has(layer)) groups.set(layer, []);
      groups.get(layer)!.push(step);

      // Identify back-edges (target has same or lower layer = cycle)
      for (let i = 0; i < step.nextSteps.length; i++) {
        const nextId = step.nextSteps[i];
        const nextLayer = layers.get(nextId);
        if (nextLayer !== undefined && nextLayer <= layer) {
          const label = step.nextStepLabels?.[i] ?? "";
          backs.push({ fromId: step.id, toId: nextId, label });
        }
      }
    }

    return { layerGroups: groups, backEdges: backs };
  }, [wf.steps, layers]);

  // Forward edges for a step (target layer > source layer)
  const getForwardEdges = useCallback((step: WorkflowStep) => {
    const srcLayer = layers.get(step.id) ?? 0;
    const edges: Array<{ targetId: string; label: string }> = [];
    for (let i = 0; i < step.nextSteps.length; i++) {
      const nextId = step.nextSteps[i];
      const nextLayer = layers.get(nextId);
      if (nextLayer !== undefined && nextLayer > srcLayer) {
        edges.push({ targetId: nextId, label: step.nextStepLabels?.[i] ?? "" });
      }
    }
    return edges;
  }, [layers]);

  // Find orphan steps — reachable = all nodes visited by BFS from every root (no incoming edges)
  const reachable = useMemo(() => {
    const hasIncoming = new Set<string>();
    for (const s of wf.steps) {
      for (const nId of s.nextSteps) hasIncoming.add(nId);
    }
    const set = new Set<string>();
    const queue: string[] = [];
    for (const s of wf.steps) {
      if (!hasIncoming.has(s.id)) queue.push(s.id);
    }
    if (queue.length === 0 && wf.entryStepId) queue.push(wf.entryStepId);
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (set.has(id)) continue;
      set.add(id);
      const step = stepMap.get(id);
      if (step) queue.push(...step.nextSteps);
    }
    return set;
  }, [wf.steps, stepMap]);

  const orphanSteps = wf.steps.filter((s) => !reachable.has(s.id));

  const selectedStep = selectedStepId ? stepMap.get(selectedStepId) : null;

  // Get back-edges pointing TO a given step
  const getIncomingBackEdges = useCallback((stepId: string) => {
    return backEdges.filter((e) => e.toId === stepId);
  }, [backEdges]);

  // Get back-edges going FROM a given step
  const getOutgoingBackEdges = useCallback((stepId: string) => {
    return backEdges.filter((e) => e.fromId === stepId);
  }, [backEdges]);

  const maxLayer = Math.max(0, ...Array.from(layers.values()));

  // Get node style based on type
  const getNodeStyle = (step: WorkflowStep) => {
    const nodeType = getStepNodeType(step);
    if (nodeType !== "agent") {
      return getNodeBadgeClasses(nodeType);
    }
    return null;
  };

  // Render a single node
  const renderNode = (step: WorkflowStep, animIndex: number) => {
    const agent = agentMap.get(step.agentId);
    const isSelected = selectedStepId === step.id;
    const isEntry = wf.entryStepId === step.id;
    const incomingBacks = getIncomingBackEdges(step.id);
    const outgoingBacks = getOutgoingBackEdges(step.id);
    const nodeType = getStepNodeType(step);
    const nodeStyle = getNodeStyle(step);
    const NodeIcon = NODE_TYPE_ICONS[nodeType];
    const simOrder = simulationOrder?.get(step.id);

    return (
      <div
        key={step.id}
        className={cn("flex flex-col items-center", `animate-fade-up stagger-${Math.min(animIndex + 1, 5)}`)}
      >
        {/* Incoming back-edge badges (returns from later steps) */}
        {incomingBacks.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 justify-center">
            {incomingBacks.map((edge, i) => {
              const fromStep = stepMap.get(edge.fromId);
              const fromAgent = fromStep ? agentMap.get(fromStep.agentId) : null;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-warning-light px-2.5 py-1 text-[10px] font-medium text-warning"
                >
                  <CornerDownLeft className="h-3 w-3" />
                  {edge.label ? `${edge.label} — ` : ""}{t("workflow.backFrom", "volta de")} {fromAgent?.name ?? "?"}
                </span>
              );
            })}
          </div>
        )}

        {/* Step node */}
        <div
          onClick={() => setSelectedStepId(isSelected ? null : step.id)}
          onDoubleClick={() => {
            if (nodeType === "condition") {
              const node: WorkflowNode = {
                id: step.id,
                type: "condition",
                label: step.label,
                position: { x: 0, y: 0 },
                conditionField: (step as WorkflowStep & { conditionField?: string }).conditionField,
                conditionOperator: (step as WorkflowStep & { conditionOperator?: string }).conditionOperator as WorkflowNode["conditionOperator"],
                conditionValue: (step as WorkflowStep & { conditionValue?: string }).conditionValue,
              };
              setConditionNode(node);
            }
          }}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-5 py-4 cursor-pointer transition-all duration-200 min-w-[220px] max-w-[280px]",
            nodeType !== "agent" && nodeStyle
              ? isSelected
                ? nodeStyle.bgSelected
                : `${nodeStyle.bg} border hover:shadow-4`
              : isSelected
                ? "bg-brand-light ring-2 ring-brand shadow-4"
                : "card-glow hover:shadow-4",
          )}
        >
          {isEntry && (
            <span className="absolute -top-2.5 left-4 rounded-md bg-brand px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
              {t("workflow.entry", "Entrada")}
            </span>
          )}

          {/* Simulation order badge */}
          {simOrder !== undefined && (
            <span className="absolute -top-2.5 right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-info px-1.5 text-[9px] font-bold text-white">
              {simOrder + 1}
            </span>
          )}

          <div className="flex items-center gap-3 flex-1 min-w-0">
            {nodeType !== "agent" ? (
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                nodeStyle?.badge ?? "bg-neutral-bg2",
              )}>
                <NodeIcon className={cn("h-5 w-5", nodeStyle?.icon ?? "text-neutral-fg2")} />
              </div>
            ) : step.agentId === SOURCE_WEBAPP_ID ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple shadow-brand">
                <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
            ) : agent ? (
              <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-bg2 text-neutral-fg-disabled">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-neutral-fg1">
                {nodeType !== "agent"
                  ? step.label
                  : step.agentId === SOURCE_WEBAPP_ID
                    ? "AgentHub"
                    : (agent?.name ?? t("workflow.removedAgent", "Agente removido"))}
              </p>
              <p className="truncate text-[11px] text-neutral-fg3">
                {nodeType !== "agent"
                  ? t(`workflow.nodeType.${nodeType}`, nodeType)
                  : step.label}
              </p>
            </div>
          </div>

          {nodeType !== "agent" ? (
            <span className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium",
              nodeStyle?.badge ?? "bg-neutral-bg2",
              nodeStyle?.badgeText ?? "text-neutral-fg3",
            )}>
              {t(`workflow.nodeType.${nodeType}`, nodeType)}
            </span>
          ) : step.agentId === SOURCE_WEBAPP_ID ? (
            <span className="shrink-0 rounded-md bg-brand-light px-2 py-0.5 text-[10px] font-medium text-brand">
              App
            </span>
          ) : agent ? (
            <span className="shrink-0 rounded-md bg-neutral-bg2 px-2 py-0.5 text-[10px] font-medium text-neutral-fg3">
              {ROLE_LABELS[agent.role] ?? agent.role}
            </span>
          ) : null}
        </div>

        {/* Outgoing back-edge badges (returns to earlier steps) */}
        {outgoingBacks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
            {outgoingBacks.map((edge, i) => {
              const toStep = stepMap.get(edge.toId);
              const toAgent = toStep ? agentMap.get(toStep.agentId) : null;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2.5 py-1 text-[10px] font-medium text-danger"
                >
                  <CornerUpLeft className="h-3 w-3" />
                  {edge.label ? `${edge.label} → ` : ""}{t("workflow.backTo", "volta para")} {toAgent?.name ?? "?"}
                </span>
              );
            })}
          </div>
        )}

        {/* Add child button when selected */}
        {isSelected && (
          <div className="flex flex-col items-center mt-2 animate-fade-up">
            <button
              onClick={(e) => { e.stopPropagation(); addStep(step.id); }}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-brand/40 text-brand transition-all hover:border-brand hover:bg-brand-light hover:shadow-glow"
              title={t("workflow.addNextStep", "Adicionar proximo passo")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <WorkflowToolbar
        workflowName={wf.name}
        onNameChange={(name) => setWf((prev) => ({ ...prev, name }))}
        onAddNode={addNodeOfType}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onSave={handleSave}
        saving={saving}
        workflows={workflows}
        activeWorkflowId={apiWorkflow?.id ?? null}
        onSelectWorkflow={onSelectWorkflow ?? (() => {})}
        onSetDefault={onSetDefault ?? (() => {})}
        isDefault={apiWorkflow?.isDefault ?? false}
      />

      {/* Validation errors / Simulation banner */}
      {validationErrors.length > 0 && (
        <div className="mx-5 mt-3 rounded-lg border border-danger/30 bg-danger-light p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-danger" />
            <span className="text-[12px] font-semibold text-danger">
              {t("workflow.validation.title", "Problemas encontrados")}
            </span>
          </div>
          <ul className="space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-[11px] text-danger/80 pl-6">- {err}</li>
            ))}
          </ul>
        </div>
      )}

      {simulationOrder && (
        <div className="mx-5 mt-3 rounded-lg border border-info/30 bg-info-light p-3">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-info" />
            <span className="text-[12px] font-semibold text-info">
              {t("workflow.simulation.active", "Simulacao ativa — numeros mostram a ordem de execucao")}
            </span>
            <button
              onClick={() => setSimulationOrder(null)}
              className="ml-auto text-[11px] text-info hover:text-info/70 font-medium"
            >
              {t("workflow.simulation.clear", "Limpar")}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 overflow-auto p-8">
          <div className="mx-auto max-w-4xl">
            {/* Workflow description */}
            <div className="mb-8 animate-fade-up">
              <input
                value={wf.description}
                onChange={(e) => setWf((prev) => ({ ...prev, description: e.target.value }))}
                className="bg-transparent text-[13px] text-neutral-fg3 outline-none border-b border-transparent focus:border-stroke transition-colors w-full"
                placeholder={t("workflow.descriptionPlaceholder", "Descricao do workflow")}
              />
            </div>

            {/* Layered graph */}
            {wf.entryStepId && stepMap.has(wf.entryStepId) ? (
              <div className="flex flex-col items-center gap-0">
                {Array.from({ length: maxLayer + 1 }, (_, layer) => {
                  const stepsInLayer = layerGroups.get(layer) ?? [];
                  if (stepsInLayer.length === 0) return null;

                  // Check if any step in previous layer has forward edges to this layer
                  const hasConnectorFromAbove = layer > 0;

                  return (
                    <div key={layer} className="flex flex-col items-center">
                      {/* Connector from previous layer */}
                      {hasConnectorFromAbove && (
                        <div className="flex flex-col items-center my-1">
                          <div className="h-5 w-px bg-stroke2" />
                          <ArrowDown className="h-3.5 w-3.5 text-neutral-fg-disabled -my-0.5" />
                        </div>
                      )}

                      {/* Edge labels between layers */}
                      {layer > 0 && (() => {
                        const prevSteps = layerGroups.get(layer - 1) ?? [];
                        const edgeLabels: string[] = [];
                        for (const prev of prevSteps) {
                          const fwd = getForwardEdges(prev);
                          for (const e of fwd) {
                            const targetInThisLayer = stepsInLayer.some((s) => s.id === e.targetId);
                            if (targetInThisLayer && e.label) {
                              edgeLabels.push(e.label);
                            }
                          }
                        }
                        if (edgeLabels.length === 0) return null;
                        return (
                          <div className="mb-1 flex gap-2 justify-center">
                            {edgeLabels.map((l, i) => (
                              <span key={i} className="rounded-md bg-success-light px-2 py-0.5 text-[9px] font-semibold text-success">
                                {l}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Nodes in this layer */}
                      {stepsInLayer.length === 1 ? (
                        renderNode(stepsInLayer[0], layer)
                      ) : (
                        <div className="flex items-start gap-6 justify-center">
                          {stepsInLayer.map((step, i) => renderNode(step, layer + i))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                  <Play className="h-8 w-8 text-brand" />
                </div>
                <p className="text-[14px] font-semibold text-neutral-fg2">
                  {t("workflow.noSteps", "Nenhum passo definido")}
                </p>
                <p className="text-[12px] text-neutral-fg3 max-w-xs leading-relaxed">
                  {t("workflow.noStepsDesc", "Comece adicionando o primeiro passo do workflow.")}
                </p>
                <button
                  onClick={() => addStep(null)}
                  className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  {t("workflow.addFirstStep", "Adicionar primeiro passo")}
                </button>
              </div>
            )}

            {/* Orphan steps */}
            {orphanSteps.length > 0 && (
              <div className="mt-10 border-t border-stroke2 pt-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  {t("workflow.disconnectedSteps", "Passos desconectados")}
                </p>
                <div className="flex flex-wrap gap-3">
                  {orphanSteps.map((step) => {
                    const agent = agentMap.get(step.agentId);
                    const nodeType = getStepNodeType(step);
                    const NodeIcon = NODE_TYPE_ICONS[nodeType];
                    const nodeStyles = nodeType !== "agent" ? getNodeBadgeClasses(nodeType) : null;

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
                        {nodeType !== "agent" ? (
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", nodeStyles?.badge ?? "bg-neutral-bg2")}>
                            <NodeIcon className={cn("h-4 w-4", nodeStyles?.icon ?? "text-neutral-fg2")} />
                          </div>
                        ) : step.agentId === SOURCE_WEBAPP_ID ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-purple shadow-brand">
                            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
                          </div>
                        ) : agent ? (
                          <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-neutral-fg1">
                            {nodeType !== "agent" ? step.label : step.agentId === SOURCE_WEBAPP_ID ? "AgentHub" : (agent?.name ?? "?")}
                          </p>
                          <p className="truncate text-[10px] text-neutral-fg3">
                            {nodeType !== "agent" ? t(`workflow.nodeType.${nodeType}`, nodeType) : step.label}
                          </p>
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
              <h3 className="text-[13px] font-semibold text-neutral-fg1">{t("workflow.editStep", "Editar Passo")}</h3>
              <button
                onClick={() => removeStep(selectedStep.id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-fg3 transition-colors hover:bg-danger/10 hover:text-danger"
                title={t("workflow.removeStep", "Remover passo")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Node type badge */}
              {getStepNodeType(selectedStep) !== "agent" && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const nodeType = getStepNodeType(selectedStep);
                    const NodeIcon = NODE_TYPE_ICONS[nodeType];
                    const nodeStyles = getNodeBadgeClasses(nodeType);
                    return (
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1", nodeStyles.badge, nodeStyles.badgeText, "text-[11px] font-semibold")}>
                        <NodeIcon className="h-3.5 w-3.5" />
                        {t(`workflow.nodeType.${nodeType}`, nodeType)}
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Agent selector — only for agent nodes */}
              {getStepNodeType(selectedStep) === "agent" && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                    {t("workflow.agent", "Agente")}
                  </label>
                  {selectedStep.agentId === SOURCE_WEBAPP_ID ? (
                    <div className="flex items-center gap-2 rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg2">
                      <Zap className="h-4 w-4 text-brand" strokeWidth={2.5} />
                      AgentHub ({t("workflow.taskPage", "pagina de tasks")})
                    </div>
                  ) : (
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
                  )}
                </div>
              )}

              {/* Condition editor button — only for condition nodes */}
              {getStepNodeType(selectedStep) === "condition" && (
                <button
                  onClick={() => {
                    const node: WorkflowNode = {
                      id: selectedStep.id,
                      type: "condition",
                      label: selectedStep.label,
                      position: { x: 0, y: 0 },
                      conditionField: (selectedStep as WorkflowStep & { conditionField?: string }).conditionField,
                      conditionOperator: (selectedStep as WorkflowStep & { conditionOperator?: string }).conditionOperator as WorkflowNode["conditionOperator"],
                      conditionValue: (selectedStep as WorkflowStep & { conditionValue?: string }).conditionValue,
                    };
                    setConditionNode(node);
                  }}
                  className="flex items-center gap-2 rounded-md bg-warning-light px-3 py-2.5 text-[12px] font-medium text-warning transition-colors hover:bg-warning-light/80"
                >
                  <GitFork className="h-3.5 w-3.5" />
                  {t("workflow.editCondition", "Editar condicao")}
                </button>
              )}

              {/* Label */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  {t("workflow.stepDescription", "Descricao do passo")}
                </label>
                <input
                  value={selectedStep.label}
                  onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })}
                  className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  placeholder={t("workflow.stepLabelPlaceholder", "Ex: Planejar arquitetura")}
                />
              </div>

              {/* Set as entry */}
              {wf.entryStepId !== selectedStep.id && (
                <button
                  onClick={() => setEntryStep(selectedStep.id)}
                  className="flex items-center gap-2 rounded-md bg-neutral-bg2 px-3 py-2.5 text-[12px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                >
                  <Play className="h-3.5 w-3.5" />
                  {t("workflow.setAsEntry", "Definir como ponto de entrada")}
                </button>
              )}

              {/* Next steps with labels */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  {t("workflow.nextSteps", "Proximos passos")}
                </label>
                {selectedStep.nextSteps.length > 0 ? (
                  <div className="space-y-2">
                    {selectedStep.nextSteps.map((nextId, idx) => {
                      const nextStep = stepMap.get(nextId);
                      const nextAgent = nextStep ? agentMap.get(nextStep.agentId) : null;
                      const edgeLabel = selectedStep.nextStepLabels?.[idx] ?? "";
                      const isBackEdge = (layers.get(nextId) ?? Infinity) <= (layers.get(selectedStep.id) ?? 0);

                      return (
                        <div key={nextId} className="rounded-md bg-neutral-bg2 px-3 py-2">
                          <div className="flex items-center gap-2 text-[12px]">
                            {isBackEdge ? (
                              <CornerUpLeft className="h-3.5 w-3.5 text-warning shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-neutral-fg-disabled shrink-0" />
                            )}
                            <span className="text-neutral-fg1 truncate flex-1">
                              {nextAgent?.name ?? nextStep?.label ?? "?"} — {nextStep?.label ?? "?"}
                            </span>
                            <button
                              onClick={() => {
                                const newNextSteps = selectedStep.nextSteps.filter((id) => id !== nextId);
                                const newLabels = (selectedStep.nextStepLabels ?? []).filter((_, i) => i !== idx);
                                updateStep(selectedStep.id, { nextSteps: newNextSteps, nextStepLabels: newLabels });
                              }}
                              className="text-neutral-fg-disabled hover:text-danger transition-colors shrink-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {/* Edge label input */}
                          <input
                            value={edgeLabel}
                            onChange={(e) => {
                              const newLabels = [...(selectedStep.nextStepLabels ?? [])];
                              while (newLabels.length <= idx) newLabels.push("");
                              newLabels[idx] = e.target.value;
                              updateStep(selectedStep.id, { nextStepLabels: newLabels });
                            }}
                            className="mt-1.5 w-full rounded border border-stroke bg-neutral-bg3 px-2 py-1 text-[11px] text-neutral-fg2 outline-none focus:border-brand"
                            placeholder={t("workflow.edgeLabelPlaceholder", "Label da conexao (ex: Aprovado, Rejeitou)")}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-fg-disabled italic">
                    {t("workflow.noNextSteps", "Nenhum — selecione o no e clique + abaixo")}
                  </p>
                )}
              </div>

              {/* Connect to existing */}
              {wf.steps.filter((s) => s.id !== selectedStep.id && !selectedStep.nextSteps.includes(s.id)).length > 0 && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                    {t("workflow.connectTo", "Conectar a passo existente")}
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      updateStep(selectedStep.id, {
                        nextSteps: [...selectedStep.nextSteps, e.target.value],
                        nextStepLabels: [...(selectedStep.nextStepLabels ?? []), ""],
                      });
                    }}
                    className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[12px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  >
                    <option value="">{t("workflow.selectStep", "Selecionar passo...")}</option>
                    {wf.steps
                      .filter((s) => s.id !== selectedStep.id && !selectedStep.nextSteps.includes(s.id))
                      .map((s) => {
                        const a = agentMap.get(s.agentId);
                        const nt = getStepNodeType(s);
                        return (
                          <option key={s.id} value={s.id}>
                            {nt !== "agent" ? `[${nt}] ` : ""}{a?.name ?? s.label} — {s.label}
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Condition editor dialog */}
      {conditionNode && (
        <WorkflowConditionEditor
          node={conditionNode}
          onSave={(updates) => {
            updateStep(conditionNode.id, {
              label: updates.label ?? conditionNode.label,
              ...updates,
            } as Partial<WorkflowStep>);
          }}
          onClose={() => setConditionNode(null)}
        />
      )}
    </div>
  );
}
