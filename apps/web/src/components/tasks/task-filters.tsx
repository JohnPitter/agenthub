import { cn } from "../../lib/utils";
import type { Agent, TaskPriority } from "@agenthub/shared";

interface TaskFiltersProps {
  priorityFilter: TaskPriority | "";
  agentFilter: string;
  agents: Agent[];
  onPriorityChange: (value: TaskPriority | "") => void;
  onAgentChange: (value: string) => void;
}

const PRIORITIES: { value: TaskPriority | ""; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];

export function TaskFilters({ priorityFilter, agentFilter, agents, onPriorityChange, onAgentChange }: TaskFiltersProps) {
  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="flex items-center gap-3">
      {/* Priority pills */}
      <div className="flex items-center gap-1.5 rounded-xl bg-page p-1">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            onClick={() => onPriorityChange(p.value as TaskPriority | "")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
              priorityFilter === p.value
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Agent filter */}
      <select
        value={agentFilter}
        onChange={(e) => onAgentChange(e.target.value)}
        className="rounded-xl border border-edge bg-white px-3 py-1.5 text-[12px] font-medium text-text-primary outline-none transition-all focus:border-primary"
      >
        <option value="">Todos os agentes</option>
        {activeAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
    </div>
  );
}
