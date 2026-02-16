import { Settings, Power } from "lucide-react";
import { cn } from "../../lib/utils";
import { AgentAvatar } from "./agent-avatar";
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
      "group rounded-lg bg-neutral-bg1 p-5 shadow-2 border border-stroke transition-shadow hover:shadow-4",
      !agent.isActive && "opacity-60",
    )}>
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-4">
        <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="md" className="!h-12 !w-12 !text-[18px]" />
        <span className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
          agent.isActive ? "bg-success-light" : "bg-neutral-bg2",
        )}>
          <span className={cn(
            "h-2 w-2 rounded-full",
            agent.isActive ? "bg-success-dark" : "bg-neutral-fg-disabled",
          )} style={agent.isActive ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined} />
          <span className={cn(
            "text-[11px] font-semibold",
            agent.isActive ? "text-success-dark" : "text-neutral-fg-disabled",
          )}>
            {agent.isActive ? "Online" : "Offline"}
          </span>
        </span>
      </div>

      {/* Info */}
      <h3 className="text-[16px] font-semibold text-neutral-fg1">{agent.name}</h3>
      <p className="mt-1 text-[13px] font-semibold text-neutral-fg2">{ROLE_LABELS[agent.role] ?? agent.role}</p>
      <p className="text-[11px] font-medium text-neutral-fg3 bg-neutral-bg2 px-2 py-1 rounded-md inline-block mt-1">
        {MODEL_LABELS[agent.model] ?? agent.model}
      </p>

      <p className="mt-3 text-[12px] text-neutral-fg3 leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Level badge */}
      <div className="mt-4 inline-flex items-center rounded-md bg-brand-light px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
          {agent.level}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => onToggle(agent.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-[13px] font-semibold transition-colors",
            agent.isActive
              ? "bg-success-light text-success-dark hover:bg-success-light/80"
              : "bg-neutral-bg2 text-neutral-fg3 hover:bg-neutral-bg-hover",
          )}
        >
          <Power className="h-4 w-4" />
          {agent.isActive ? "Ativo" : "Inativo"}
        </button>
        <button
          onClick={() => onConfigure(agent)}
          className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-[13px] font-semibold text-white"
        >
          <Settings className="h-4 w-4" />
          Config
        </button>
      </div>
    </div>
  );
}
