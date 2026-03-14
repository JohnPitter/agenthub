import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import * as schema from "@agenthub/database/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestDb = any;

// SQL statements to create all tables (SQLite syntax for in-memory testing)
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    stack TEXT,
    icon TEXT,
    description TEXT,
    team_id TEXT,
    owner_id TEXT,
    github_url TEXT,
    github_owner TEXT,
    github_repo TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_accessed_at INTEGER,
    disk_size_mb TEXT DEFAULT '0',
    is_shallow_clone INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL,
    max_thinking_tokens INTEGER,
    system_prompt TEXT NOT NULL,
    description TEXT NOT NULL,
    allowed_tools TEXT,
    permission_mode TEXT NOT NULL DEFAULT 'acceptEdits',
    level TEXT NOT NULL DEFAULT 'senior',
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    avatar TEXT,
    soul TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_agent_id TEXT REFERENCES agents(id),
    parent_task_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    parsed_spec TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    priority TEXT NOT NULL DEFAULT 'medium',
    category TEXT,
    branch TEXT,
    session_id TEXT,
    result TEXT,
    cost_usd TEXT,
    tokens_used INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id),
    agent_id TEXT REFERENCES agents(id),
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    metadata TEXT,
    parent_message_id TEXT,
    is_thinking INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES agents(id),
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    detail TEXT,
    file_path TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_project_configs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    allowed_tools TEXT,
    additional_directories TEXT,
    additional_prompt TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    config TEXT,
    credentials TEXT,
    linked_agent_id TEXT,
    last_connected_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    nodes TEXT NOT NULL DEFAULT '[]',
    edges TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id)`,
  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom',
    instructions TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_skills (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_skills_project ON skills(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    github_id INTEGER NOT NULL UNIQUE,
    login TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    access_token TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    plan_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    max_projects INTEGER NOT NULL DEFAULT 5,
    max_tasks_per_month INTEGER NOT NULL DEFAULT 100,
    price_monthly TEXT NOT NULL DEFAULT '0',
    features TEXT DEFAULT '[]',
    max_storage_mb INTEGER NOT NULL DEFAULT 500,
    repo_ttl_days INTEGER NOT NULL DEFAULT 30,
    allowed_models TEXT DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS openrouter_config (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    enabled_models TEXT DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_invites (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    category TEXT,
    icon TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    importance INTEGER NOT NULL DEFAULT 5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id)`,
];

export interface TestContext {
  app: Express;
  db: TestDb;
  sqlite: Database.Database;
  cleanup: () => void;
}

/**
 * Creates an in-memory SQLite database with all tables for testing.
 */
export async function createTestDb(): Promise<{ db: ReturnType<typeof drizzle>; sqlite: InstanceType<typeof Database> }> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const testDb = drizzle(sqlite, { schema });

  for (const stmt of CREATE_STATEMENTS) {
    sqlite.exec(stmt);
  }

  return { db: testDb, sqlite };
}

/**
 * Creates an Express app wired to an in-memory test database.
 */
export function createTestApp(db: TestDb): Express {
  const app = express();
  app.use(express.json());
  return app;
}

/**
 * Helper to create a test project in the database.
 */
export async function createTestProject(db: TestDb, overrides?: Partial<typeof schema.projects.$inferInsert>) {
  const now = new Date();
  const merged = {
    id: nanoid(),
    name: "Test Project",
    path: `/tmp/test-project-${nanoid(8)}`,
    stack: JSON.stringify(["typescript"]),
    status: "active" as const,
    lastAccessedAt: now,
    diskSizeMb: "0",
    isShallowClone: true as boolean,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  // SQLite needs booleans as integers
  const project = {
    ...merged,
    isShallowClone: merged.isShallowClone ? 1 : 0,
  };

  await db.insert(schema.projects).values(project);
  return project;
}

/**
 * Helper to create a test agent in the database.
 */
export async function createTestAgent(db: TestDb, overrides?: Partial<typeof schema.agents.$inferInsert>) {
  const merged = {
    id: nanoid(),
    name: "Test Agent",
    role: "developer",
    model: "claude-sonnet-4-5-20250929",
    systemPrompt: "You are a test agent.",
    description: "A test agent for testing.",
    allowedTools: JSON.stringify(["Read", "Write"]),
    permissionMode: "acceptEdits" as const,
    level: "senior" as const,
    isDefault: false,
    isActive: true,
    color: "#6B7280",
    avatar: "bot",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  // SQLite needs booleans as integers
  const agent = {
    ...merged,
    isDefault: merged.isDefault ? 1 : 0,
    isActive: merged.isActive ? 1 : 0,
  };

  await db.insert(schema.agents).values(agent);
  return agent;
}

/**
 * Helper to create a test task in the database.
 */
export async function createTestTask(
  db: TestDb,
  projectId: string,
  overrides?: Partial<typeof schema.tasks.$inferInsert>,
) {
  const task = {
    id: nanoid(),
    projectId,
    title: "Test Task",
    description: "A test task for testing.",
    status: "created" as const,
    priority: "medium" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  await db.insert(schema.tasks).values(task);
  return task;
}

/**
 * Helper to create a test workflow in the database.
 */
export async function createTestWorkflow(
  db: TestDb,
  projectId: string,
  overrides?: Partial<typeof schema.workflows.$inferInsert>,
) {
  const mergedWorkflow = {
    id: nanoid(),
    projectId,
    name: "Test Workflow",
    description: "A test workflow.",
    nodes: JSON.stringify([]),
    edges: JSON.stringify([]),
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  // SQLite needs booleans as integers
  const workflow = {
    ...mergedWorkflow,
    isDefault: mergedWorkflow.isDefault ? 1 : 0,
  };

  await db.insert(schema.workflows).values(workflow);
  return workflow;
}

/**
 * Helper to create a test task log in the database.
 */
export async function createTestTaskLog(
  db: TestDb,
  taskId: string,
  overrides?: Partial<typeof schema.taskLogs.$inferInsert>,
) {
  const log = {
    id: nanoid(),
    taskId,
    action: "status_change",
    fromStatus: "created",
    toStatus: "in_progress",
    detail: "Test log entry",
    createdAt: new Date(),
    ...overrides,
  };

  await db.insert(schema.taskLogs).values(log);
  return log;
}

/**
 * Helper to create a test skill in the database.
 */
export async function createTestSkill(
  db: TestDb,
  projectId?: string,
  overrides?: Partial<typeof schema.skills.$inferInsert>,
) {
  const mergedSkill = {
    id: nanoid(),
    projectId: projectId ?? null,
    name: "Test Skill",
    description: "A test skill for testing.",
    category: "custom",
    instructions: "Follow these test instructions.",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  // SQLite needs booleans as integers
  const skill = {
    ...mergedSkill,
    isActive: mergedSkill.isActive ? 1 : 0,
  };

  await db.insert(schema.skills).values(skill);
  return skill;
}

/**
 * Helper to create a test agent-skill assignment in the database.
 */
export async function createTestAgentSkill(
  db: TestDb,
  agentId: string,
  skillId: string,
  overrides?: Partial<typeof schema.agentSkills.$inferInsert>,
) {
  const agentSkill = {
    id: nanoid(),
    agentId,
    skillId,
    createdAt: new Date(),
    ...overrides,
  };

  await db.insert(schema.agentSkills).values(agentSkill);
  return agentSkill;
}

/**
 * Helper to clean all tables in the test database.
 */
export async function cleanTestDb(sqlite: Database.Database) {
  const tables = [
    "agent_memories", "agent_skills", "skills", "task_logs", "messages",
    "tasks", "workflows", "agent_project_configs", "integrations", "docs",
    "notifications", "team_invites", "team_members", "teams", "agents",
    "openrouter_config", "plans", "users", "projects",
  ];
  for (const table of tables) {
    sqlite.prepare(`DELETE FROM ${table}`).run();
  }
}
