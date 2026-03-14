import { create } from "zustand";
import { api } from "../lib/utils";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  maxProjects: number;
  maxTasksPerMonth: number;
  priceMonthly: string;
  features: string[];
  isDefault: boolean;
  maxStorageMb: number;
  repoTtlDays: number;
  allowedModels: string[];
  createdAt: string;
  updatedAt: string;
}

interface AdminUser {
  id: string;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  planId: string | null;
  planName: string | null;
  projectCount: number;
  taskCountThisMonth: number;
  createdAt: string;
}

interface EnabledModel {
  id: string;
  name: string;
  provider: string;
}

interface OpenRouterConfigResponse {
  id: string;
  apiKeyMasked: string;
  enabledModels: EnabledModel[];
  updatedAt: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  architecture: { modality: string };
}

interface DashboardMetrics {
  totalUsers: number;
  totalProjects: number;
  tasksThisMonth: number;
  costThisMonth: number;
  tasksTrend: { date: string; count: number; cost: number }[];
  topUsersByUsage: { userId: string; name: string; taskCount: number; cost: number }[];
  topModelsByUsage: { model: string; taskCount: number; cost: number }[];
}

interface AdminState {
  // Plans
  plans: Plan[];
  plansLoading: boolean;
  fetchPlans: () => Promise<void>;
  createPlan: (data: Omit<Plan, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updatePlan: (id: string, data: Partial<Plan>) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;

  // Users
  users: AdminUser[];
  usersLoading: boolean;
  fetchUsers: () => Promise<void>;
  updateUserPlan: (userId: string, planId: string | null) => Promise<void>;
  updateUserRole: (userId: string, role: "user" | "admin") => Promise<void>;

  // OpenRouter
  openrouterConfig: OpenRouterConfigResponse | null;
  availableModels: OpenRouterModel[];
  modelsLoading: boolean;
  configLoading: boolean;
  fetchConfig: () => Promise<void>;
  saveConfig: (apiKey: string, enabledModels: EnabledModel[]) => Promise<void>;
  fetchAvailableModels: () => Promise<void>;
  testConnection: (apiKey?: string) => Promise<boolean>;

  // Dashboard
  dashboardMetrics: DashboardMetrics | null;
  dashboardLoading: boolean;
  fetchDashboardMetrics: () => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  // Plans
  plans: [],
  plansLoading: false,
  fetchPlans: async () => {
    set({ plansLoading: true });
    try {
      const { plans } = await api<{ plans: Plan[] }>("/admin/plans");
      set({ plans, plansLoading: false });
    } catch {
      set({ plansLoading: false });
    }
  },
  createPlan: async (data) => {
    await api("/admin/plans", { method: "POST", body: JSON.stringify(data) });
    await get().fetchPlans();
  },
  updatePlan: async (id, data) => {
    await api(`/admin/plans/${id}`, { method: "PUT", body: JSON.stringify(data) });
    await get().fetchPlans();
  },
  deletePlan: async (id) => {
    await api(`/admin/plans/${id}`, { method: "DELETE" });
    await get().fetchPlans();
  },

  // Users
  users: [],
  usersLoading: false,
  fetchUsers: async () => {
    set({ usersLoading: true });
    try {
      const { users } = await api<{ users: AdminUser[] }>("/admin/users");
      set({ users, usersLoading: false });
    } catch {
      set({ usersLoading: false });
    }
  },
  updateUserPlan: async (userId, planId) => {
    await api(`/admin/users/${userId}/plan`, { method: "PUT", body: JSON.stringify({ planId }) });
    await get().fetchUsers();
  },
  updateUserRole: async (userId, role) => {
    await api(`/admin/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
    await get().fetchUsers();
  },

  // OpenRouter
  openrouterConfig: null,
  availableModels: [],
  modelsLoading: false,
  configLoading: false,
  fetchConfig: async () => {
    set({ configLoading: true });
    try {
      const { config } = await api<{ config: OpenRouterConfigResponse | null }>("/admin/openrouter/config");
      set({ openrouterConfig: config, configLoading: false });
    } catch {
      set({ configLoading: false });
    }
  },
  saveConfig: async (apiKey, enabledModels) => {
    await api("/admin/openrouter/config", { method: "POST", body: JSON.stringify({ apiKey, enabledModels }) });
    await get().fetchConfig();
  },
  fetchAvailableModels: async () => {
    set({ modelsLoading: true });
    try {
      const { models } = await api<{ models: OpenRouterModel[] }>("/admin/openrouter/models");
      set({ availableModels: models, modelsLoading: false });
    } catch {
      set({ modelsLoading: false });
    }
  },
  testConnection: async (apiKey) => {
    try {
      const { success } = await api<{ success: boolean }>("/admin/openrouter/test", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      });
      return success;
    } catch {
      return false;
    }
  },

  // Dashboard
  dashboardMetrics: null,
  dashboardLoading: false,
  fetchDashboardMetrics: async () => {
    set({ dashboardLoading: true });
    try {
      const metrics = await api<DashboardMetrics>("/admin/dashboard");
      set({ dashboardMetrics: metrics, dashboardLoading: false });
    } catch {
      set({ dashboardLoading: false });
    }
  },
}));
