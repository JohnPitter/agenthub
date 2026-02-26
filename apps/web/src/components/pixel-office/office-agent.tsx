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
  const primaryColor = agent.color || "#3B82F6";

  return (
    <div className="relative flex flex-col items-center shrink-0 z-40 transition-transform" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Floating Name Plate */}
      <div
        className="absolute -top-7 flex items-center gap-1 px-1.5 py-1 z-50 transition-opacity"
        style={{ background: "#1F2937", border: "2px solid #030712", borderRadius: 2, pointerEvents: "none" }}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 border border-black",
            isWorking ? "bg-green-400" : "bg-red-400",
          )}
        />
        <span className="text-[9px] font-bold text-white leading-none whitespace-nowrap" style={{ textShadow: "1px 1px 0 #000" }}>
          {agent.name.split(" ")[0]}
        </span>
      </div>

      {/* Character Wrapper */}
      <div
        className={cn("relative flex flex-col items-center", isWalking ? "animate-bounce" : isWorking && "animate-pulse")}
        style={{ animationDuration: isWalking ? "200ms" : "2s" }}
      >
        {/* Head */}
        <div className="relative z-20" style={{ border: "2px solid #030712", borderRadius: "4px", background: "#FFF" }}>
          <AgentAvatar
            name={agent.name}
            avatar={agent.avatar}
            color={agent.color}
            size="sm"
            className="!h-6 !w-6 !text-[8px] !rounded-sm"
          />
        </div>

        {/* Torso/Body */}
        <div className="relative z-10 flex flex-col items-center" style={{ marginTop: -2 }}>
          {/* Shoulders / Chest */}
          <div style={{ width: 14, height: 10, background: primaryColor, border: "2px solid #030712", borderRadius: 1, boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.2), inset 2px 2px 0 rgba(255,255,255,0.2)" }}>
            {/* Belt */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#1F2937", borderTop: "1px solid #111827" }} />
          </div>

          {/* Arms (left / right) */}
          <div style={{ position: "absolute", top: 2, left: -4, width: 4, height: 8, background: primaryColor, border: "2px solid #030712", borderRight: "none", borderRadius: "2px 0 0 2px" }} />
          <div style={{ position: "absolute", top: 2, right: -4, width: 4, height: 8, background: primaryColor, border: "2px solid #030712", borderLeft: "none", borderRadius: "0 2px 2px 0" }} />

          {/* Legs */}
          <div className="flex justify-between" style={{ width: 10, marginTop: -2 }}>
            <div className={cn("w-3 h-4 bg-gray-800 border-2 border-black border-t-0")} />
            <div className={cn("w-3 h-4 bg-gray-800 border-2 border-black border-t-0")} />
          </div>
        </div>
      </div>

      {/* Activity Bubble */}
      {isWorking && currentTask && (
        <div
          className="absolute -top-2 left-full ml-1 px-2 py-1 z-50 animate-pulse"
          style={{ background: "#FFFFFF", border: "2px solid #030712", borderRadius: "8px 8px 8px 0", pointerEvents: "none" }}
        >
          <span className="text-[8px] text-gray-900 font-bold whitespace-nowrap max-w-[80px] block truncate">
            {currentTask}
          </span>
          <div className="absolute -bottom-1.5 left-0 w-2 h-2 bg-white border-b-2 border-l-2 border-black" style={{ transform: "rotate(-45deg)" }} />
        </div>
      )}
    </div>
  );
}
