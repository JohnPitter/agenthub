import type { AgentRole, AgentModel, PermissionMode } from "../types/agent";

export interface AgentBlueprint {
  name: string;
  role: AgentRole;
  model: AgentModel;
  maxThinkingTokens: number | null;
  description: string;
  allowedTools: string[];
  permissionMode: PermissionMode;
  level: "senior" | "mid" | "junior";
  color: string;
  avatar: string;
}

export const DEFAULT_AGENTS: AgentBlueprint[] = [
  {
    name: "Architect",
    role: "architect",
    model: "claude-opus-4-6",
    maxThinkingTokens: 16000,
    description: "Plans architecture, designs systems, reviews PRs, makes high-level technical decisions",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "Task", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#6366F1",
    avatar: "building",
  },
  {
    name: "Tech Lead",
    role: "tech_lead",
    model: "claude-sonnet-4-5-20250929",
    maxThinkingTokens: null,
    description: "Coordinates team, assigns tasks, communicates with user, manages project flow",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "Task", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#00A82D",
    avatar: "user-cog",
  },
  {
    name: "Frontend Dev",
    role: "frontend_dev",
    model: "claude-sonnet-4-5-20250929",
    maxThinkingTokens: 10000,
    description: "Implements UI components, pages, styling, UX interactions, responsive design",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#EC4899",
    avatar: "palette",
  },
  {
    name: "Backend Dev",
    role: "backend_dev",
    model: "claude-sonnet-4-5-20250929",
    maxThinkingTokens: 10000,
    description: "Implements API routes, database operations, server logic, integrations",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#F59E0B",
    avatar: "server",
  },
  {
    name: "QA Engineer",
    role: "qa",
    model: "claude-sonnet-4-5-20250929",
    maxThinkingTokens: 10000,
    description: "Reviews code quality, writes tests, validates features, runs automation",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#10B981",
    avatar: "shield-check",
  },
];
