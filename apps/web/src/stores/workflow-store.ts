import { create } from "zustand";
import { api } from "../lib/utils";
import type { Workflow } from "@agenthub/shared";

interface WorkflowState {
  workflows: Workflow[];
  activeWorkflow: Workflow | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastFetched: number | null;

  fetchWorkflows: (projectId: string) => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  saveWorkflow: (workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<Workflow | null>;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<Workflow | null>;
  deleteWorkflow: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  setActiveWorkflow: (workflow: Workflow | null) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  activeWorkflow: null,
  loading: false,
  saving: false,
  error: null,
  lastFetched: null,

  fetchWorkflows: async (projectId: string) => {
    const { loading } = get();
    if (loading) return;

    set({ loading: true, error: null });
    try {
      const { workflows } = await api<{ workflows: Workflow[] }>(`/workflows?projectId=${projectId}`);
      set({ workflows, loading: false, lastFetched: Date.now() });

      // Auto-select default workflow if none active
      if (!get().activeWorkflow && workflows.length > 0) {
        const defaultWf = workflows.find((w) => w.isDefault) ?? workflows[0];
        set({ activeWorkflow: defaultWf });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load workflows",
        loading: false,
      });
    }
  },

  fetchWorkflow: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const { workflow } = await api<{ workflow: Workflow }>(`/workflows/${id}`);
      set({ activeWorkflow: workflow, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load workflow",
        loading: false,
      });
    }
  },

  saveWorkflow: async (workflow) => {
    set({ saving: true, error: null });
    try {
      if (workflow.id) {
        // Update existing
        const { workflow: saved } = await api<{ workflow: Workflow }>(`/workflows/${workflow.id}`, {
          method: "PUT",
          body: JSON.stringify(workflow),
        });
        set((state) => ({
          workflows: state.workflows.map((w) => (w.id === saved.id ? saved : w)),
          activeWorkflow: saved,
          saving: false,
        }));
        return saved;
      } else {
        // Create new
        const { workflow: saved } = await api<{ workflow: Workflow }>("/workflows", {
          method: "POST",
          body: JSON.stringify(workflow),
        });
        set((state) => ({
          workflows: [...state.workflows, saved],
          activeWorkflow: saved,
          saving: false,
        }));
        return saved;
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to save workflow",
        saving: false,
      });
      return null;
    }
  },

  updateWorkflow: async (id, updates) => {
    set({ saving: true, error: null });
    try {
      const { workflow } = await api<{ workflow: Workflow }>(`/workflows/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === workflow.id ? workflow : w)),
        activeWorkflow: state.activeWorkflow?.id === id ? workflow : state.activeWorkflow,
        saving: false,
      }));
      return workflow;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to update workflow",
        saving: false,
      });
      return null;
    }
  },

  deleteWorkflow: async (id: string) => {
    try {
      await api(`/workflows/${id}`, { method: "DELETE" });
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        activeWorkflow: state.activeWorkflow?.id === id ? null : state.activeWorkflow,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to delete workflow",
      });
    }
  },

  setDefault: async (id: string) => {
    try {
      const { workflow } = await api<{ workflow: Workflow }>(`/workflows/${id}/set-default`, {
        method: "POST",
      });
      set((state) => ({
        workflows: state.workflows.map((w) => ({
          ...w,
          isDefault: w.id === id,
        })),
        activeWorkflow: state.activeWorkflow?.id === id ? workflow : state.activeWorkflow,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to set default workflow",
      });
    }
  },

  setActiveWorkflow: (workflow) => set({ activeWorkflow: workflow }),

  clearError: () => set({ error: null }),
}));
