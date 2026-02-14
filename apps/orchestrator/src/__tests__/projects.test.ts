import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb, createTestProject } from "../test/helpers";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@agenthub/database";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

let testDb: LibSQLDatabase<typeof schema>;
let testClient: Client;
let app: express.Express;

beforeAll(async () => {
  const { db, client } = await createTestDb();
  testDb = db;
  testClient = client;

  app = express();
  app.use(express.json());

  app.get("/api/projects", async (_req, res) => {
    const projects = await testDb
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt));
    res.json({ projects });
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project });
  });

  app.post("/api/projects", async (req, res) => {
    const { name, path, stack, icon, description } = req.body;
    const project = {
      id: nanoid(),
      name,
      path,
      stack: JSON.stringify(stack ?? []),
      icon: icon ?? null,
      description: description ?? null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.insert(schema.projects).values(project);
    res.status(201).json({ project });
  });

  app.patch("/api/projects/:id", async (req, res) => {
    const { name, description, status } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    await testDb
      .update(schema.projects)
      .set(updates)
      .where(eq(schema.projects.id, req.params.id));
    const project = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();
    res.json({ project });
  });

  app.delete("/api/projects/:id", async (req, res) => {
    await testDb.delete(schema.projects).where(eq(schema.projects.id, req.params.id));
    res.json({ success: true });
  });
});

beforeEach(async () => {
  await testClient.execute("DELETE FROM task_logs");
  await testClient.execute("DELETE FROM messages");
  await testClient.execute("DELETE FROM tasks");
  await testClient.execute("DELETE FROM agent_project_configs");
  await testClient.execute("DELETE FROM integrations");
  await testClient.execute("DELETE FROM agents");
  await testClient.execute("DELETE FROM projects");
});

describe("Projects API", () => {
  describe("GET /api/projects", () => {
    it("returns empty list when no projects exist", async () => {
      const res = await request(app).get("/api/projects");

      expect(res.status).toBe(200);
      expect(res.body.projects).toEqual([]);
    });

    it("returns all projects", async () => {
      await createTestProject(testDb, { name: "Project A" });
      await createTestProject(testDb, { name: "Project B" });

      const res = await request(app).get("/api/projects");

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns a specific project", async () => {
      const project = await createTestProject(testDb, { name: "My Project" });

      const res = await request(app).get(`/api/projects/${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("My Project");
      expect(res.body.project.id).toBe(project.id);
    });

    it("returns 404 for non-existent project", async () => {
      const res = await request(app).get("/api/projects/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Project not found");
    });
  });

  describe("POST /api/projects", () => {
    it("creates a new project", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "New Project", path: "/tmp/new-project" });

      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe("New Project");
      expect(res.body.project.path).toBe("/tmp/new-project");
      expect(res.body.project.id).toBeDefined();
    });

    it("creates project with optional fields", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({
          name: "Full Project",
          path: "/tmp/full-project",
          stack: ["react", "typescript"],
          description: "A full project",
          icon: "rocket",
        });

      expect(res.status).toBe(201);
      expect(res.body.project.description).toBe("A full project");
      expect(res.body.project.icon).toBe("rocket");
      expect(JSON.parse(res.body.project.stack)).toEqual(["react", "typescript"]);
    });
  });

  describe("PATCH /api/projects/:id", () => {
    it("updates project name", async () => {
      const project = await createTestProject(testDb, { name: "Old Name" });

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("New Name");
    });

    it("updates project status", async () => {
      const project = await createTestProject(testDb);

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ status: "archived" });

      expect(res.status).toBe(200);
      expect(res.body.project.status).toBe("archived");
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deletes a project", async () => {
      const project = await createTestProject(testDb);

      const res = await request(app).delete(`/api/projects/${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const getRes = await request(app).get(`/api/projects/${project.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
