import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  cleanTestDb,
} from "../../test/helpers";
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

  // ---- Replicate project routes against test DB (no auth) ----

  app.get("/api/projects", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const projects = await testDb
        .select()
        .from(schema.projects)
        .orderBy(desc(schema.projects.updatedAt))
        .limit(limit)
        .offset(offset);
      res.json({ projects });
    } catch (error) {
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .get();
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json({ project });
    } catch (error) {
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await testDb.delete(schema.projects).where(eq(schema.projects.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testClient);
});

describe("Projects Routes — Integration", () => {
  // ---- GET /api/projects ----
  describe("GET /api/projects", () => {
    it("returns empty list when no projects exist", async () => {
      const res = await request(app).get("/api/projects");

      expect(res.status).toBe(200);
      expect(res.body.projects).toEqual([]);
    });

    it("returns project list", async () => {
      await createTestProject(testDb, { name: "Project A" });
      await createTestProject(testDb, { name: "Project B" });

      const res = await request(app).get("/api/projects");

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
    });

    it("respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createTestProject(testDb, { name: `Project ${i}` });
      }

      const res = await request(app).get("/api/projects?limit=2");

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
    });

    it("respects offset parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createTestProject(testDb, { name: `Project ${i}` });
      }

      const allRes = await request(app).get("/api/projects?limit=100");
      const offsetRes = await request(app).get("/api/projects?limit=100&offset=3");

      expect(allRes.body.projects).toHaveLength(5);
      expect(offsetRes.body.projects).toHaveLength(2);
    });
  });

  // ---- GET /api/projects/:id ----
  describe("GET /api/projects/:id", () => {
    it("returns project detail", async () => {
      const project = await createTestProject(testDb, { name: "My Project", description: "desc" });

      const res = await request(app).get(`/api/projects/${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("My Project");
      expect(res.body.project.description).toBe("desc");
      expect(res.body.project.id).toBe(project.id);
    });

    it("returns 404 for unknown project", async () => {
      const res = await request(app).get("/api/projects/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Project not found");
    });
  });

  // ---- POST /api/projects ----
  describe("POST /api/projects", () => {
    it("creates a project", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "New Project", path: "/tmp/new-project" });

      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe("New Project");
      expect(res.body.project.path).toBe("/tmp/new-project");
      expect(res.body.project.status).toBe("active");
      expect(res.body.project.id).toBeDefined();
    });

    it("creates a project with optional fields", async () => {
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

    it("defaults stack to empty array when not provided", async () => {
      const res = await request(app)
        .post("/api/projects")
        .send({ name: "Minimal", path: "/tmp/minimal" });

      expect(res.status).toBe(201);
      expect(JSON.parse(res.body.project.stack)).toEqual([]);
    });
  });

  // ---- PATCH /api/projects/:id ----
  describe("PATCH /api/projects/:id", () => {
    it("updates project name", async () => {
      const project = await createTestProject(testDb, { name: "Old Name" });

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("New Name");
    });

    it("updates project description", async () => {
      const project = await createTestProject(testDb);

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ description: "New description" });

      expect(res.status).toBe(200);
      expect(res.body.project.description).toBe("New description");
    });

    it("updates project status", async () => {
      const project = await createTestProject(testDb);

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ status: "archived" });

      expect(res.status).toBe(200);
      expect(res.body.project.status).toBe("archived");
    });

    it("updates multiple fields at once", async () => {
      const project = await createTestProject(testDb, { name: "Old" });

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ name: "New", description: "Updated desc", status: "archived" });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe("New");
      expect(res.body.project.description).toBe("Updated desc");
      expect(res.body.project.status).toBe("archived");
    });
  });

  // ---- DELETE /api/projects/:id ----
  describe("DELETE /api/projects/:id", () => {
    it("deletes a project", async () => {
      const project = await createTestProject(testDb);

      const res = await request(app).delete(`/api/projects/${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const getRes = await request(app).get(`/api/projects/${project.id}`);
      expect(getRes.status).toBe(404);
    });

    it("succeeds even if project does not exist (idempotent)", async () => {
      const res = await request(app).delete("/api/projects/nonexistent");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
