import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  cleanTestDb,
} from "../test/helpers";
import * as schema from "@agenthub/database/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import crypto from "crypto";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

// ---------------------------------------------------------------------------
// Helper: create a test user
// ---------------------------------------------------------------------------
async function createTestUser(overrides?: Record<string, unknown>) {
  const user = {
    id: nanoid(),
    githubId: Math.floor(Math.random() * 999999),
    login: `user-${nanoid(6)}`,
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.users).values(user);
  return user;
}

// ---------------------------------------------------------------------------
// Setup: create express app with inlined routes that use testDb
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  // Recreate tables that differ between helpers CREATE and the actual Drizzle schema
  // Teams: helpers lacks 'slug' column
  testSqlite.exec("DROP TABLE IF EXISTS team_invites");
  testSqlite.exec("DROP TABLE IF EXISTS team_members");
  testSqlite.exec("DROP TABLE IF EXISTS teams");
  testSqlite.exec(`CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    description TEXT,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  testSqlite.exec(`CREATE TABLE team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT 0
  )`);
  testSqlite.exec(`CREATE TABLE team_invites (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    token TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER,
    accepted_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  // Notifications: helpers has user_id/is_read/message/metadata but schema has project_id/read/body/link
  testSqlite.exec("DROP TABLE IF EXISTS notifications");
  testSqlite.exec(`CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  // Agent memories: helpers lacks type/context columns
  testSqlite.exec("DROP INDEX IF EXISTS idx_agent_memories_agent");
  testSqlite.exec("DROP TABLE IF EXISTS agent_memories");
  testSqlite.exec(`CREATE TABLE agent_memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    type TEXT,
    content TEXT NOT NULL,
    context TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    importance INTEGER NOT NULL DEFAULT 5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER DEFAULT 0
  )`);
  testSqlite.exec("CREATE INDEX idx_agent_memories_agent ON agent_memories(agent_id)");

  app = express();
  app.use(express.json());

  // Auth middleware: inject req.user from x-user-id header
  const authMw: express.RequestHandler = (req, _res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (userId) {
      (req as express.Request & { user: { userId: string } }).user = { userId };
    }
    next();
  };
  app.use(authMw);

  // =========================================================================
  // AGENTS ROUTES — /api/agents
  // =========================================================================
  app.get("/api/agents", async (_req, res) => {
    try {
      const agents = await testDb.select().from(schema.agents);
      res.json({ agents });
    } catch {
      res.status(500).json({ error: "Failed to list agents" });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    try {
      const agent = await testDb
        .select().from(schema.agents)
        .where(eq(schema.agents.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json({ agent });
    } catch {
      res.status(500).json({ error: "Failed to get agent" });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const { name, role, model, maxThinkingTokens, systemPrompt, description, allowedTools, permissionMode, level, color, avatar } = req.body;
      const agent = {
        id: nanoid(),
        name,
        role: role ?? "custom",
        model: model ?? "claude-sonnet-4-5-20250929",
        maxThinkingTokens: maxThinkingTokens ?? null,
        systemPrompt: systemPrompt ?? "",
        description: description ?? "",
        allowedTools: JSON.stringify(allowedTools ?? ["Read", "Glob", "Grep", "Bash", "Write", "Edit"]),
        permissionMode: permissionMode ?? "acceptEdits",
        level: level ?? "senior",
        isDefault: 0,
        isActive: 1,
        color: color ?? "#6B7280",
        avatar: avatar ?? "bot",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await testDb.insert(schema.agents).values(agent);
      res.status(201).json({ agent });
    } catch {
      res.status(500).json({ error: "Failed to create agent" });
    }
  });

  app.patch("/api/agents/:id", async (req, res) => {
    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const allowedFields = ["name", "model", "maxThinkingTokens", "systemPrompt", "description", "allowedTools", "permissionMode", "level", "isActive", "color", "avatar", "soul"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = field === "allowedTools" ? JSON.stringify(req.body[field]) : req.body[field];
        }
      }
      await testDb.update(schema.agents).set(updates).where(eq(schema.agents.id, req.params.id));
      const agent = await testDb.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).then((r: unknown[]) => r[0]);
      res.json({ agent });
    } catch {
      res.status(500).json({ error: "Failed to update agent" });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const agent = await testDb.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).then((r: unknown[]) => r[0] as { isDefault: number } | undefined);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      if (agent.isDefault) return res.status(400).json({ error: "Cannot delete default agents" });
      await testDb.delete(schema.agents).where(eq(schema.agents.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete agent" });
    }
  });

  // =========================================================================
  // SKILLS ROUTES — /api/skills
  // =========================================================================
  app.get("/api/skills", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const rows = projectId
        ? await testDb.select().from(schema.skills).where(eq(schema.skills.projectId, projectId))
        : await testDb.select().from(schema.skills);
      res.json({ skills: rows });
    } catch {
      res.status(500).json({ error: "Failed to list skills" });
    }
  });

  app.get("/api/skills/:id", async (req, res) => {
    try {
      const skill = await testDb.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).then((r: unknown[]) => r[0]);
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      res.json({ skill });
    } catch {
      res.status(500).json({ error: "Failed to get skill" });
    }
  });

  app.post("/api/skills", async (req, res) => {
    try {
      const { name, description, category, instructions, projectId, isActive } = req.body;
      if (!name || !instructions) return res.status(400).json({ error: "name and instructions are required" });
      const skill = {
        id: nanoid(),
        projectId: projectId ?? null,
        name,
        description: description ?? null,
        category: category ?? "custom",
        instructions,
        isActive: (isActive ?? true) ? 1 : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await testDb.insert(schema.skills).values(skill);
      res.status(201).json({ skill });
    } catch {
      res.status(500).json({ error: "Failed to create skill" });
    }
  });

  app.patch("/api/skills/:id", async (req, res) => {
    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const allowedFields = ["name", "description", "category", "instructions", "isActive", "projectId"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      await testDb.update(schema.skills).set(updates).where(eq(schema.skills.id, req.params.id));
      const skill = await testDb.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).then((r: unknown[]) => r[0]);
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      res.json({ skill });
    } catch {
      res.status(500).json({ error: "Failed to update skill" });
    }
  });

  app.delete("/api/skills/:id", async (req, res) => {
    try {
      const skill = await testDb.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).then((r: unknown[]) => r[0]);
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      await testDb.delete(schema.agentSkills).where(eq(schema.agentSkills.skillId, req.params.id));
      await testDb.delete(schema.skills).where(eq(schema.skills.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete skill" });
    }
  });

  // =========================================================================
  // AGENT-SKILLS ROUTES — /api/agents/:agentId/skills
  // =========================================================================
  app.get("/api/agents/:agentId/skills", async (req, res) => {
    try {
      const { agentId } = req.params;
      const rows = await testDb
        .select({
          id: schema.skills.id,
          projectId: schema.skills.projectId,
          name: schema.skills.name,
          description: schema.skills.description,
          category: schema.skills.category,
          instructions: schema.skills.instructions,
          isActive: schema.skills.isActive,
          createdAt: schema.skills.createdAt,
          updatedAt: schema.skills.updatedAt,
          assignmentId: schema.agentSkills.id,
        })
        .from(schema.agentSkills)
        .innerJoin(schema.skills, eq(schema.agentSkills.skillId, schema.skills.id))
        .where(eq(schema.agentSkills.agentId, agentId));
      res.json({ skills: rows });
    } catch {
      res.status(500).json({ error: "Failed to list agent skills" });
    }
  });

  app.post("/api/agents/:agentId/skills", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { skillId } = req.body;
      if (!skillId) return res.status(400).json({ error: "skillId is required" });
      const skill = await testDb.select().from(schema.skills).where(eq(schema.skills.id, skillId)).then((r: unknown[]) => r[0]);
      if (!skill) return res.status(404).json({ error: "Skill not found" });
      const existing = await testDb.select().from(schema.agentSkills)
        .where(and(eq(schema.agentSkills.agentId, agentId), eq(schema.agentSkills.skillId, skillId)))
        .then((r: unknown[]) => r[0]);
      if (existing) return res.status(409).json({ error: "Skill already assigned to this agent" });
      const agentSkill = { id: nanoid(), agentId, skillId, createdAt: new Date() };
      await testDb.insert(schema.agentSkills).values(agentSkill);
      res.status(201).json({ agentSkill });
    } catch {
      res.status(500).json({ error: "Failed to assign skill" });
    }
  });

  app.delete("/api/agents/:agentId/skills/:skillId", async (req, res) => {
    try {
      const { agentId, skillId } = req.params;
      const existing = await testDb.select().from(schema.agentSkills)
        .where(and(eq(schema.agentSkills.agentId, agentId), eq(schema.agentSkills.skillId, skillId)))
        .then((r: unknown[]) => r[0]);
      if (!existing) return res.status(404).json({ error: "Skill assignment not found" });
      await testDb.delete(schema.agentSkills)
        .where(and(eq(schema.agentSkills.agentId, agentId), eq(schema.agentSkills.skillId, skillId)));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to unassign skill" });
    }
  });

  // =========================================================================
  // TEAMS ROUTES — /api/teams
  // =========================================================================
  function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  async function getUserRoleInTeam(userId: string, teamId: string): Promise<string | null> {
    const member = await testDb.select().from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
      .then((r: Array<{ role: string }>) => r[0]);
    return member?.role ?? null;
  }

  app.post("/api/teams", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) return res.status(400).json({ error: "Team name is required" });
      const slug = slugify(name) + "-" + nanoid(6);
      const teamId = nanoid();
      const now = new Date();
      const team = { id: teamId, name: name.trim(), slug, ownerId: userId, createdAt: now, updatedAt: now };
      await testDb.insert(schema.teams).values(team);
      await testDb.insert(schema.teamMembers).values({ id: nanoid(), teamId, userId, role: "owner", createdAt: now, joinedAt: now });
      res.status(201).json({ team });
    } catch {
      res.status(500).json({ error: "Failed to create team" });
    }
  });

  app.get("/api/teams", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const memberships = await testDb
        .select({ team: schema.teams, role: schema.teamMembers.role })
        .from(schema.teamMembers)
        .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
        .where(eq(schema.teamMembers.userId, userId))
        .orderBy(desc(schema.teams.updatedAt));
      const teams = memberships.map((m: { team: Record<string, unknown>; role: string }) => ({ ...m.team, role: m.role }));
      res.json({ teams });
    } catch {
      res.status(500).json({ error: "Failed to list teams" });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const team = await testDb.select().from(schema.teams).where(eq(schema.teams.id, req.params.id)).then((r: unknown[]) => r[0]);
      if (!team) return res.status(404).json({ error: "Team not found" });
      const role = await getUserRoleInTeam(userId, req.params.id);
      if (!role) return res.status(403).json({ error: "Not a member of this team" });
      res.json({ team, role });
    } catch {
      res.status(500).json({ error: "Failed to get team" });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const role = await getUserRoleInTeam(userId, req.params.id);
      if (!role) return res.status(403).json({ error: "Not a member of this team" });
      const members = await testDb
        .select({
          id: schema.teamMembers.id,
          teamId: schema.teamMembers.teamId,
          userId: schema.teamMembers.userId,
          role: schema.teamMembers.role,
          userName: schema.users.name,
          userLogin: schema.users.login,
          userAvatar: schema.users.avatarUrl,
        })
        .from(schema.teamMembers)
        .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
        .where(eq(schema.teamMembers.teamId, req.params.id));
      res.json({ members });
    } catch {
      res.status(500).json({ error: "Failed to list team members" });
    }
  });

  app.post("/api/teams/:id/invite", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const teamId = req.params.id;
      const role = await getUserRoleInTeam(userId, teamId);
      if (!role || (role !== "owner" && role !== "admin")) return res.status(403).json({ error: "Only owners and admins can invite members" });
      const { email, role: inviteRole } = req.body;
      if (!email || typeof email !== "string") return res.status(400).json({ error: "Email is required" });
      const validRoles = ["admin", "member", "viewer"];
      const finalRole = validRoles.includes(inviteRole) ? inviteRole : "member";
      const token = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const invite = { id: nanoid(), teamId, email: email.trim().toLowerCase(), role: finalRole, token, expiresAt, createdAt: now };
      await testDb.insert(schema.teamInvites).values(invite);
      res.status(201).json({ invite });
    } catch {
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  app.post("/api/teams/invite/:token/accept", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const invite = await testDb.select().from(schema.teamInvites)
        .where(eq(schema.teamInvites.token, req.params.token))
        .then((r: Array<{ id: string; teamId: string; role: string; acceptedAt: unknown; expiresAt: Date }>) => r[0]);
      if (!invite) return res.status(404).json({ error: "Invite not found" });
      if (invite.acceptedAt) return res.status(400).json({ error: "Invite already accepted" });
      const existing = await testDb.select().from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, invite.teamId), eq(schema.teamMembers.userId, userId)))
        .then((r: unknown[]) => r[0]);
      if (existing) return res.status(400).json({ error: "Already a member of this team" });
      const now = new Date();
      await testDb.insert(schema.teamMembers).values({ id: nanoid(), teamId: invite.teamId, userId, role: invite.role, createdAt: now, joinedAt: now });
      await testDb.update(schema.teamInvites).set({ acceptedAt: now }).where(eq(schema.teamInvites.id, invite.id));
      res.json({ success: true, teamId: invite.teamId });
    } catch {
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  app.delete("/api/teams/:id/members/:userId", async (req, res) => {
    try {
      const currentUserId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!currentUserId) return res.status(401).json({ error: "Authentication required" });
      const teamId = req.params.id;
      const targetUserId = req.params.userId;
      const currentRole = await getUserRoleInTeam(currentUserId, teamId);
      if (!currentRole || (currentRole !== "owner" && currentRole !== "admin")) return res.status(403).json({ error: "Only owners and admins can remove members" });
      const targetRole = await getUserRoleInTeam(targetUserId, teamId);
      if (targetRole === "owner") return res.status(400).json({ error: "Cannot remove the team owner" });
      if (currentRole === "admin" && targetRole === "admin") return res.status(403).json({ error: "Admins cannot remove other admins" });
      await testDb.delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId)));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  app.patch("/api/teams/:id/members/:userId", async (req, res) => {
    try {
      const currentUserId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!currentUserId) return res.status(401).json({ error: "Authentication required" });
      const teamId = req.params.id;
      const targetUserId = req.params.userId;
      const { role: newRole } = req.body;
      const currentRole = await getUserRoleInTeam(currentUserId, teamId);
      if (currentRole !== "owner") return res.status(403).json({ error: "Only the team owner can change roles" });
      const validRoles = ["admin", "member", "viewer"];
      if (!validRoles.includes(newRole)) return res.status(400).json({ error: "Invalid role. Must be admin, member, or viewer" });
      if (targetUserId === currentUserId) return res.status(400).json({ error: "Cannot change your own role as owner" });
      await testDb.update(schema.teamMembers).set({ role: newRole }).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId)));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update member role" });
    }
  });

  // =========================================================================
  // NOTIFICATIONS ROUTES — /api/notifications
  // =========================================================================
  app.get("/api/notifications", async (req, res) => {
    try {
      const { projectId, read: readStr, limit: limitStr, offset: offsetStr } = req.query;
      const limit = parseInt(limitStr as string) || 50;
      const offset = parseInt(offsetStr as string) || 0;
      const readFilter = readStr === "true" ? true : readStr === "false" ? false : undefined;

      const conditions = [];
      if (projectId) conditions.push(eq(schema.notifications.projectId, projectId as string));
      if (readFilter !== undefined) conditions.push(eq(schema.notifications.read, (readFilter ? 1 : 0) as unknown as boolean));

      const query = testDb.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(limit).offset(offset);
      const notifications = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
      res.json({ notifications });
    } catch {
      res.status(500).json({ error: "Failed to list notifications" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const { projectId } = req.query;
      const conditions = [eq(schema.notifications.read, 0 as unknown as boolean)];
      if (projectId) conditions.push(eq(schema.notifications.projectId, projectId as string));
      const result = await testDb.select({ count: sql<number>`count(*)` }).from(schema.notifications).where(and(...conditions));
      res.json({ count: result[0]?.count ?? 0 });
    } catch {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      await testDb.update(schema.notifications).set({ read: 1 as unknown as boolean }).where(eq(schema.notifications.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.put("/api/notifications/read-all", async (req, res) => {
    try {
      const { projectId } = req.body;
      const conditions = [eq(schema.notifications.read, 0 as unknown as boolean)];
      if (projectId) conditions.push(eq(schema.notifications.projectId, projectId));
      await testDb.update(schema.notifications).set({ read: 1 as unknown as boolean }).where(and(...conditions));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await testDb.delete(schema.notifications).where(eq(schema.notifications.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // =========================================================================
  // MEMORIES ROUTES — /api/agents/:agentId/memories
  // =========================================================================
  app.get("/api/agents/:agentId/memories", async (req, res) => {
    try {
      const { agentId } = req.params;
      const projectId = req.query.projectId as string | undefined;
      let memories;
      if (projectId) {
        memories = await testDb.select().from(schema.agentMemories)
          .where(and(eq(schema.agentMemories.agentId, agentId), eq(schema.agentMemories.projectId, projectId)))
          .orderBy(desc(schema.agentMemories.createdAt));
      } else {
        memories = await testDb.select().from(schema.agentMemories)
          .where(eq(schema.agentMemories.agentId, agentId))
          .orderBy(desc(schema.agentMemories.createdAt));
      }
      res.json({ memories });
    } catch {
      res.status(500).json({ error: "Failed to list memories" });
    }
  });

  app.post("/api/agents/:agentId/memories", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { type, content, context, importance, projectId } = req.body;
      if (!type || !content) return res.status(400).json({ error: "type and content are required" });
      const id = nanoid();
      await testDb.insert(schema.agentMemories).values({
        id,
        agentId,
        projectId: projectId ?? null,
        type,
        content,
        context: context ?? null,
        importance: importance ?? 3,
        createdAt: new Date(),
      });
      res.status(201).json({ id });
    } catch {
      res.status(500).json({ error: "Failed to store memory" });
    }
  });

  app.delete("/api/agents/:agentId/memories/:memoryId", async (req, res) => {
    try {
      const { memoryId } = req.params;
      const result = testSqlite.prepare("DELETE FROM agent_memories WHERE id = ?").run(memoryId);
      if (result.changes === 0) return res.status(404).json({ error: "Memory not found" });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  // =========================================================================
  // PROJECTS filtered by teamId
  // =========================================================================
  app.get("/api/projects", async (req, res) => {
    try {
      const teamId = req.query.teamId as string | undefined;
      const rows = teamId
        ? await testDb.select().from(schema.projects).where(eq(schema.projects.teamId, teamId))
        : await testDb.select().from(schema.projects);
      res.json({ projects: rows });
    } catch {
      res.status(500).json({ error: "Failed to list projects" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

// ===========================================================================
// USER JOURNEY 1: Agent Management
// ===========================================================================
describe("User Journey 1: Agent Management", () => {
  it("lists agents — initially empty", async () => {
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(0);
  });

  it("creates a custom agent and verifies all fields", async () => {
    const payload = {
      name: "My Developer",
      role: "developer",
      model: "openrouter/auto",
      systemPrompt: "You are a senior developer.",
      description: "A custom developer agent.",
      allowedTools: ["Read", "Write", "Bash"],
      permissionMode: "bypassPermissions",
      level: "senior",
      color: "#FF5733",
    };

    const createRes = await request(app).post("/api/agents").send(payload);
    expect(createRes.status).toBe(201);
    const created = createRes.body.agent;
    expect(created.name).toBe("My Developer");
    expect(created.role).toBe("developer");
    expect(created.model).toBe("openrouter/auto");
    expect(created.permissionMode).toBe("bypassPermissions");
    expect(created.level).toBe("senior");
    expect(created.color).toBe("#FF5733");
    expect(created.isDefault).toBe(0);
    expect(created.isActive).toBe(1);
    expect(JSON.parse(created.allowedTools)).toEqual(["Read", "Write", "Bash"]);

    // GET by ID
    const getRes = await request(app).get(`/api/agents/${created.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.agent.name).toBe("My Developer");
    expect(getRes.body.agent.id).toBe(created.id);
  });

  it("updates an agent and creates a second, then lists both", async () => {
    // Create first agent
    const r1 = await request(app).post("/api/agents").send({ name: "Agent A", role: "developer", systemPrompt: "A", description: "A" });
    const agentA = r1.body.agent;

    // Update first agent
    const updateRes = await request(app).patch(`/api/agents/${agentA.id}`).send({ name: "Agent A Updated", model: "gpt-4o", allowedTools: ["Read", "Write", "Bash", "Edit"] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.agent.name).toBe("Agent A Updated");
    expect(updateRes.body.agent.model).toBe("gpt-4o");
    expect(JSON.parse(updateRes.body.agent.allowedTools)).toContain("Edit");

    // Create second agent
    const r2 = await request(app).post("/api/agents").send({ name: "QA Agent", role: "qa", model: "claude-3-haiku", systemPrompt: "QA", description: "QA agent" });
    expect(r2.status).toBe(201);

    // List — should have both
    const listRes = await request(app).get("/api/agents");
    expect(listRes.status).toBe(200);
    expect(listRes.body.agents).toHaveLength(2);
  });

  it("deletes a custom agent, blocks deletion of default agent, returns 404 for deleted", async () => {
    // Create custom agent
    const r1 = await request(app).post("/api/agents").send({ name: "To Delete", role: "developer", systemPrompt: "x", description: "x" });
    const customAgent = r1.body.agent;

    // Create default agent (via direct DB insert)
    const defaultAgent = await createTestAgent(testDb, { name: "Default Agent", isDefault: true });

    // Delete custom — should succeed
    const delRes = await request(app).delete(`/api/agents/${customAgent.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Try delete default — should be blocked
    const delDefaultRes = await request(app).delete(`/api/agents/${defaultAgent.id}`);
    expect(delDefaultRes.status).toBe(400);
    expect(delDefaultRes.body.error).toContain("Cannot delete default");

    // Get deleted agent — 404
    const getRes = await request(app).get(`/api/agents/${customAgent.id}`);
    expect(getRes.status).toBe(404);
  });
});

// ===========================================================================
// USER JOURNEY 2: Skills CRUD + Agent Assignment
// ===========================================================================
describe("User Journey 2: Skills CRUD + Agent Assignment", () => {
  let agentId: string;
  let skill1Id: string;
  let skill2Id: string;

  beforeEach(async () => {
    // Create an agent for skill assignments
    const agent = await createTestAgent(testDb, { name: "Skill Test Agent" });
    agentId = agent.id;
  });

  it("full skills lifecycle: create, list, get, update, assign, unassign, delete cascade", async () => {
    // 1. Create skill 1
    const r1 = await request(app).post("/api/skills").send({
      name: "React Expert",
      category: "frontend",
      instructions: "Always use functional components with hooks.",
      description: "React development expertise.",
      isActive: true,
    });
    expect(r1.status).toBe(201);
    skill1Id = r1.body.skill.id;
    expect(r1.body.skill.name).toBe("React Expert");
    expect(r1.body.skill.category).toBe("frontend");

    // 2. Create skill 2
    const r2 = await request(app).post("/api/skills").send({
      name: "API Design",
      category: "backend",
      instructions: "Follow REST conventions, use proper HTTP status codes.",
    });
    expect(r2.status).toBe(201);
    skill2Id = r2.body.skill.id;

    // 3. List skills — both returned
    const listRes = await request(app).get("/api/skills");
    expect(listRes.status).toBe(200);
    expect(listRes.body.skills).toHaveLength(2);

    // 4. Get skill by ID
    const getRes = await request(app).get(`/api/skills/${skill1Id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.skill.name).toBe("React Expert");
    expect(getRes.body.skill.instructions).toContain("functional components");

    // 5. Update skill
    const updateRes = await request(app).patch(`/api/skills/${skill1Id}`).send({
      description: "Updated React expertise.",
      instructions: "Use React 19 features: server components, use() hook.",
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.skill.description).toBe("Updated React expertise.");
    expect(updateRes.body.skill.instructions).toContain("React 19");

    // 6. Assign skill 1 to agent
    const assignRes = await request(app).post(`/api/agents/${agentId}/skills`).send({ skillId: skill1Id });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.agentSkill.agentId).toBe(agentId);
    expect(assignRes.body.agentSkill.skillId).toBe(skill1Id);

    // 7. List agent skills — 1 skill
    const agentSkills1 = await request(app).get(`/api/agents/${agentId}/skills`);
    expect(agentSkills1.status).toBe(200);
    expect(agentSkills1.body.skills).toHaveLength(1);
    expect(agentSkills1.body.skills[0].name).toBe("React Expert");

    // 8. Assign skill 2 to same agent
    const assignRes2 = await request(app).post(`/api/agents/${agentId}/skills`).send({ skillId: skill2Id });
    expect(assignRes2.status).toBe(201);

    // 9. List agent skills — 2 skills
    const agentSkills2 = await request(app).get(`/api/agents/${agentId}/skills`);
    expect(agentSkills2.body.skills).toHaveLength(2);

    // 10. Unassign skill 1
    const unassignRes = await request(app).delete(`/api/agents/${agentId}/skills/${skill1Id}`);
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.success).toBe(true);

    // 11. List agent skills — 1 remaining
    const agentSkills3 = await request(app).get(`/api/agents/${agentId}/skills`);
    expect(agentSkills3.body.skills).toHaveLength(1);
    expect(agentSkills3.body.skills[0].name).toBe("API Design");

    // 12. Delete skill 2 — should cascade and remove from agent_skills
    const delRes = await request(app).delete(`/api/skills/${skill2Id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify cascade: agent should have 0 skills
    const agentSkills4 = await request(app).get(`/api/agents/${agentId}/skills`);
    expect(agentSkills4.body.skills).toHaveLength(0);

    // Verify skill is gone
    const getDeleted = await request(app).get(`/api/skills/${skill2Id}`);
    expect(getDeleted.status).toBe(404);
  });

  it("rejects duplicate skill assignment", async () => {
    const skill = await request(app).post("/api/skills").send({ name: "Dup Test", instructions: "test" });
    const skillId = skill.body.skill.id;

    await request(app).post(`/api/agents/${agentId}/skills`).send({ skillId });
    const dupRes = await request(app).post(`/api/agents/${agentId}/skills`).send({ skillId });
    expect(dupRes.status).toBe(409);
  });

  it("validates skill creation requires name and instructions", async () => {
    const r1 = await request(app).post("/api/skills").send({ name: "No instructions" });
    expect(r1.status).toBe(400);

    const r2 = await request(app).post("/api/skills").send({ instructions: "No name" });
    expect(r2.status).toBe(400);
  });
});

// ===========================================================================
// USER JOURNEY 3: Team Management
// ===========================================================================
describe("User Journey 3: Team Management", () => {
  let ownerId: string;
  let teamId: string;

  beforeEach(async () => {
    const owner = await createTestUser({ name: "Team Owner", login: "owner" });
    ownerId = owner.id;
  });

  it("full team lifecycle: create, list, get, invite, accept, change role, remove member", async () => {
    // 1. Create team
    const createRes = await request(app)
      .post("/api/teams")
      .set("x-user-id", ownerId)
      .send({ name: "Frontend Squad" });
    expect(createRes.status).toBe(201);
    teamId = createRes.body.team.id;
    expect(createRes.body.team.name).toBe("Frontend Squad");
    expect(createRes.body.team.ownerId).toBe(ownerId);

    // 2. List teams — verify team listed with user as owner
    const listRes = await request(app).get("/api/teams").set("x-user-id", ownerId);
    expect(listRes.status).toBe(200);
    expect(listRes.body.teams).toHaveLength(1);
    expect(listRes.body.teams[0].role).toBe("owner");

    // 3. Get team details
    const getRes = await request(app).get(`/api/teams/${teamId}`).set("x-user-id", ownerId);
    expect(getRes.status).toBe(200);
    expect(getRes.body.team.name).toBe("Frontend Squad");
    expect(getRes.body.role).toBe("owner");

    // 4. List team members — creator is owner
    const membersRes = await request(app).get(`/api/teams/${teamId}/members`).set("x-user-id", ownerId);
    expect(membersRes.status).toBe(200);
    expect(membersRes.body.members).toHaveLength(1);
    expect(membersRes.body.members[0].role).toBe("owner");

    // 5. Create invite — role: member
    const inviteRes = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set("x-user-id", ownerId)
      .send({ email: "dev@example.com", role: "member" });
    expect(inviteRes.status).toBe(201);
    const inviteToken = inviteRes.body.invite.token;
    expect(inviteRes.body.invite.email).toBe("dev@example.com");
    expect(inviteRes.body.invite.role).toBe("member");

    // 6. Create admin invite
    const adminInviteRes = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set("x-user-id", ownerId)
      .send({ email: "lead@example.com", role: "admin" });
    expect(adminInviteRes.status).toBe(201);
    expect(adminInviteRes.body.invite.role).toBe("admin");

    // 7. Accept invite — create user2 and use invite token
    const user2 = await createTestUser({ name: "Dev User", login: "dev-user", email: "dev@example.com" });
    const acceptRes = await request(app)
      .post(`/api/teams/invite/${inviteToken}/accept`)
      .set("x-user-id", user2.id);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);
    expect(acceptRes.body.teamId).toBe(teamId);

    // 8. List members — verify 2 members now
    const members2 = await request(app).get(`/api/teams/${teamId}/members`).set("x-user-id", ownerId);
    expect(members2.body.members).toHaveLength(2);

    // 9. Change member role — member -> admin (only owner can)
    const changeRoleRes = await request(app)
      .patch(`/api/teams/${teamId}/members/${user2.id}`)
      .set("x-user-id", ownerId)
      .send({ role: "admin" });
    expect(changeRoleRes.status).toBe(200);
    expect(changeRoleRes.body.success).toBe(true);

    // Verify role changed
    const members3 = await request(app).get(`/api/teams/${teamId}/members`).set("x-user-id", ownerId);
    const user2Member = members3.body.members.find((m: { userId: string }) => m.userId === user2.id);
    expect(user2Member.role).toBe("admin");

    // 10. Remove member
    const removeRes = await request(app)
      .delete(`/api/teams/${teamId}/members/${user2.id}`)
      .set("x-user-id", ownerId);
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.success).toBe(true);

    // Verify removed
    const members4 = await request(app).get(`/api/teams/${teamId}/members`).set("x-user-id", ownerId);
    expect(members4.body.members).toHaveLength(1);

    // 11. Try remove owner — should be blocked
    const removeOwnerRes = await request(app)
      .delete(`/api/teams/${teamId}/members/${ownerId}`)
      .set("x-user-id", ownerId);
    expect(removeOwnerRes.status).toBe(400);
    expect(removeOwnerRes.body.error).toContain("Cannot remove the team owner");
  });

  it("non-owner cannot change roles", async () => {
    // Create team
    const createRes = await request(app).post("/api/teams").set("x-user-id", ownerId).send({ name: "Test Team" });
    teamId = createRes.body.team.id;

    // Add a member
    const user2 = await createTestUser({ name: "Member", login: "member1" });
    const inviteRes = await request(app).post(`/api/teams/${teamId}/invite`).set("x-user-id", ownerId).send({ email: "m@x.com", role: "member" });
    const token = inviteRes.body.invite.token;
    await request(app).post(`/api/teams/invite/${token}/accept`).set("x-user-id", user2.id);

    // Member tries to change role — should be blocked
    const changeRes = await request(app)
      .patch(`/api/teams/${teamId}/members/${user2.id}`)
      .set("x-user-id", user2.id)
      .send({ role: "admin" });
    expect(changeRes.status).toBe(403);
  });

  it("associates project with team and filters by teamId", async () => {
    // Create team
    const createRes = await request(app).post("/api/teams").set("x-user-id", ownerId).send({ name: "Project Team" });
    teamId = createRes.body.team.id;

    // Create project with teamId
    const project = await createTestProject(testDb, { teamId, ownerId });

    // Create another project without teamId
    await createTestProject(testDb, { name: "Other Project" });

    // List projects by teamId
    const listRes = await request(app).get(`/api/projects?teamId=${teamId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.projects).toHaveLength(1);
    expect(listRes.body.projects[0].id).toBe(project.id);
  });
});

// ===========================================================================
// USER JOURNEY 4: Notifications
// ===========================================================================
describe("User Journey 4: Notifications", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb);
    projectId = project.id;
  });

  it("full notifications lifecycle: create, list, count, mark read, delete, filter", async () => {
    const now = new Date();

    // 1. Insert notifications directly (simulating system-created notifications)
    const notifs = [
      { id: nanoid(), projectId, type: "task_completed", title: "Task Done", body: "Task X completed", read: 0, createdAt: new Date(now.getTime() - 3000) },
      { id: nanoid(), projectId, type: "agent_error", title: "Agent Error", body: "Agent failed on task Y", read: 0, createdAt: new Date(now.getTime() - 2000) },
      { id: nanoid(), projectId, type: "pr_created", title: "PR Created", body: "PR #42 created", read: 0, createdAt: new Date(now.getTime() - 1000) },
    ];
    for (const n of notifs) {
      await testDb.insert(schema.notifications).values(n);
    }

    // 2. List notifications
    const listRes = await request(app).get("/api/notifications");
    expect(listRes.status).toBe(200);
    expect(listRes.body.notifications).toHaveLength(3);

    // 3. Get unread count — should be 3
    const countRes = await request(app).get("/api/notifications/unread-count");
    expect(countRes.status).toBe(200);
    expect(countRes.body.count).toBe(3);

    // 4. Mark one as read
    const markRes = await request(app).put(`/api/notifications/${notifs[0].id}/read`);
    expect(markRes.status).toBe(200);
    expect(markRes.body.success).toBe(true);

    // 5. Get unread count — should be 2
    const countRes2 = await request(app).get("/api/notifications/unread-count");
    expect(countRes2.body.count).toBe(2);

    // 6. Mark all as read
    const markAllRes = await request(app).put("/api/notifications/read-all").send({});
    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.success).toBe(true);

    // 7. Get unread count — should be 0
    const countRes3 = await request(app).get("/api/notifications/unread-count");
    expect(countRes3.body.count).toBe(0);

    // 8. Delete notification
    const delRes = await request(app).delete(`/api/notifications/${notifs[1].id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify deleted
    const listRes2 = await request(app).get("/api/notifications");
    expect(listRes2.body.notifications).toHaveLength(2);

    // 9. Filter by projectId
    // Create a notification for a different project
    const otherProject = await createTestProject(testDb, { name: "Other" });
    await testDb.insert(schema.notifications).values({
      id: nanoid(), projectId: otherProject.id, type: "info", title: "Other", read: 0, createdAt: new Date(),
    });

    const filteredRes = await request(app).get(`/api/notifications?projectId=${projectId}`);
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.notifications).toHaveLength(2);
    for (const n of filteredRes.body.notifications) {
      expect(n.projectId).toBe(projectId);
    }
  });

  it("filters by read status", async () => {
    await testDb.insert(schema.notifications).values({ id: nanoid(), projectId, type: "info", title: "Read One", read: 1, createdAt: new Date() });
    await testDb.insert(schema.notifications).values({ id: nanoid(), projectId, type: "info", title: "Unread One", read: 0, createdAt: new Date() });

    const unreadRes = await request(app).get("/api/notifications?read=false");
    expect(unreadRes.body.notifications).toHaveLength(1);
    expect(unreadRes.body.notifications[0].title).toBe("Unread One");

    const readRes = await request(app).get("/api/notifications?read=true");
    expect(readRes.body.notifications).toHaveLength(1);
    expect(readRes.body.notifications[0].title).toBe("Read One");
  });
});

// ===========================================================================
// USER JOURNEY 5: Agent Memories
// ===========================================================================
describe("User Journey 5: Agent Memories", () => {
  let agentId: string;
  let projectId1: string;
  let projectId2: string;

  beforeEach(async () => {
    const agent = await createTestAgent(testDb, { name: "Memory Agent" });
    agentId = agent.id;
    const p1 = await createTestProject(testDb, { name: "Project A" });
    projectId1 = p1.id;
    const p2 = await createTestProject(testDb, { name: "Project B" });
    projectId2 = p2.id;
  });

  it("full memory lifecycle: create, list, filter by project, delete", async () => {
    // 1. Create memory for project 1
    const r1 = await request(app).post(`/api/agents/${agentId}/memories`).send({
      type: "preference",
      content: "User prefers TypeScript",
      context: "code-review",
      importance: 8,
      projectId: projectId1,
    });
    expect(r1.status).toBe(201);
    expect(r1.body.id).toBeDefined();
    const memoryId1 = r1.body.id;

    // 2. Create memory for project 2
    const r2 = await request(app).post(`/api/agents/${agentId}/memories`).send({
      type: "lesson",
      content: "Always run tests before committing",
      context: "workflow",
      importance: 5,
      projectId: projectId2,
    });
    expect(r2.status).toBe(201);
    const memoryId2 = r2.body.id;

    // 3. List all memories for agent — should have both
    const listRes = await request(app).get(`/api/agents/${agentId}/memories`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.memories).toHaveLength(2);

    // 4. Filter by projectId — only project 1
    const filteredRes = await request(app).get(`/api/agents/${agentId}/memories?projectId=${projectId1}`);
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.memories).toHaveLength(1);
    expect(filteredRes.body.memories[0].content).toBe("User prefers TypeScript");

    // 5. Delete memory 1
    const delRes = await request(app).delete(`/api/agents/${agentId}/memories/${memoryId1}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify deleted
    const listRes2 = await request(app).get(`/api/agents/${agentId}/memories`);
    expect(listRes2.body.memories).toHaveLength(1);
    expect(listRes2.body.memories[0].id).toBe(memoryId2);

    // Delete non-existent memory — 404
    const delRes2 = await request(app).delete(`/api/agents/${agentId}/memories/non-existent-id`);
    expect(delRes2.status).toBe(404);
  });

  it("validates memory creation requires type and content", async () => {
    const r1 = await request(app).post(`/api/agents/${agentId}/memories`).send({ type: "lesson" });
    expect(r1.status).toBe(400);

    const r2 = await request(app).post(`/api/agents/${agentId}/memories`).send({ content: "test" });
    expect(r2.status).toBe(400);
  });

  it("creates memory without projectId (global memory)", async () => {
    const r = await request(app).post(`/api/agents/${agentId}/memories`).send({
      type: "pattern",
      content: "Use Map for O(1) lookups",
      importance: 7,
    });
    expect(r.status).toBe(201);

    // Should appear in unfiltered list
    const listRes = await request(app).get(`/api/agents/${agentId}/memories`);
    expect(listRes.body.memories).toHaveLength(1);
    expect(listRes.body.memories[0].content).toBe("Use Map for O(1) lookups");
  });
});
