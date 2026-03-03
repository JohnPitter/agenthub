import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Settings, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useAgents } from "../../hooks/use-agents";
import { AgentConfigDialog } from "../agents/agent-config-dialog";
import { AgentSidebarItem } from "./AgentSidebarItem";
import type { Agent } from "@agenthub/shared";

interface AgentSidebarProps {
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

interface AgentGroup {
  label: string;
  dot: string;
  dotColor: string;
  agents: Agent[];
}

export function AgentSidebar({ selectedAgentId, onSelectAgent }: AgentSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { agents, createAgent, updateAgent } = useAgents();
  const [search, setSearch] = useState("");
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agents, search]);

  const groups: AgentGroup[] = useMemo(() => {
    const active: Agent[] = [];
    const idle: Agent[] = [];
    const stopped: Agent[] = [];

    for (const agent of filtered) {
      if (!agent.isActive) {
        stopped.push(agent);
      } else {
        // For now, all active agents go to "Active" group
        // Real-time status (running vs idle) will be enhanced later via socket events
        active.push(agent);
      }
    }

    const result: AgentGroup[] = [];
    if (active.length > 0) {
      result.push({ label: "Active", dot: "\u25CF", dotColor: "text-emerald-400", agents: active });
    }
    if (idle.length > 0) {
      result.push({ label: "Idle", dot: "\u25CB", dotColor: "text-white/30", agents: idle });
    }
    if (stopped.length > 0) {
      result.push({ label: "Stopped", dot: "\u25C6", dotColor: "text-white/20", agents: stopped });
    }
    return result;
  }, [filtered]);

  const handleAddAgent = async () => {
    const agent = await createAgent({
      name: t("agents.addAgent"),
      role: "custom",
      model: "claude-sonnet-4-5-20250929",
      description: t("agents.typeCustom"),
    });
    onSelectAgent(agent.id);
    setConfigAgent(agent);
  };

  const handleSaveAgent = async (agentId: string, updates: Partial<Agent>) => {
    await updateAgent(agentId, updates);
  };

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col bg-[#0d0d14] border-r border-white/5">
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="w-full rounded-lg bg-white/5 py-2 pl-8 pr-3 text-[12px] text-white/80 placeholder:text-white/20 outline-none focus:bg-white/[0.07] focus:ring-1 focus:ring-white/10 transition-all"
            />
          </div>
        </div>

        {/* Agent groups */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    collapsedGroups.has(group.label) && "-rotate-90",
                  )}
                />
                <span className={group.dotColor}>{group.dot}</span>
                <span>{group.label}</span>
                <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/30">
                  {group.agents.length}
                </span>
              </button>
              {!collapsedGroups.has(group.label) && (
                <div className="space-y-0.5 pl-1">
                  {group.agents.map((agent) => (
                    <AgentSidebarItem
                      key={agent.id}
                      agent={agent}
                      isSelected={agent.id === selectedAgentId}
                      onClick={() => onSelectAgent(agent.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {groups.length === 0 && search.trim() && (
            <p className="px-3 py-6 text-center text-[12px] text-white/25">
              No agents found
            </p>
          )}
        </div>

        {/* Bottom actions */}
        <div className="border-t border-white/5 p-3 flex items-center gap-2">
          <button
            onClick={handleAddAgent}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 py-2 text-[12px] font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/40 hover:bg-white/[0.08] hover:text-white/60 transition-all"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={handleSaveAgent}
          onClose={() => setConfigAgent(null)}
        />
      )}
    </>
  );
}
