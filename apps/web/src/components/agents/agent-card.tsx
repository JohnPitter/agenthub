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
      "group relative overflow-hidden rounded-2xl bg-white p-6 shadow-card card-hover",
      !agent.isActive && "opacity-60",
    )}>
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.02] gradient-primary transition-opacity duration-300" />

      {/* Status indicator */}
      <div className="relative flex items-center justify-between mb-5">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-[20px] font-bold text-white shadow-md transition-all group-hover:shadow-lg group-hover:scale-105"
          style={{ backgroundColor: agent.color ?? "#6366F1" }}
        >
          {agent.name.charAt(0)}
        </div>
        <span className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm",
          agent.isActive ? "bg-gradient-to-r from-green-light to-green-muted" : "bg-page",
        )}>
          <span className={cn(
            "h-2 w-2 rounded-full",
            agent.isActive ? "bg-green-dark" : "bg-text-placeholder",
          )} style={agent.isActive ? { animation: "pulse-dot 2s ease-in-out infinite" } : undefined} />
          <span className={cn(
            "text-[11px] font-bold",
            agent.isActive ? "text-green-dark" : "text-text-placeholder",
          )}>
            {agent.isActive ? "Online" : "Offline"}
          </span>
        </span>
      </div>

      {/* Info */}
      <h3 className="relative text-[16px] font-bold text-text-primary">{agent.name}</h3>
      <p className="relative mt-1 text-[13px] font-semibold text-text-secondary">{ROLE_LABELS[agent.role] ?? agent.role}</p>
      <p className="relative text-[11px] font-medium text-text-tertiary bg-page px-2 py-1 rounded-lg inline-block mt-1">
        {MODEL_LABELS[agent.model] ?? agent.model}
      </p>

      <p className="relative mt-3 text-[12px] text-text-tertiary leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Level badge */}
      <div className="relative mt-4 inline-flex items-center rounded-xl bg-gradient-to-r from-primary-light to-purple-light px-3 py-1.5 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-dark">
          {agent.level}
        </span>
      </div>

      {/* Actions */}
      <div className="relative mt-5 flex items-center gap-3">
        <button
          onClick={() => onToggle(agent.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold shadow-sm transition-all duration-300 hover:shadow-md hover:scale-105",
            agent.isActive
              ? "bg-gradient-to-r from-green-light to-green-muted text-green-dark"
              : "bg-page text-text-tertiary hover:bg-surface-hover",
          )}
        >
          <Power className="h-4 w-4" />
          {agent.isActive ? "Ativo" : "Inativo"}
        </button>
        <button
          onClick={() => onConfigure(agent)}
          className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white shadow-md transition-all duration-300 hover:scale-105"
        >
          <Settings className="h-4 w-4" />
          Config
        </button>
      </div>
    </div>
  );
}
