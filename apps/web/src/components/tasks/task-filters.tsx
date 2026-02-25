import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { Agent, TaskPriority } from "@agenthub/shared";

interface TaskFiltersProps {
  priorityFilter: TaskPriority | "";
  agentFilter: string;
  agents: Agent[];
  onPriorityChange: (value: TaskPriority | "") => void;
  onAgentChange: (value: string) => void;
}

const PRIORITY_VALUES: (TaskPriority | "")[] = ["", "urgent", "high", "medium", "low"];

export function TaskFilters({ priorityFilter, agentFilter, agents, onPriorityChange, onAgentChange }: TaskFiltersProps) {
  const { t } = useTranslation();
  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="flex items-center gap-3">
      {/* Priority pills */}
      <div className="flex items-center gap-1.5 rounded-lg bg-neutral-bg2 p-1">
        {PRIORITY_VALUES.map((p) => (
          <button
            key={p}
            onClick={() => onPriorityChange(p as TaskPriority | "")}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
              priorityFilter === p
                ? "bg-neutral-bg1 text-neutral-fg1 shadow-sm"
                : "text-neutral-fg3 hover:text-neutral-fg2",
            )}
          >
            {p === "" ? t("common.all") : t(`taskPriority.${p}`)}
          </button>
        ))}
      </div>

      {/* Agent filter */}
      <select
        value={agentFilter}
        onChange={(e) => onAgentChange(e.target.value)}
        className="rounded-lg border border-stroke bg-neutral-bg1 px-3 py-1.5 text-[12px] font-medium text-neutral-fg1 outline-none transition-all focus:border-brand"
      >
        <option value="">{t("tasks.allAgents")}</option>
        {activeAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
    </div>
  );
}
