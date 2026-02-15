import { useState } from "react";
import { useParams } from "react-router-dom";
import { Users, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useAgents } from "../hooks/use-agents";
import { AgentConfigDialog } from "../components/agents/agent-config-dialog";
import { AgentConfigPanel } from "../components/agents/agent-config-panel";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import type { Agent } from "@agenthub/shared";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

export function ProjectAgents() {
  const { id } = useParams<{ id: string }>();
  const { projects } = useWorkspaceStore();
  const project = projects.find((p) => p.id === id);
  const { agents, toggleAgent, updateAgent } = useAgents();

  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleSave = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  if (!project) {
    return <div className="p-6 text-neutral-fg2">Projeto não encontrado.</div>;
  }

  const activeCount = agents.filter((a) => a.isActive).length;
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {activeCount} de {agents.length} ativos
        </span>
      </CommandBar>

      {/* Master-Detail */}
      {agents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Agent list — col-span-4 */}
          <div className="w-80 shrink-0 border-r border-stroke bg-neutral-bg1 overflow-y-auto">
            <div className="divide-y divide-stroke">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                    selectedAgentId === agent.id
                      ? "bg-brand-light"
                      : "hover:bg-neutral-bg-hover",
                  )}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white"
                    style={{ backgroundColor: agent.color ?? "#0866FF" }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-neutral-fg1">{agent.name}</p>
                    <p className="text-[11px] text-neutral-fg3">{ROLE_LABELS[agent.role] ?? agent.role}</p>
                  </div>
                  <div
                    role="switch"
                    aria-checked={agent.isActive}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAgent(agent.id);
                    }}
                    className={cn(
                      "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                      agent.isActive ? "bg-success" : "bg-stroke",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                        agent.isActive ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel — col-span-8 */}
          <div className="flex-1 overflow-y-auto p-8">
            {selectedAgent ? (
              <AgentConfigPanel
                agent={selectedAgent}
                onOpenConfig={() => setConfigAgent(selectedAgent)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <Users className="h-10 w-10 text-neutral-fg-disabled" />
                <p className="text-[14px] font-medium text-neutral-fg3">Selecione um agente</p>
                <p className="text-[12px] text-neutral-fg-disabled">Clique em um agente à esquerda para ver detalhes</p>
              </div>
            )}
          </div>
        </div>
      )}

      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={handleSave}
          onClose={() => setConfigAgent(null)}
        />
      )}
    </div>
  );
}
