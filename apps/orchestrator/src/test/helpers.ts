import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import { schema } from "@agenthub/database";

// SQL statements to create all tables (from migrate.ts, updated with latest schema)
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    stack TEXT,
    icon TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    team_id TEXT,
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
];

export interface TestContext {
  app: Express;
  db: LibSQLDatabase<typeof schema>;
  client: Client;
  cleanup: () => void;
}

/**
 * Creates an in-memory SQLite database with all tables for testing.
 */
export async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });

  await client.execute("PRAGMA foreign_keys = ON");

  for (const stmt of CREATE_STATEMENTS) {
    await client.execute(stmt);
  }

  return { db, client };
}

/**
 * Creates an Express app wired to an in-memory test database.
 * Uses vi.mock to intercept the @agenthub/database import.
 */
export function createTestApp(db: LibSQLDatabase<typeof schema>): Express {
  const app = express();
  app.use(express.json());

  // We need to import routes dynamically after mocking the database
  // This is handled in each test file via vi.mock
  return app;
}

/**
 * Helper to create a test project in the database.
 */
export async function createTestProject(db: LibSQLDatabase<typeof schema>, overrides?: Partial<typeof schema.projects.$inferInsert>) {
  const project = {
    id: nanoid(),
    name: "Test Project",
    path: `/tmp/test-project-${nanoid(8)}`,
    stack: JSON.stringify(["typescript"]),
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  await db.insert(schema.projects).values(project);
  return project;
}

/**
 * Helper to create a test agent in the database.
 */
export async function createTestAgent(db: LibSQLDatabase<typeof schema>, overrides?: Partial<typeof schema.agents.$inferInsert>) {
  const agent = {
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

  await db.insert(schema.agents).values(agent);
  return agent;
}

/**
 * Helper to create a test task in the database.
 */
export async function createTestTask(
  db: LibSQLDatabase<typeof schema>,
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
  db: LibSQLDatabase<typeof schema>,
  projectId: string,
  overrides?: Partial<typeof schema.workflows.$inferInsert>,
) {
  const workflow = {
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

  await db.insert(schema.workflows).values(workflow);
  return workflow;
}

/**
 * Helper to create a test task log in the database.
 */
export async function createTestTaskLog(
  db: LibSQLDatabase<typeof schema>,
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
 * Helper to clean all tables in the test database.
 */
export async function cleanTestDb(client: Client) {
  await client.execute("DELETE FROM task_logs");
  await client.execute("DELETE FROM messages");
  await client.execute("DELETE FROM tasks");
  await client.execute("DELETE FROM workflows");
  await client.execute("DELETE FROM agent_project_configs");
  await client.execute("DELETE FROM integrations");
  await client.execute("DELETE FROM agents");
  await client.execute("DELETE FROM projects");
}
