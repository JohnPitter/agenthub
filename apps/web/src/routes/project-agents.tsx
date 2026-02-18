import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users, Loader2, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useAgents } from "../hooks/use-agents";
import { AgentConfigDialog } from "../components/agents/agent-config-dialog";
import { AgentConfigPanel } from "../components/agents/agent-config-panel";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import type { Agent } from "@agenthub/shared";

export function ProjectAgents() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const projects = useWorkspaceStore((s) => s.projects);
  const project = projects.find((p) => p.id === id);
  const { agents, toggleAgent, updateAgent, deleteAgent } = useAgents();

  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleSave = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  const handleDelete = async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent || agent.isDefault) return;
    if (!confirm(t("agents.deleteConfirm", { name: agent.name }))) return;
    await deleteAgent(agentId);
    if (selectedAgentId === agentId) setSelectedAgentId(null);
  };

  if (!project) {
    return <div className="p-6 text-neutral-fg2">{t("project.notFound")}</div>;
  }

  const projectAgents = agents.filter((a) => a.role !== "receptionist");
  const activeCount = projectAgents.filter((a) => a.isActive).length;
  const selectedAgent = projectAgents.find((a) => a.id === selectedAgentId);

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar>
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {activeCount} de {projectAgents.length} ativos
        </span>
      </CommandBar>

      {/* Master-Detail */}
      {projectAgents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Agent list */}
          <div className="w-80 shrink-0 border-r border-stroke bg-neutral-bg-subtle overflow-y-auto">
            <div className="p-3 space-y-1">
              {projectAgents.map((agent, i) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left transition-all duration-200 animate-fade-up",
                    `stagger-${Math.min(i + 1, 5)}`,
                    selectedAgentId === agent.id
                      ? "card-glow bg-neutral-bg3"
                      : "hover:bg-neutral-bg-hover",
                  )}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold text-white shadow-xs"
                    style={{ backgroundColor: agent.color ?? "#6366F1" }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-neutral-fg1">{agent.name}</p>
                    <p className="text-[11px] text-neutral-fg3">{t(`roles.${agent.role}`)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!agent.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(agent.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md text-neutral-fg-disabled hover:bg-danger-light hover:text-danger transition-all"
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div
                      role="switch"
                      aria-checked={agent.isActive}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAgent(agent.id);
                      }}
                      className={cn(
                        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-all duration-200",
                        agent.isActive
                          ? "bg-gradient-to-r from-brand to-purple shadow-brand"
                          : "bg-stroke",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                          agent.isActive && "left-[18px]",
                        )}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 overflow-y-auto p-10 glass-strong">
            {selectedAgent ? (
              <AgentConfigPanel
                agent={selectedAgent}
                onOpenConfig={() => setConfigAgent(selectedAgent)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-bg2 border border-stroke">
                  <Users className="h-8 w-8 text-neutral-fg-disabled" />
                </div>
                <p className="text-[14px] font-medium text-neutral-fg3">{t("agents.noAgentSelected")}</p>
                <p className="text-[12px] text-neutral-fg-disabled">{t("agents.selectOrCreate")}</p>
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
