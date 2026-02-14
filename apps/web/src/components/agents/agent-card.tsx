import { Settings, Power } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Agent } from "@agenthub/shared";

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

interface AgentCardProps {
  agent: Agent;
  onToggle: (agentId: string) => void;
  onConfigure: (agent: Agent) => void;
}

export function AgentCard({ agent, onToggle, onConfigure }: AgentCardProps) {
  return (
    <div className={cn(
      "group rounded-xl bg-white p-6 shadow-card transition-all hover:shadow-card-hover",
      !agent.isActive && "opacity-60",
    )}>
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-[18px] font-bold text-white"
          style={{ backgroundColor: agent.color ?? "#0866FF" }}
        >
          {agent.name.charAt(0)}
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5",
          agent.isActive ? "bg-green-light" : "bg-page",
        )}>
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            agent.isActive ? "bg-green" : "bg-text-placeholder",
          )} style={agent.isActive ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined} />
          <span className={cn(
            "text-[10px] font-semibold",
            agent.isActive ? "text-green" : "text-text-placeholder",
          )}>
            {agent.isActive ? "Online" : "Offline"}
          </span>
        </span>
      </div>

      {/* Info */}
      <h3 className="text-[14px] font-semibold text-text-primary">{agent.name}</h3>
      <p className="mt-0.5 text-[12px] text-text-secondary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
      <p className="text-[11px] text-text-tertiary">{MODEL_LABELS[agent.model] ?? agent.model}</p>

      <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Level badge */}
      <div className="mt-3 inline-flex items-center rounded-md bg-page px-2 py-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
          {agent.level}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onToggle(agent.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-colors",
            agent.isActive
              ? "bg-green-light text-green hover:bg-green-muted"
              : "bg-page text-text-tertiary hover:bg-sidebar-hover",
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {agent.isActive ? "Ativo" : "Inativo"}
        </button>
        <button
          onClick={() => onConfigure(agent)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-light py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary-muted"
        >
          <Settings className="h-3.5 w-3.5" />
          Configurar
        </button>
      </div>
    </div>
  );
}
