import { client } from "./connection";

const statements = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    stack TEXT,
    icon TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
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
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    github_id INTEGER NOT NULL UNIQUE,
    login TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    access_token TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id)`,
  `CREATE TABLE IF NOT EXISTS agent_memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    importance INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(agent_id, project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id)`,
  `CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    category TEXT,
    icon TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_docs_category ON docs(category)`,
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
  `CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id)`,
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
  `CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)`,
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_invites (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    accepted_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token)`,
  `CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id)`,
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
];

// Columns added after initial table creation — safe to re-run
const alterStatements = [
  `ALTER TABLE integrations ADD COLUMN project_id TEXT`,
  `ALTER TABLE integrations ADD COLUMN credentials TEXT`,
  `ALTER TABLE agents ADD COLUMN soul TEXT`,
  `ALTER TABLE docs ADD COLUMN parent_id TEXT`,
  `ALTER TABLE docs ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE projects ADD COLUMN team_id TEXT`,
];

async function migrate() {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");

  for (const stmt of statements) {
    await client.execute(stmt);
  }

  // Apply safe column additions (ignore "duplicate column" errors)
  for (const stmt of alterStatements) {
    try {
      await client.execute(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("duplicate column")) throw err;
    }
  }

  // Indexes that depend on columns added by alterStatements
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_docs_parent ON docs(parent_id)`);

  console.log("Migration completed successfully.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
