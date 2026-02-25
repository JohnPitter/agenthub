import { cn } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import type { Agent } from "@agenthub/shared";

interface OfficeAgentProps {
  agent: Agent;
  isWorking: boolean;
  isWalking?: boolean;
  currentTask?: string;
}

export function OfficeAgent({ agent, isWorking, isWalking, currentTask }: OfficeAgentProps) {
  return (
    <div className="relative flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      {/* Floating name label — Gather Town style */}
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 mb-0.5"
        style={{ background: "rgba(0,0,0,0.78)", borderRadius: 2 }}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            isWorking ? "bg-green-400 animate-pulse" : "bg-red-400",
          )}
        />
        <span className="text-[8px] font-bold text-white leading-none whitespace-nowrap">
          {agent.name.split(" ")[0]}
        </span>
      </div>

      {/* Character sprite */}
      <div className={cn("relative", isWalking ? "animate-pixel-walk" : isWorking && "animate-bounce-slow")}>
        {/* Head */}
        <div style={{ border: "2px solid rgba(0,0,0,0.35)", borderRadius: "50%" }}>
          <AgentAvatar
            name={agent.name}
            avatar={agent.avatar}
            color={agent.color}
            size="sm"
            className="!h-7 !w-7 !text-[9px]"
          />
        </div>
        {/* Body */}
        <div
          className="mx-auto"
          style={{
            width: 14,
            height: 8,
            background: agent.color || "#6366F1",
            borderRadius: "0 0 3px 3px",
            border: "1px solid rgba(0,0,0,0.25)",
            marginTop: -2,
          }}
        />
      </div>

      {/* Shadow on floor */}
      <div
        className="mt-0.5"
        style={{ width: 16, height: 4, borderRadius: "50%", background: "rgba(0,0,0,0.18)" }}
      />

      {/* Activity bubble */}
      {isWorking && currentTask && (
        <div
          className="absolute -top-1 left-full ml-1 flex items-center gap-0.5 px-1 py-0.5"
          style={{ background: "rgba(0,0,0,0.72)", borderRadius: 2, whiteSpace: "nowrap" }}
        >
          <span className="text-[6px]">💬</span>
          <span className="text-[7px] text-white font-medium max-w-[60px] truncate">{currentTask}</span>
        </div>
      )}
    </div>
  );
}
