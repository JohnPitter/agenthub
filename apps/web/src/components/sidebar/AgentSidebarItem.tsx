import { cn } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import type { Agent } from "@agenthub/shared";

interface AgentSidebarItemProps {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentSidebarItem({ agent, isSelected, onClick }: AgentSidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200",
        isSelected
          ? "bg-white/5 text-white"
          : "text-white/60 hover:bg-white/[0.03] hover:text-white/80",
      )}
    >
      <AgentAvatar
        name={agent.name}
        avatar={agent.avatar}
        color={agent.color}
        size="sm"
        className="!h-7 !w-7 !text-[10px] !rounded-md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">
          {agent.name}
        </p>
        <p className="truncate text-[11px] text-white/30 leading-tight mt-0.5">
          {agent.role}
        </p>
      </div>
    </button>
  );
}
