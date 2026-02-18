import type { AgentRole, AgentModel, PermissionMode } from "../types/agent";

export interface AgentBlueprint {
  name: string;
  role: AgentRole;
  model: AgentModel;
  maxThinkingTokens: number | null;
  description: string;
  allowedTools: string[];
  permissionMode: PermissionMode;
  level: "junior" | "pleno" | "senior" | "especialista" | "arquiteto";
  color: string;
  avatar: string;
  soul?: string;
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
    avatar: "adventurer:gandalf-wizard",
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
    avatar: "pixel-art:captain-america",
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
    avatar: "pixel-art:peter-parker-spider",
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
    avatar: "pixel-art:tony-stark-ironman",
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
    avatar: "bottts:darth-vader",
  },
  {
    name: "Doc Writer",
    role: "doc_writer",
    model: "claude-sonnet-4-5-20250514",
    maxThinkingTokens: null,
    description: "Documentation specialist — generates API docs from route files via static analysis, produces task change summaries, maintains project documentation.",
    allowedTools: ["Read", "Glob", "Grep"],
    permissionMode: "default",
    level: "pleno",
    color: "#8B5CF6",
    avatar: "bottts:doc-writer",
  },
  {
    name: "Team Lead",
    role: "receptionist" as const,
    model: "claude-haiku-4-5-20251001",
    maxThinkingTokens: null,
    description: "Scrum Master do time. Gerencia tarefas, coordena agentes e interage com usuários via WhatsApp e mensagens externas.",
    allowedTools: [],
    permissionMode: "default",
    level: "pleno",
    color: "#EC4899",
    avatar: "fun-emoji:agent-x-spy",
  },
];
