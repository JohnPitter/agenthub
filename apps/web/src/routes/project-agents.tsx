import { useState } from "react";
import { useParams } from "react-router-dom";
import { Users, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useAgents } from "../hooks/use-agents";
import { AgentCard } from "../components/agents/agent-card";
import { AgentConfigDialog } from "../components/agents/agent-config-dialog";
import type { Agent } from "@agenthub/shared";

export function ProjectAgents() {
  const { id } = useParams<{ id: string }>();
  const { projects } = useWorkspaceStore();
  const project = projects.find((p) => p.id === id);
  const { agents, toggleAgent, updateAgent } = useAgents();

  const [configAgent, setConfigAgent] = useState<Agent | null>(null);

  const handleSave = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  if (!project) {
    return <div className="p-10 text-text-secondary">Projeto não encontrado.</div>;
  }

  const activeCount = agents.filter((a) => a.isActive).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-light px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Agentes</h1>
            <p className="text-[12px] text-text-tertiary">
              {activeCount} de {agents.length} agentes ativos
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-green-light px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-green" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
          <span className="text-[12px] font-semibold text-green">{activeCount} online</span>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {agents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="stagger grid grid-cols-3 gap-6">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onToggle={toggleAgent}
                onConfigure={setConfigAgent}
              />
            ))}
          </div>
        )}
      </div>

      {/* Config Dialog */}
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
