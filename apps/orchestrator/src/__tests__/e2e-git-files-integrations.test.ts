import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  createTestTaskLog,
  createTestWorkflow,
  cleanTestDb,
} from "../test/helpers";
import * as schema from "@agenthub/database/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";
import crypto from "crypto";
import { resolve, sep } from "path";

// ─── Encryption helpers (mirror lib/encryption.ts for test isolation) ───
const ALGORITHM = "aes-256-gcm";
const TEST_KEY = crypto.randomBytes(32);

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, TEST_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedText] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, TEST_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any;
let app: express.Express;

beforeAll(async () => {
  const testSetup = await createTestDb();
  db = testSetup.db;
  sqlite = testSetup.sqlite;

  app = express();
  app.use(express.json());

  // ───────── Git Config Routes (replicate git.ts logic) ─────────

  app.get("/api/projects/:id/git/config", async (req, res) => {
    try {
      const integration = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, req.params.id),
            eq(schema.integrations.type, "git"),
          ),
        )
        .then((r: unknown[]) => r[0]);

      if (!integration) return res.json(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = (integration as any).config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? JSON.parse((integration as any).config)
        : null;
      res.json(config);
    } catch {
      res.status(500).json({ error: "Failed to get git config" });
    }
  });

  app.put("/api/projects/:id/git/config", async (req, res) => {
    try {
      const { remoteUrl, defaultBranch, autoCommit, autoCreateBranch } = req.body;
      const config = JSON.stringify({
        remoteUrl: remoteUrl || null,
        defaultBranch: defaultBranch || "main",
        autoCommit: autoCommit ?? false,
        autoCreateBranch: autoCreateBranch ?? false,
      });

      const existing = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, req.params.id),
            eq(schema.integrations.type, "git"),
          ),
        )
        .then((r: unknown[]) => r[0]);

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.update(schema.integrations).set({
          config,
          status: "connected",
          updatedAt: new Date(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).where(eq(schema.integrations.id, (existing as any).id));
      } else {
        await db.insert(schema.integrations).values({
          id: crypto.randomUUID(),
          projectId: req.params.id,
          type: "git",
          status: "connected",
          config,
          linkedAgentId: null,
          lastConnectedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update git config" });
    }
  });

  app.put("/api/projects/:id/git/credentials", async (req, res) => {
    try {
      const { type, sshKeyPath, token, username } = req.body;

      if (type === "ssh" && !sshKeyPath) {
        return res.status(400).json({ error: "SSH key path is required for SSH authentication" });
      }
      if (type === "https" && !token) {
        return res.status(400).json({ error: "Token is required for HTTPS authentication" });
      }

      const credentials = JSON.stringify({ type, sshKeyPath, token, username });
      const encrypted = encrypt(credentials);

      const existing = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, req.params.id),
            eq(schema.integrations.type, "git"),
          ),
        )
        .then((r: unknown[]) => r[0]);

      if (existing) {
        await db.update(schema.integrations).set({
          credentials: encrypted,
          updatedAt: new Date(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).where(eq(schema.integrations.id, (existing as any).id));
      } else {
        await db.insert(schema.integrations).values({
          id: crypto.randomUUID(),
          projectId: req.params.id,
          type: "git",
          status: "connected",
          config: JSON.stringify({
            remoteUrl: null,
            defaultBranch: "main",
            autoCommit: false,
            autoCreateBranch: false,
            pushOnCommit: false,
            authMethod: type,
          }),
          credentials: encrypted,
          linkedAgentId: null,
          lastConnectedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save git credentials" });
    }
  });

  // ───────── Integration Management Routes ─────────

  app.post("/api/integrations", async (req, res) => {
    try {
      const { projectId, type, config, status, linkedAgentId } = req.body;
      if (!projectId || !type) {
        return res.status(400).json({ error: "projectId and type are required" });
      }
      const integration = {
        id: nanoid(),
        projectId,
        type,
        status: status || "disconnected",
        config: config ? JSON.stringify(config) : null,
        credentials: null,
        linkedAgentId: linkedAgentId || null,
        lastConnectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.integrations).values(integration);
      res.status(201).json({ integration });
    } catch {
      res.status(500).json({ error: "Failed to create integration" });
    }
  });

  app.get("/api/integrations", async (req, res) => {
    try {
      const { projectId } = req.query;
      const conditions = [];
      if (projectId) conditions.push(eq(schema.integrations.projectId, projectId as string));

      const integrations = await db
        .select()
        .from(schema.integrations)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      res.json({ integrations });
    } catch {
      res.status(500).json({ error: "Failed to list integrations" });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const { status, config } = req.body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (status !== undefined) updates.status = status;
      if (config !== undefined) updates.config = JSON.stringify(config);

      await db.update(schema.integrations).set(updates).where(eq(schema.integrations.id, req.params.id));

      const updated = await db
        .select()
        .from(schema.integrations)
        .where(eq(schema.integrations.id, req.params.id))
        .then((r: unknown[]) => r[0]);

      if (!updated) return res.status(404).json({ error: "Integration not found" });
      res.json({ integration: updated });
    } catch {
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(schema.integrations)
        .where(eq(schema.integrations.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!existing) return res.status(404).json({ error: "Integration not found" });

      await db.delete(schema.integrations).where(eq(schema.integrations.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });

  // ───────── Workflow Routes (replicate workflows.ts logic) ─────────

  app.get("/api/workflows", async (req, res) => {
    try {
      const { projectId } = req.query;
      const conditions = [];
      if (projectId) conditions.push(eq(schema.workflows.projectId, projectId as string));

      const workflows = await db
        .select()
        .from(schema.workflows)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.workflows.createdAt));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = workflows.map((w: any) => ({
        ...w,
        nodes: JSON.parse(w.nodes),
        edges: JSON.parse(w.edges),
      }));
      res.json({ workflows: parsed });
    } catch {
      res.status(500).json({ error: "Failed to list workflows" });
    }
  });

  app.get("/api/workflows/:id", async (req, res) => {
    try {
      const workflow = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = workflow as any;
      res.json({ workflow: { ...w, nodes: JSON.parse(w.nodes), edges: JSON.parse(w.edges) } });
    } catch {
      res.status(500).json({ error: "Failed to get workflow" });
    }
  });

  app.post("/api/workflows", async (req, res) => {
    try {
      const { projectId, name, description, nodes, edges, isDefault } = req.body;
      if (!projectId || !name) {
        return res.status(400).json({ error: "projectId and name are required" });
      }
      const id = nanoid();

      if (isDefault) {
        await db
          .update(schema.workflows)
          .set({ isDefault: 0 as unknown as boolean, updatedAt: new Date() })
          .where(and(eq(schema.workflows.projectId, projectId), eq(schema.workflows.isDefault, 1 as unknown as boolean)));
      }

      const workflow = {
        id,
        projectId,
        name,
        description: description ?? null,
        nodes: JSON.stringify(nodes ?? []),
        edges: JSON.stringify(edges ?? []),
        isDefault: isDefault ? 1 : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.workflows).values(workflow);

      res.status(201).json({
        workflow: { ...workflow, nodes: nodes ?? [], edges: edges ?? [], isDefault: !!isDefault },
      });
    } catch {
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });

  app.put("/api/workflows/:id", async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      const { name, description, nodes, edges, isDefault } = req.body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ex = existing as any;

      if (isDefault && !ex.isDefault) {
        await db
          .update(schema.workflows)
          .set({ isDefault: 0 as unknown as boolean, updatedAt: new Date() })
          .where(and(eq(schema.workflows.projectId, ex.projectId), eq(schema.workflows.isDefault, 1 as unknown as boolean)));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (nodes !== undefined) updates.nodes = JSON.stringify(nodes);
      if (edges !== undefined) updates.edges = JSON.stringify(edges);
      if (isDefault !== undefined) updates.isDefault = isDefault ? 1 : 0;

      await db.update(schema.workflows).set(updates).where(eq(schema.workflows.id, req.params.id));

      const updated = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .then((r: unknown[]) => r[0]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = updated as any;
      res.json({
        workflow: u ? { ...u, nodes: JSON.parse(u.nodes), edges: JSON.parse(u.edges) } : null,
      });
    } catch {
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      await db.delete(schema.workflows).where(eq(schema.workflows.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });

  app.post("/api/workflows/:id/set-default", async (req, res) => {
    try {
      const workflow = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = workflow as any;

      await db
        .update(schema.workflows)
        .set({ isDefault: 0 as unknown as boolean, updatedAt: new Date() })
        .where(and(eq(schema.workflows.projectId, w.projectId), eq(schema.workflows.isDefault, 1 as unknown as boolean)));

      await db
        .update(schema.workflows)
        .set({ isDefault: 1 as unknown as boolean, updatedAt: new Date() })
        .where(eq(schema.workflows.id, req.params.id));

      res.json({
        workflow: { ...w, isDefault: true, nodes: JSON.parse(w.nodes), edges: JSON.parse(w.edges) },
      });
    } catch {
      res.status(500).json({ error: "Failed to set default workflow" });
    }
  });

  // ───────── Docs Routes (replicate docs.ts logic) ─────────

  app.get("/api/docs", async (_req, res) => {
    try {
      const docs = await db
        .select()
        .from(schema.docs)
        .orderBy(desc(schema.docs.pinned), desc(schema.docs.updatedAt), asc(schema.docs.order));
      res.json({ docs });
    } catch {
      res.status(500).json({ error: "Failed to list documents" });
    }
  });

  app.get("/api/docs/:id", async (req, res) => {
    try {
      const doc = await db
        .select()
        .from(schema.docs)
        .where(eq(schema.docs.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      res.json({ doc });
    } catch {
      res.status(500).json({ error: "Failed to get document" });
    }
  });

  app.post("/api/docs", async (req, res) => {
    try {
      const { title, content, category, icon, parentId } = req.body;
      const doc = {
        id: nanoid(),
        title,
        content: content ?? "",
        category: category ?? null,
        icon: icon ?? null,
        parentId: parentId ?? null,
        order: 0,
        pinned: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.docs).values(doc);
      res.status(201).json({ doc });
    } catch {
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/docs/:id", async (req, res) => {
    try {
      const { title, content, category, icon, pinned, parentId, order } = req.body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updatedAt: new Date() };

      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (category !== undefined) updates.category = category;
      if (icon !== undefined) updates.icon = icon;
      if (pinned !== undefined) updates.pinned = pinned ? 1 : 0;
      if (parentId !== undefined) updates.parentId = parentId;
      if (order !== undefined) updates.order = order;

      await db.update(schema.docs).set(updates).where(eq(schema.docs.id, req.params.id));

      const doc = await db
        .select()
        .from(schema.docs)
        .where(eq(schema.docs.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      res.json({ doc });
    } catch {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/docs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deletedDoc = await db
        .select()
        .from(schema.docs)
        .where(eq(schema.docs.id, id))
        .then((r: unknown[]) => r[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (deletedDoc) {
        await db
          .update(schema.docs)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ parentId: (deletedDoc as any).parentId, updatedAt: new Date() })
          .where(eq(schema.docs.parentId, id));
      }
      await db.delete(schema.docs).where(eq(schema.docs.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // ───────── File Routes (mocked FS) ─────────

  app.get("/api/projects/:id/files", async (req, res) => {
    try {
      const project = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Return mock file tree for testing
      res.json({
        files: [
          {
            name: "src",
            path: "src",
            type: "directory",
            children: [
              { name: "index.ts", path: "src/index.ts", type: "file", size: 256 },
              { name: "utils.ts", path: "src/utils.ts", type: "file", size: 128 },
            ],
          },
          { name: "package.json", path: "package.json", type: "file", size: 512 },
        ],
      });
    } catch {
      res.status(500).json({ error: "Failed to get file tree" });
    }
  });

  app.get("/api/projects/:id/files/content", async (req, res) => {
    try {
      const { path: filePath } = req.query;
      if (!filePath || typeof filePath !== "string") {
        return res.status(400).json({ error: "File path is required" });
      }

      const project = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectPath = (project as any).path;

      // Security: Prevent path traversal
      const absolutePath = resolve(projectPath, filePath);
      const normalizedProjectPath = resolve(projectPath);

      if (!absolutePath.startsWith(normalizedProjectPath + sep)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Mock file content for testing
      res.json({
        content: `// File: ${filePath}\nconsole.log("hello");`,
        size: 42,
        modified: new Date().toISOString(),
      });
    } catch {
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  app.put("/api/projects/:id/files/content", async (req, res) => {
    try {
      const { path: filePath } = req.query;
      const { content } = req.body;

      if (!filePath || typeof filePath !== "string") {
        return res.status(400).json({ error: "File path is required" });
      }
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Content must be a string" });
      }

      const project = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectPath = (project as any).path;

      // Security: Prevent path traversal
      const absolutePath = resolve(projectPath, filePath);
      const normalizedProjectPath = resolve(projectPath);

      if (!absolutePath.startsWith(normalizedProjectPath + sep)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Mock file save
      res.json({ success: true, size: content.length, modified: new Date().toISOString() });
    } catch {
      res.status(500).json({ error: "Failed to save file" });
    }
  });

  // ───────── Utility routes for cross-feature tests ─────────

  app.post("/api/projects", async (req, res) => {
    try {
      const { name, path, ownerId } = req.body;
      const now = new Date();
      const project = {
        id: nanoid(),
        name,
        path,
        ownerId: ownerId ?? null,
        status: "active" as const,
        lastAccessedAt: now,
        diskSizeMb: "0",
        isShallowClone: 1,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.projects).values(project);
      res.status(201).json({ project });
    } catch {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { projectId, taskId, agentId, source, content, contentType } = req.body;
      const message = {
        id: nanoid(),
        projectId,
        taskId: taskId ?? null,
        agentId: agentId ?? null,
        source,
        content,
        contentType: contentType ?? "text",
        isThinking: 0,
        createdAt: new Date(),
      };
      await db.insert(schema.messages).values(message);
      res.status(201).json({ message });
    } catch (err) {
      res.status(500).json({ error: "Failed to create message", detail: String(err) });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const { projectId, type, title, body, link } = req.body;
      const notification = {
        id: nanoid(),
        projectId: projectId ?? null,
        type,
        title,
        body: body ?? null,
        link: link ?? null,
        read: 0 as unknown as boolean,
        createdAt: new Date(),
      };
      await db.insert(schema.notifications).values(notification);
      res.status(201).json({ notification });
    } catch (err) {
      res.status(500).json({ error: "Failed to create notification", detail: String(err) });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(sqlite);
});

// ═══════════════════════════════════════════════════════════
// Journey 1: Git Configuration
// ═══════════════════════════════════════════════════════════

describe("Journey 1: Git Configuration", () => {
  it("should complete the full git config lifecycle", async () => {
    // 1. Create project
    const project = await createTestProject(db, { path: "/tmp/test-repo-git" });

    // 2. GET git config — should return null initially
    const res1 = await request(app).get(`/api/projects/${project.id}/git/config`);
    expect(res1.status).toBe(200);
    expect(res1.body).toBeNull();

    // 3. Set git config
    const configPayload = {
      remoteUrl: "https://github.com/user/repo.git",
      defaultBranch: "main",
      autoCommit: false,
      autoCreateBranch: true,
    };
    const res2 = await request(app)
      .put(`/api/projects/${project.id}/git/config`)
      .send(configPayload);
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);

    // 4. GET git config — verify config persisted
    const res3 = await request(app).get(`/api/projects/${project.id}/git/config`);
    expect(res3.status).toBe(200);
    expect(res3.body.remoteUrl).toBe("https://github.com/user/repo.git");
    expect(res3.body.defaultBranch).toBe("main");
    expect(res3.body.autoCommit).toBe(false);
    expect(res3.body.autoCreateBranch).toBe(true);

    // 5. Update git config — change autoCommit to true
    const res4 = await request(app)
      .put(`/api/projects/${project.id}/git/config`)
      .send({ ...configPayload, autoCommit: true });
    expect(res4.status).toBe(200);
    expect(res4.body.success).toBe(true);

    // 6. GET git config — verify updated
    const res5 = await request(app).get(`/api/projects/${project.id}/git/config`);
    expect(res5.status).toBe(200);
    expect(res5.body.autoCommit).toBe(true);
    expect(res5.body.autoCreateBranch).toBe(true);

    // 7. Save git credentials
    const res6 = await request(app)
      .put(`/api/projects/${project.id}/git/credentials`)
      .send({ type: "https", token: "ghp_xxx123" });
    expect(res6.status).toBe(200);
    expect(res6.body.success).toBe(true);

    // 8. Verify credentials stored encrypted
    const integrations = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, project.id),
          eq(schema.integrations.type, "git"),
        ),
      );
    expect(integrations).toHaveLength(1);
    const creds = integrations[0].credentials;
    expect(creds).toBeTruthy();
    // Must be encrypted format (iv:authTag:data)
    expect(creds!.split(":")).toHaveLength(3);
    // Decrypt and verify
    const decrypted = JSON.parse(decrypt(creds!));
    expect(decrypted.type).toBe("https");
    expect(decrypted.token).toBe("ghp_xxx123");
  });

  it("should validate SSH credentials require sshKeyPath", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-repo-ssh" });

    const res = await request(app)
      .put(`/api/projects/${project.id}/git/credentials`)
      .send({ type: "ssh" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("SSH key path");
  });

  it("should validate HTTPS credentials require token", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-repo-https" });

    const res = await request(app)
      .put(`/api/projects/${project.id}/git/credentials`)
      .send({ type: "https" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Token is required");
  });

  it("should create integration record when saving credentials without prior config", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-repo-cred-first" });

    // Save credentials before setting config
    const res = await request(app)
      .put(`/api/projects/${project.id}/git/credentials`)
      .send({ type: "https", token: "ghp_new_token" });
    expect(res.status).toBe(200);

    // Integration should exist with default config
    const config = await request(app).get(`/api/projects/${project.id}/git/config`);
    expect(config.status).toBe(200);
    expect(config.body.defaultBranch).toBe("main");
    expect(config.body.authMethod).toBe("https");
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 2: Integration Management (WhatsApp/Telegram records)
// ═══════════════════════════════════════════════════════════

describe("Journey 2: Integration Management", () => {
  it("should manage WhatsApp and Telegram integration records", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-int-project" });

    // 1. Create WhatsApp integration
    const res1 = await request(app).post("/api/integrations").send({
      projectId: project.id,
      type: "whatsapp",
      config: { allowedNumber: "+5511999999999" },
      status: "disconnected",
    });
    expect(res1.status).toBe(201);
    expect(res1.body.integration.type).toBe("whatsapp");
    const waId = res1.body.integration.id;

    // 2. Create Telegram integration
    const res2 = await request(app).post("/api/integrations").send({
      projectId: project.id,
      type: "telegram",
      config: { botName: "MyTestBot" },
      status: "connected",
    });
    expect(res2.status).toBe(201);
    expect(res2.body.integration.type).toBe("telegram");
    const tgId = res2.body.integration.id;

    // 3. List integrations by projectId — verify both
    const res3 = await request(app).get(`/api/integrations?projectId=${project.id}`);
    expect(res3.status).toBe(200);
    expect(res3.body.integrations).toHaveLength(2);
    const types = res3.body.integrations.map((i: { type: string }) => i.type);
    expect(types).toContain("whatsapp");
    expect(types).toContain("telegram");

    // 4. Update WhatsApp status to connected
    const res4 = await request(app)
      .patch(`/api/integrations/${waId}`)
      .send({ status: "connected" });
    expect(res4.status).toBe(200);
    expect(res4.body.integration.status).toBe("connected");

    // 5. Update WhatsApp config
    const res5 = await request(app)
      .patch(`/api/integrations/${waId}`)
      .send({ config: { allowedNumber: "+5511888888888" } });
    expect(res5.status).toBe(200);
    const updatedConfig = JSON.parse(res5.body.integration.config);
    expect(updatedConfig.allowedNumber).toBe("+5511888888888");

    // 6. Delete Telegram integration
    const res6 = await request(app).delete(`/api/integrations/${tgId}`);
    expect(res6.status).toBe(200);
    expect(res6.body.success).toBe(true);

    // Verify only WhatsApp remains
    const res7 = await request(app).get(`/api/integrations?projectId=${project.id}`);
    expect(res7.body.integrations).toHaveLength(1);
    expect(res7.body.integrations[0].type).toBe("whatsapp");
  });

  it("should require projectId and type for creating integrations", async () => {
    const res = await request(app).post("/api/integrations").send({ type: "whatsapp" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("projectId and type are required");
  });

  it("should return 404 when deleting non-existent integration", async () => {
    const res = await request(app).delete("/api/integrations/non-existent-id");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 3: Workflow CRUD + Default Workflow
// ═══════════════════════════════════════════════════════════

describe("Journey 3: Workflow CRUD + Default Workflow", () => {
  it("should complete the full workflow lifecycle", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-wf-project" });

    // 1. List workflows — empty initially
    const res1 = await request(app).get(`/api/workflows?projectId=${project.id}`);
    expect(res1.status).toBe(200);
    expect(res1.body.workflows).toHaveLength(0);

    // 2. Create workflow — Standard Dev Flow
    const nodes1 = [
      { id: "1", type: "tech_lead", label: "Triage" },
      { id: "2", type: "developer", label: "Code" },
      { id: "3", type: "qa", label: "Review" },
    ];
    const edges1 = [
      { source: "1", target: "2" },
      { source: "2", target: "3" },
    ];
    const res2 = await request(app).post("/api/workflows").send({
      projectId: project.id,
      name: "Standard Dev Flow",
      description: "Standard development workflow",
      nodes: nodes1,
      edges: edges1,
      isDefault: true,
    });
    expect(res2.status).toBe(201);
    expect(res2.body.workflow.name).toBe("Standard Dev Flow");
    expect(res2.body.workflow.isDefault).toBe(true);
    expect(res2.body.workflow.nodes).toHaveLength(3);
    expect(res2.body.workflow.edges).toHaveLength(2);
    const wfId1 = res2.body.workflow.id;

    // 3. Get workflow by ID — verify nodes/edges parsed
    const res3 = await request(app).get(`/api/workflows/${wfId1}`);
    expect(res3.status).toBe(200);
    expect(res3.body.workflow.nodes).toEqual(nodes1);
    expect(res3.body.workflow.edges).toEqual(edges1);

    // 4. Create 2nd workflow — Fast Track
    const nodes2 = [
      { id: "1", type: "developer", label: "Code & Review" },
    ];
    const res4 = await request(app).post("/api/workflows").send({
      projectId: project.id,
      name: "Fast Track",
      nodes: nodes2,
      edges: [],
      isDefault: false,
    });
    expect(res4.status).toBe(201);
    const wfId2 = res4.body.workflow.id;

    // 5. List workflows — verify both returned
    const res5 = await request(app).get(`/api/workflows?projectId=${project.id}`);
    expect(res5.status).toBe(200);
    expect(res5.body.workflows).toHaveLength(2);

    // 6. List by projectId — filtering works
    const otherProject = await createTestProject(db, { path: "/tmp/test-wf-other" });
    const res6a = await request(app).get(`/api/workflows?projectId=${otherProject.id}`);
    expect(res6a.body.workflows).toHaveLength(0);

    // 7. Set default — change default to Fast Track
    const res7 = await request(app).post(`/api/workflows/${wfId2}/set-default`);
    expect(res7.status).toBe(200);
    expect(res7.body.workflow.isDefault).toBe(true);

    // Verify old default is unset
    const res7b = await request(app).get(`/api/workflows/${wfId1}`);
    // SQLite stores isDefault as 0/1 — the get endpoint parses it
    expect(res7b.body.workflow.isDefault).toBeFalsy();

    // 8. Update workflow — change name, add node
    const updatedNodes = [
      ...nodes2,
      { id: "2", type: "qa", label: "Final Review" },
    ];
    const res8 = await request(app).put(`/api/workflows/${wfId2}`).send({
      name: "Fast Track v2",
      nodes: updatedNodes,
    });
    expect(res8.status).toBe(200);
    expect(res8.body.workflow.name).toBe("Fast Track v2");
    expect(res8.body.workflow.nodes).toHaveLength(2);

    // 9. Delete workflow — verify removed
    const res9 = await request(app).delete(`/api/workflows/${wfId1}`);
    expect(res9.status).toBe(200);
    expect(res9.body.success).toBe(true);

    const res10 = await request(app).get(`/api/workflows?projectId=${project.id}`);
    expect(res10.body.workflows).toHaveLength(1);
    expect(res10.body.workflows[0].id).toBe(wfId2);
  });

  it("should require projectId and name for creating workflows", async () => {
    const res = await request(app).post("/api/workflows").send({ name: "No Project" });
    expect(res.status).toBe(400);
  });

  it("should return 404 for non-existent workflow", async () => {
    const res = await request(app).get("/api/workflows/non-existent");
    expect(res.status).toBe(404);
  });

  it("should return 404 when setting default on non-existent workflow", async () => {
    const res = await request(app).post("/api/workflows/non-existent/set-default");
    expect(res.status).toBe(404);
  });

  it("should return 404 when deleting non-existent workflow", async () => {
    const res = await request(app).delete("/api/workflows/non-existent");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 4: Docs Management
// ═══════════════════════════════════════════════════════════

describe("Journey 4: Docs Management", () => {
  it("should complete the full docs lifecycle", async () => {
    // 1. Create doc
    const res1 = await request(app).post("/api/docs").send({
      title: "API Reference",
      content: "# API\n\nEndpoints documentation.",
      category: "technical",
      icon: "book",
    });
    expect(res1.status).toBe(201);
    expect(res1.body.doc.title).toBe("API Reference");
    const docId = res1.body.doc.id;

    // 2. List docs — verify listed
    const res2 = await request(app).get("/api/docs");
    expect(res2.status).toBe(200);
    expect(res2.body.docs).toHaveLength(1);
    expect(res2.body.docs[0].title).toBe("API Reference");

    // 3. Get doc by ID — verify content
    const res3 = await request(app).get(`/api/docs/${docId}`);
    expect(res3.status).toBe(200);
    expect(res3.body.doc.content).toContain("# API");
    expect(res3.body.doc.category).toBe("technical");
    expect(res3.body.doc.icon).toBe("book");

    // 4. Update doc — change content
    const res4 = await request(app).patch(`/api/docs/${docId}`).send({
      content: "# API v2\n\nUpdated endpoints documentation.",
      pinned: true,
    });
    expect(res4.status).toBe(200);
    expect(res4.body.doc.content).toContain("v2");

    // 5. Delete doc — verify removed
    const res5 = await request(app).delete(`/api/docs/${docId}`);
    expect(res5.status).toBe(200);
    expect(res5.body.success).toBe(true);

    const res6 = await request(app).get("/api/docs");
    expect(res6.body.docs).toHaveLength(0);
  });

  it("should return 404 for non-existent doc", async () => {
    const res = await request(app).get("/api/docs/non-existent");
    expect(res.status).toBe(404);
  });

  it("should support parent-child doc relationships", async () => {
    // Create parent
    const parent = await request(app).post("/api/docs").send({
      title: "Parent Doc",
      content: "Parent content",
    });
    const parentId = parent.body.doc.id;

    // Create child
    const child = await request(app).post("/api/docs").send({
      title: "Child Doc",
      content: "Child content",
      parentId,
    });
    expect(child.body.doc.parentId).toBe(parentId);

    // Delete parent — children should be re-parented to parent's parent (null)
    await request(app).delete(`/api/docs/${parentId}`);

    const updatedChild = await request(app).get(`/api/docs/${child.body.doc.id}`);
    expect(updatedChild.body.doc.parentId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 5: File Operations (Mocked FS)
// ═══════════════════════════════════════════════════════════

describe("Journey 5: File Operations (Mocked FS)", () => {
  it("should return file tree for a project", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-project" });

    const res = await request(app).get(`/api/projects/${project.id}/files`);
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(2);

    // Directory first
    expect(res.body.files[0].type).toBe("directory");
    expect(res.body.files[0].name).toBe("src");
    expect(res.body.files[0].children).toHaveLength(2);

    // File second
    expect(res.body.files[1].type).toBe("file");
    expect(res.body.files[1].name).toBe("package.json");
  });

  it("should retrieve file content", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-content" });

    const res = await request(app)
      .get(`/api/projects/${project.id}/files/content`)
      .query({ path: "src/index.ts" });
    expect(res.status).toBe(200);
    expect(res.body.content).toContain("src/index.ts");
    expect(res.body.size).toBeDefined();
  });

  it("should save file content", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-save" });

    const res = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .query({ path: "src/index.ts" })
      .send({ content: "const x = 42;" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.size).toBe("const x = 42;".length);
  });

  it("should reject path traversal attempts", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-security" });

    // Attempt path traversal
    const res = await request(app)
      .get(`/api/projects/${project.id}/files/content`)
      .query({ path: "../../etc/passwd" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("should reject path traversal on write operations", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-security-write" });

    const res = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .query({ path: "../../../etc/shadow" })
      .send({ content: "malicious content" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("should require file path parameter", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-nopath" });

    const res = await request(app).get(`/api/projects/${project.id}/files/content`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("File path is required");
  });

  it("should require content to be a string for write", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-files-nocontent" });

    const res = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .query({ path: "src/index.ts" })
      .send({ content: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Content must be a string");
  });

  it("should return 404 for non-existent project", async () => {
    const res = await request(app).get("/api/projects/fake-id/files");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 6: PR Management (Database-level)
// ═══════════════════════════════════════════════════════════

describe("Journey 6: PR Management (Database-level)", () => {
  it("should track PRs through task branches and git integrations", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-pr-project" });
    const agent = await createTestAgent(db);

    // Create a task with a branch (simulating PR flow)
    const task = await createTestTask(db, project.id, {
      assignedAgentId: agent.id,
      title: "Implement feature X",
      branch: "feature/x",
      status: "in_progress",
    });

    // Verify task has branch
    const tasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task.id));
    expect(tasks[0].branch).toBe("feature/x");

    // Create task logs simulating PR lifecycle
    await createTestTaskLog(db, task.id, {
      action: "branch_created",
      detail: "Created branch feature/x",
    });
    await createTestTaskLog(db, task.id, {
      action: "status_change",
      fromStatus: "in_progress",
      toStatus: "review",
      detail: "PR submitted for review",
    });

    // Query task logs
    const logs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, task.id));
    expect(logs).toHaveLength(2);
    expect(logs.some((l: { action: string }) => l.action === "branch_created")).toBe(true);
    expect(logs.some((l: { action: string }) => l.action === "status_change")).toBe(true);
  });

  it("should filter tasks by branch", async () => {
    const project = await createTestProject(db, { path: "/tmp/test-pr-filter" });

    await createTestTask(db, project.id, { branch: "feature/a", title: "Task A" });
    await createTestTask(db, project.id, { branch: "feature/b", title: "Task B" });
    await createTestTask(db, project.id, { title: "Task C" }); // no branch

    const tasksWithBranch = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, project.id));

    const withBranches = tasksWithBranch.filter((t: { branch: string | null }) => t.branch !== null);
    expect(withBranches).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Journey 7: Cross-Feature Integration
// ═══════════════════════════════════════════════════════════

describe("Journey 7: Cross-Feature Integration", () => {
  it("should complete a full user workflow across all features", async () => {
    // 1. Create user + Free plan
    const planId = nanoid();
    await db.insert(schema.plans).values({
      id: planId,
      name: "Free",
      description: "Free plan",
      maxProjects: 5,
      maxTasksPerMonth: 100,
      priceMonthly: "0",
      features: JSON.stringify(["basic"]),
      maxStorageMb: 500,
      repoTtlDays: 30,
      isDefault: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const userId = nanoid();
    await db.insert(schema.users).values({
      id: userId,
      githubId: 123456,
      login: "testuser",
      name: "Test User",
      email: "test@example.com",
      role: "user",
      planId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Create project with ownerId
    const projectRes = await request(app).post("/api/projects").send({
      name: "Cross Feature Project",
      path: "/tmp/cross-feature-project",
      ownerId: userId,
    });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.project.id;

    // 3. Set git config for project
    const gitRes = await request(app).put(`/api/projects/${projectId}/git/config`).send({
      remoteUrl: "https://github.com/test/cross-feature.git",
      defaultBranch: "main",
      autoCommit: true,
      autoCreateBranch: true,
    });
    expect(gitRes.body.success).toBe(true);

    // 4. Create agent assigned to project
    const agent = await createTestAgent(db, { name: "DevBot" });
    await db.insert(schema.agentProjectConfigs).values({
      id: nanoid(),
      agentId: agent.id,
      projectId,
      isEnabled: 1,
    });

    // 5. Create workflow for project (default)
    const wfRes = await request(app).post("/api/workflows").send({
      projectId,
      name: "Default Flow",
      nodes: [
        { id: "1", type: "tech_lead", label: "Assign" },
        { id: "2", type: "developer", label: "Develop" },
      ],
      edges: [{ source: "1", target: "2" }],
      isDefault: true,
    });
    expect(wfRes.status).toBe(201);

    // 6. Create task in project
    const task = await createTestTask(db, projectId, {
      assignedAgentId: agent.id,
      title: "Implement login feature",
      branch: "feature/login",
      status: "in_progress",
    });

    // 7. Add messages to task (user message + agent response)
    const msg1 = await request(app).post("/api/messages").send({
      projectId,
      taskId: task.id,
      source: "user",
      content: "Please implement the login feature",
    });
    expect(msg1.status).toBe(201);

    const msg2 = await request(app).post("/api/messages").send({
      projectId,
      taskId: task.id,
      agentId: agent.id,
      source: "agent",
      content: "I will implement the login feature using JWT authentication.",
    });
    expect(msg2.status).toBe(201);

    // 8. Create task_log entries for status transitions
    await createTestTaskLog(db, task.id, {
      agentId: agent.id,
      action: "status_change",
      fromStatus: "created",
      toStatus: "assigned",
      detail: "Assigned to DevBot",
    });
    await createTestTaskLog(db, task.id, {
      agentId: agent.id,
      action: "status_change",
      fromStatus: "assigned",
      toStatus: "in_progress",
      detail: "Agent started working",
    });

    // 9. Create notification for task completion
    const notifRes = await request(app).post("/api/notifications").send({
      projectId,
      type: "task_update",
      title: "Task In Progress",
      body: `Agent DevBot started working on "${task.title}"`,
      link: `/project/${projectId}/tasks`,
    });
    expect(notifRes.status).toBe(201);

    // 10. Verify all data consistent across queries

    // Check project exists with git config
    const gitConfig = await request(app).get(`/api/projects/${projectId}/git/config`);
    expect(gitConfig.body.remoteUrl).toBe("https://github.com/test/cross-feature.git");

    // Check workflow exists
    const workflows = await request(app).get(`/api/workflows?projectId=${projectId}`);
    expect(workflows.body.workflows).toHaveLength(1);
    expect(workflows.body.workflows[0].isDefault).toBeTruthy();

    // Check messages for the task
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.taskId, task.id));
    expect(messages).toHaveLength(2);
    expect(messages.some((m: { source: string }) => m.source === "user")).toBe(true);
    expect(messages.some((m: { source: string }) => m.source === "agent")).toBe(true);

    // Check task logs — full audit trail
    const taskLogs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, task.id));
    expect(taskLogs).toHaveLength(2);

    // Check notification
    const notifications = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.projectId, projectId));
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("task_update");
    expect(notifications[0].read).toBe(0);

    // Check agent-project config
    const agentConfigs = await db
      .select()
      .from(schema.agentProjectConfigs)
      .where(eq(schema.agentProjectConfigs.projectId, projectId));
    expect(agentConfigs).toHaveLength(1);
    expect(agentConfigs[0].agentId).toBe(agent.id);

    // Check user plan association
    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .then((r: unknown[]) => r[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((user as any).planId).toBe(planId);
  });

  it("should isolate data between projects", async () => {
    const project1 = await createTestProject(db, { path: "/tmp/iso-project-1" });
    const project2 = await createTestProject(db, { path: "/tmp/iso-project-2" });

    // Create tasks in different projects
    await createTestTask(db, project1.id, { title: "Task in P1" });
    await createTestTask(db, project1.id, { title: "Another task in P1" });
    await createTestTask(db, project2.id, { title: "Task in P2" });

    // Create integrations for different projects
    await request(app).post("/api/integrations").send({
      projectId: project1.id,
      type: "whatsapp",
      status: "connected",
    });
    await request(app).post("/api/integrations").send({
      projectId: project2.id,
      type: "telegram",
      status: "disconnected",
    });

    // Create workflows for different projects
    await request(app).post("/api/workflows").send({
      projectId: project1.id,
      name: "P1 Flow",
      nodes: [],
      edges: [],
    });
    await request(app).post("/api/workflows").send({
      projectId: project2.id,
      name: "P2 Flow A",
      nodes: [],
      edges: [],
    });
    await request(app).post("/api/workflows").send({
      projectId: project2.id,
      name: "P2 Flow B",
      nodes: [],
      edges: [],
    });

    // Verify isolation — project1 tasks
    const p1Tasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, project1.id));
    expect(p1Tasks).toHaveLength(2);

    // Verify isolation — project2 tasks
    const p2Tasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, project2.id));
    expect(p2Tasks).toHaveLength(1);

    // Verify isolation — integrations
    const p1Int = await request(app).get(`/api/integrations?projectId=${project1.id}`);
    expect(p1Int.body.integrations).toHaveLength(1);
    expect(p1Int.body.integrations[0].type).toBe("whatsapp");

    const p2Int = await request(app).get(`/api/integrations?projectId=${project2.id}`);
    expect(p2Int.body.integrations).toHaveLength(1);
    expect(p2Int.body.integrations[0].type).toBe("telegram");

    // Verify isolation — workflows
    const p1Wf = await request(app).get(`/api/workflows?projectId=${project1.id}`);
    expect(p1Wf.body.workflows).toHaveLength(1);

    const p2Wf = await request(app).get(`/api/workflows?projectId=${project2.id}`);
    expect(p2Wf.body.workflows).toHaveLength(2);
  });

  it("should handle task state machine transitions with logs", async () => {
    const project = await createTestProject(db, { path: "/tmp/state-machine" });
    const agent = await createTestAgent(db);

    const task = await createTestTask(db, project.id, {
      assignedAgentId: agent.id,
      status: "created",
    });

    // Simulate full state machine: created → assigned → in_progress → review → done
    const transitions = [
      { from: "created", to: "assigned", action: "assign", detail: "Assigned to agent" },
      { from: "assigned", to: "in_progress", action: "start", detail: "Agent started" },
      { from: "in_progress", to: "review", action: "submit", detail: "PR submitted" },
      { from: "review", to: "done", action: "approve", detail: "PR approved" },
    ];

    for (const t of transitions) {
      await createTestTaskLog(db, task.id, {
        agentId: agent.id,
        action: t.action,
        fromStatus: t.from,
        toStatus: t.to,
        detail: t.detail,
      });
    }

    // Update task to final state
    await db.update(schema.tasks).set({
      status: "done",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, task.id));

    // Verify full audit trail
    const logs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, task.id));
    expect(logs).toHaveLength(4);
    expect(logs[0].fromStatus).toBe("created");
    expect(logs[logs.length - 1].toStatus).toBe("done");

    // Verify task is completed
    const finalTask = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task.id))
      .then((r: unknown[]) => r[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((finalTask as any).status).toBe("done");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((finalTask as any).completedAt).toBeTruthy();
  });

  it("should handle review rejection with re-assignment", async () => {
    const project = await createTestProject(db, { path: "/tmp/rejection-flow" });
    const agent = await createTestAgent(db);

    const task = await createTestTask(db, project.id, {
      assignedAgentId: agent.id,
      status: "review",
    });

    // Reject back to assigned
    await createTestTaskLog(db, task.id, {
      agentId: agent.id,
      action: "reject",
      fromStatus: "review",
      toStatus: "assigned",
      detail: "Needs more tests",
    });

    // Update task status
    await db.update(schema.tasks).set({
      status: "assigned",
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, task.id));

    // Re-submit
    await createTestTaskLog(db, task.id, {
      agentId: agent.id,
      action: "resubmit",
      fromStatus: "assigned",
      toStatus: "in_progress",
      detail: "Adding tests",
    });

    const logs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, task.id));
    expect(logs).toHaveLength(2);
    expect(logs[0].detail).toContain("Needs more tests");
  });
});
