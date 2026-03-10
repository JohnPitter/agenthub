import { create } from "zustand";
import { api } from "../lib/utils";

export interface CostBreakdownEntry {
  agentId: string;
  agentName: string;
  model: string;
  cost: number;
  tasks: number;
}

export interface CostByAgentEntry {
  agentId: string;
  agentName: string;
  agentColor: string | null;
  totalCost: number;
  totalTokens: number;
  taskCount: number;
}

export interface CostByModelEntry {
  model: string;
  totalCost: number;
  totalTokens: number;
  taskCount: number;
}

export interface CostTrendEntry {
  date: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  taskCount: number;
}

export interface UsageSummary {
  period: string;
  totalCostUsd: number;
  totalTokens: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  costBreakdown: CostBreakdownEntry[];
  modelCosts: Record<string, { cost: number; tasks: number; inputTokens: number; outputTokens: number }>;
}

interface UsageState {
  summary: UsageSummary | null;
  loading: boolean;
  lastFetched: number | null;
  costByAgent: CostByAgentEntry[];
  costByModel: CostByModelEntry[];
  costTrend: CostTrendEntry[];
  analyticsLoading: boolean;
  analyticsPeriod: string;
  fetchSummary: (period?: string) => Promise<void>;
  fetchCostByAgent: (period?: string) => Promise<void>;
  fetchCostByModel: (period?: string) => Promise<void>;
  fetchCostTrend: (period?: string) => Promise<void>;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  summary: null,
  loading: false,
  lastFetched: null,
  costByAgent: [],
  costByModel: [],
  costTrend: [],
  analyticsLoading: false,
  analyticsPeriod: "30d",

  fetchSummary: async (period = "24h") => {
    const { lastFetched, loading } = get();
    if (loading) return;
    if (lastFetched && Date.now() - lastFetched < 30_000) return;
    set({ loading: true });
    try {
      const summary = await api<UsageSummary>(`/analytics/summary?period=${period}`);
      set({ summary, loading: false, lastFetched: Date.now() });
    } catch {
      set({ loading: false });
    }
  },

  fetchCostByAgent: async (period = "30d") => {
    set({ analyticsLoading: true });
    try {
      const data = await api<CostByAgentEntry[]>(`/analytics/costs?period=${period}&groupBy=agent`);
      set({ costByAgent: data, analyticsLoading: false, analyticsPeriod: period });
    } catch {
      set({ costByAgent: [], analyticsLoading: false });
    }
  },

  fetchCostByModel: async (period = "30d") => {
    try {
      const data = await api<CostByModelEntry[]>(`/analytics/costs?period=${period}&groupBy=model`);
      set({ costByModel: data });
    } catch {
      set({ costByModel: [] });
    }
  },

  fetchCostTrend: async (period = "30d") => {
    try {
      const data = await api<CostTrendEntry[]>(`/analytics/costs?period=${period}&groupBy=day`);
      set({ costTrend: data });
    } catch {
      set({ costTrend: [] });
    }
  },
}));
