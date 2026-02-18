import { create } from "zustand";
import { api } from "../lib/utils";

interface CostBreakdownEntry {
  agentId: string;
  agentName: string;
  model: string;
  cost: number;
  tasks: number;
}

interface ModelCost {
  cost: number;
  tasks: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  period: string;
  totalCostUsd: number;
  totalTokens: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  costBreakdown: CostBreakdownEntry[];
  modelCosts: Record<string, ModelCost>;
}

export interface AccountInfo {
  email: string | null;
  organization: string | null;
  subscriptionType: string | null;
  tokenSource: string | null;
  apiKeySource: string | null;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export interface ConnectionStatus {
  connected: boolean;
  email: string | null;
  subscriptionType: string | null;
  tokenSource: string | null;
  apiKeySource: string | null;
  error?: string;
}

export interface UsageLimitEntry {
  utilization: number;
  resetsAt: string | null;
}

export interface ExtraUsage {
  isEnabled: boolean;
  monthlyLimit: number;
  usedCredits: number;
  utilization: number;
}

export interface UsageLimits {
  fiveHour: UsageLimitEntry | null;
  sevenDay: UsageLimitEntry | null;
  sevenDaySonnet: UsageLimitEntry | null;
  extraUsage: ExtraUsage | null;
}

interface UsageState {
  summary: UsageSummary | null;
  account: AccountInfo | null;
  models: ModelInfo[];
  connection: ConnectionStatus | null;
  limits: UsageLimits | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  accountFetched: boolean;
  modelsFetched: boolean;
  connectionFetched: boolean;
  limitsFetched: boolean;
  limitsLastFetched: number | null;
  openaiConnection: { connected: boolean; source?: string; email?: string; masked?: string; planType?: string; subscriptionActiveUntil?: string } | null;
  openaiConnectionFetched: boolean;
  openaiUsage: Record<string, unknown> | null;
  openaiUsageFetched: boolean;
  openaiUsageLastFetched: number | null;
  fetchSummary: (period?: string) => Promise<void>;
  fetchAccount: () => Promise<void>;
  fetchModels: () => Promise<void>;
  fetchConnection: () => Promise<void>;
  fetchLimits: () => Promise<void>;
  fetchOpenAIConnection: () => Promise<void>;
  fetchOpenAIUsage: () => Promise<void>;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  summary: null,
  account: null,
  models: [],
  connection: null,
  limits: null,
  loading: false,
  error: null,
  lastFetched: null,
  accountFetched: false,
  modelsFetched: false,
  connectionFetched: false,
  limitsFetched: false,
  limitsLastFetched: null,
  openaiConnection: null,
  openaiConnectionFetched: false,
  openaiUsage: null,
  openaiUsageFetched: false,
  openaiUsageLastFetched: null,

  fetchSummary: async (period = "24h") => {
    const { lastFetched, loading } = get();
    if (loading) return;
    if (lastFetched && Date.now() - lastFetched < 30_000) return;

    set({ loading: true, error: null });
    try {
      const summary = await api<UsageSummary>(`/usage/summary?period=${period}`);
      set({ summary, loading: false, lastFetched: Date.now() });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Erro ao carregar uso", loading: false });
    }
  },

  fetchAccount: async () => {
    if (get().accountFetched) return;
    try {
      const account = await api<AccountInfo>("/usage/account");
      set({ account, accountFetched: true });
    } catch {
      // Silently fail — widget falls back to stored/default plan
      set({ accountFetched: true });
    }
  },

  fetchModels: async () => {
    if (get().modelsFetched) return;
    try {
      const { models } = await api<{ models: ModelInfo[] }>("/usage/models");
      set({ models, modelsFetched: true });
    } catch {
      // Silently fail — dialog falls back to hardcoded models
      set({ modelsFetched: true });
    }
  },

  fetchConnection: async () => {
    if (get().connectionFetched) return;
    try {
      const connection = await api<ConnectionStatus>("/usage/connection");
      set({ connection, connectionFetched: true });
    } catch {
      set({
        connection: { connected: false, email: null, subscriptionType: null, tokenSource: null, apiKeySource: null, error: "Falha ao verificar conexão" },
        connectionFetched: true,
      });
    }
  },

  fetchLimits: async () => {
    const { limitsLastFetched } = get();
    // Cache for 2 minutes on the client side too
    if (limitsLastFetched && Date.now() - limitsLastFetched < 120_000) return;
    try {
      const limits = await api<UsageLimits>("/usage/limits");
      set({ limits, limitsFetched: true, limitsLastFetched: Date.now() });
    } catch {
      set({ limitsFetched: true, limitsLastFetched: Date.now() });
    }
  },

  fetchOpenAIConnection: async () => {
    if (get().openaiConnectionFetched) return;
    try {
      // Check OAuth first
      const oauthData = await api<{ connected: boolean; source?: string; email?: string; planType?: string; subscriptionActiveUntil?: string }>("/openai/oauth/connection");
      if (oauthData.connected) {
        set({ openaiConnection: oauthData, openaiConnectionFetched: true });
        return;
      }
    } catch { /* fall through */ }
    try {
      // Fall back to API key / env
      const data = await api<{ connected: boolean; masked?: string; source?: string }>("/openai/status");
      set({ openaiConnection: data, openaiConnectionFetched: true });
    } catch {
      set({ openaiConnection: { connected: false }, openaiConnectionFetched: true });
    }
  },

  fetchOpenAIUsage: async () => {
    const { openaiUsageLastFetched } = get();
    // Cache for 2 minutes
    if (openaiUsageLastFetched && Date.now() - openaiUsageLastFetched < 120_000) return;
    try {
      const data = await api<Record<string, unknown>>("/openai/oauth/usage");
      set({ openaiUsage: data, openaiUsageFetched: true, openaiUsageLastFetched: Date.now() });
    } catch {
      set({ openaiUsageFetched: true, openaiUsageLastFetched: Date.now() });
    }
  },
}));
