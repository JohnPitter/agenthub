import { create } from "zustand";
import type { Project, Agent } from "@agenthub/shared";

interface WorkspaceState {
  activeProjectId: string | null;
  activeTeamId: string | null;
  projects: Project[];
  agents: Agent[];
  chatPanelOpen: boolean;
  setActiveProject: (id: string | null) => void;
  setActiveTeamId: (id: string | null) => void;
  setProjects: (projects: Project[]) => void;
  setAgents: (agents: Agent[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  toggleChatPanel: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  activeTeamId: null,
  projects: [],
  agents: [],
  chatPanelOpen: false,
  setActiveProject: (id) => set({ activeProjectId: id }),
  setActiveTeamId: (id) => set({ activeTeamId: id }),
  setProjects: (projects) => set({ projects }),
  setAgents: (agents) => set({ agents }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    })),
  toggleChatPanel: () => set((state) => ({ chatPanelOpen: !state.chatPanelOpen })),
}));
