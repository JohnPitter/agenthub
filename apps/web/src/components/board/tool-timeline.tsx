import { Wrench, Hammer } from "lucide-react";
import type { Agent, AgentToolUseEvent } from "@agenthub/shared";

interface ToolTimelineProps {
  toolUses: AgentToolUseEvent[];
  agents: Agent[];
}

export function ToolTimeline({ toolUses, agents }: ToolTimelineProps) {
  return (
    <div className="flex w-[400px] flex-col rounded-lg bg-neutral-bg1 p-5 shadow-2">
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-brand" />
        <h3 className="text-[13px] font-semibold text-neutral-fg1">
          Ferramentas Utilizadas
        </h3>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {toolUses.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Hammer className="mb-2 h-8 w-8 text-neutral-fg-disabled" />
            <p className="text-[12px] text-neutral-fg3">
              Nenhuma ferramenta usada ainda
            </p>
          </div>
        ) : (
          toolUses.map((toolUse, idx) => {
            const agent = agents.find((a) => a.id === toolUse.agentId);
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-md bg-neutral-bg2/60 p-3 animate-fade-up"
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: agent?.color ?? "#0866FF" }}
                >
                  {agent?.name.charAt(0) ?? "A"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-neutral-fg1">
                    {toolUse.tool}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-neutral-fg3">
                    {typeof toolUse.input === "string"
                      ? toolUse.input
                      : JSON.stringify(toolUse.input)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
