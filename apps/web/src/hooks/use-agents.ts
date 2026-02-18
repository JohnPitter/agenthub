import { useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { api } from "../lib/utils";
import type { Agent } from "@agenthub/shared";

export function useAgents() {
  const agents = useWorkspaceStore((s) => s.agents);
  const setAgents = useWorkspaceStore((s) => s.setAgents);

  const fetchAgents = useCallback(async () => {
    try {
      const { agents } = await api<{ agents: Agent[] }>("/agents");
      setAgents(agents);
    } catch {
      // silently fail
    }
  }, [setAgents]);

  useEffect(() => {
    if (agents.length === 0) fetchAgents();
  }, [agents.length, fetchAgents]);

  const updateAgent = useCallback(async (agentId: string, updates: Partial<Agent>) => {
    const { agent } = await api<{ agent: Agent }>(`/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setAgents(useWorkspaceStore.getState().agents.map((a) => (a.id === agentId ? agent : a)));
    return agent;
  }, [setAgents]);

  const toggleAgent = useCallback(async (agentId: string) => {
    const current = useWorkspaceStore.getState().agents.find((a) => a.id === agentId);
    if (!current) return;
    return updateAgent(agentId, { isActive: !current.isActive });
  }, [updateAgent]);

  const createAgent = useCallback(async (data: Partial<Agent>) => {
    const { agent } = await api<{ agent: Agent }>("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setAgents([...useWorkspaceStore.getState().agents, agent]);
    return agent;
  }, [setAgents]);

  const deleteAgent = useCallback(async (agentId: string) => {
    await api(`/agents/${agentId}`, { method: "DELETE" });
    setAgents(useWorkspaceStore.getState().agents.filter((a) => a.id !== agentId));
  }, [setAgents]);

  return {
    agents,
    fetchAgents,
    updateAgent,
    toggleAgent,
    createAgent,
    deleteAgent,
  };
}
