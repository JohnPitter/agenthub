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
    maxThinkingTokens: 32000,
    description: "Senior architect — plans system architecture, designs data models, reviews PRs, makes high-level technical decisions. Thinking mode active.",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "Task", "WebSearch", "WebFetch"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#6366F1",
    avatar: "building",
  },
  {
    name: "Tech Lead",
    role: "tech_lead",
    model: "claude-opus-4-6",
    maxThinkingTokens: 32000,
    description: "Senior tech lead — coordinates development team, manages project flow, communicates with user via chat/WhatsApp/Telegram, assigns and reviews tasks. Thinking mode active.",
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
    maxThinkingTokens: 16000,
    description: "Senior frontend developer & UX designer — implements UI components, responsive design, animations, user experience flows. Thinking mode active.",
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
    maxThinkingTokens: 16000,
    description: "Senior backend developer & design systems specialist — implements API routes, database operations, integrations, design patterns. Thinking mode active.",
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
    maxThinkingTokens: 16000,
    description: "Senior QA engineer & automation specialist — writes unit/integration/e2e tests, validates features, runs test automation, reviews code quality. Thinking mode active.",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Write", "Edit"],
    permissionMode: "acceptEdits",
    level: "senior",
    color: "#10B981",
    avatar: "shield-check",
  },
];
