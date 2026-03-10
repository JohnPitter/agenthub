export interface Plan {
  id: string;
  name: string;
  description: string | null;
  maxProjects: number;
  maxTasksPerMonth: number;
  priceMonthly: string;
  features: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  maxProjects: number;
  maxTasksPerMonth: number;
  priceMonthly: string;
  features?: string[];
  isDefault?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  description?: string;
  maxProjects?: number;
  maxTasksPerMonth?: number;
  priceMonthly?: string;
  features?: string[];
  isDefault?: boolean;
}

export interface AdminUser {
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
  createdAt: Date;
}

export interface OpenRouterConfig {
  id: string;
  apiKeyMasked: string;
  enabledModels: EnabledModel[];
  updatedAt: Date;
}

export interface EnabledModel {
  id: string;
  name: string;
  provider: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  architecture: { modality: string };
}

export interface DashboardMetrics {
  totalUsers: number;
  totalProjects: number;
  tasksThisMonth: number;
  costThisMonth: number;
  tasksTrend: { date: string; count: number; cost: number }[];
  topUsersByUsage: { userId: string; name: string; taskCount: number; cost: number }[];
  topModelsByUsage: { model: string; taskCount: number; cost: number }[];
}

export type UserRole = "user" | "admin";
