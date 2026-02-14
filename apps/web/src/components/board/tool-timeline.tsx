import { Wrench, Hammer } from "lucide-react";
import type { Agent, AgentToolUseEvent } from "@agenthub/shared";

interface ToolTimelineProps {
  toolUses: AgentToolUseEvent[];
  agents: Agent[];
}

export function ToolTimeline({ toolUses, agents }: ToolTimelineProps) {
  return (
    <div className="flex w-[400px] flex-col rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h3 className="text-[14px] font-semibold text-text-primary">
          Ferramentas Utilizadas
        </h3>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {toolUses.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Hammer className="mb-2 h-8 w-8 text-text-placeholder" />
            <p className="text-[12px] text-text-tertiary">
              Nenhuma ferramenta usada ainda
            </p>
          </div>
        ) : (
          toolUses.map((toolUse, idx) => {
            const agent = agents.find((a) => a.id === toolUse.agentId);
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-lg border border-edge p-3 animate-fade-up"
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: agent?.color ?? "#FF5C35" }}
                >
                  {agent?.name.charAt(0) ?? "A"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-text-primary">
                    {toolUse.tool}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-text-tertiary">
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
