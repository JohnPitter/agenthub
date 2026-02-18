import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestWorkflow,
  cleanTestDb,
} from "../../test/helpers";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@agenthub/database";
import { eq, and, desc } from "drizzle-orm";
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

  // ---- Replicate workflow routes against test DB (no auth) ----

  app.get("/api/workflows", async (req, res) => {
    try {
      const { projectId } = req.query;
      const conditions: ReturnType<typeof eq>[] = [];
      if (projectId) conditions.push(eq(schema.workflows.projectId, projectId as string));

      const workflows = await testDb
        .select()
        .from(schema.workflows)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.workflows.createdAt));

      const parsed = workflows.map((w) => ({
        ...w,
        nodes: JSON.parse(w.nodes),
        edges: JSON.parse(w.edges),
      }));

      res.json({ workflows: parsed });
    } catch (error) {
      res.status(500).json({ error: "Failed to list workflows" });
    }
  });

  app.get("/api/workflows/:id", async (req, res) => {
    try {
      const workflow = await testDb
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .get();

      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      res.json({
        workflow: {
          ...workflow,
          nodes: JSON.parse(workflow.nodes),
          edges: JSON.parse(workflow.edges),
        },
      });
    } catch (error) {
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
        await testDb
          .update(schema.workflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(schema.workflows.projectId, projectId), eq(schema.workflows.isDefault, true)));
      }

      const workflow = {
        id,
        projectId,
        name,
        description: description ?? null,
        nodes: JSON.stringify(nodes ?? []),
        edges: JSON.stringify(edges ?? []),
        isDefault: isDefault ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await testDb.insert(schema.workflows).values(workflow);

      res.status(201).json({
        workflow: {
          ...workflow,
          nodes: nodes ?? [],
          edges: edges ?? [],
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });

  app.put("/api/workflows/:id", async (req, res) => {
    try {
      const existing = await testDb
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .get();

      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      const { name, description, nodes, edges, isDefault } = req.body;

      if (isDefault && !existing.isDefault) {
        await testDb
          .update(schema.workflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(schema.workflows.projectId, existing.projectId), eq(schema.workflows.isDefault, true)));
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (nodes !== undefined) updates.nodes = JSON.stringify(nodes);
      if (edges !== undefined) updates.edges = JSON.stringify(edges);
      if (isDefault !== undefined) updates.isDefault = isDefault;

      await testDb.update(schema.workflows).set(updates).where(eq(schema.workflows.id, req.params.id));

      const updated = await testDb
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .get();

      res.json({
        workflow: updated
          ? { ...updated, nodes: JSON.parse(updated.nodes), edges: JSON.parse(updated.edges) }
          : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update workflow" });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      const existing = await testDb
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .get();

      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      await testDb.delete(schema.workflows).where(eq(schema.workflows.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workflow" });
    }
  });

  app.post("/api/workflows/:id/set-default", async (req, res) => {
    try {
      const workflow = await testDb
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, req.params.id))
        .get();

      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      await testDb
        .update(schema.workflows)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(schema.workflows.projectId, workflow.projectId), eq(schema.workflows.isDefault, true)));

      await testDb
        .update(schema.workflows)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(schema.workflows.id, req.params.id));

      res.json({
        workflow: {
          ...workflow,
          isDefault: true,
          nodes: JSON.parse(workflow.nodes),
          edges: JSON.parse(workflow.edges),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to set default workflow" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testClient);
});

describe("Workflows Routes — Integration", () => {
  let project: Awaited<ReturnType<typeof createTestProject>>;

  beforeEach(async () => {
    project = await createTestProject(testDb);
  });

  // ---- GET /api/workflows ----
  describe("GET /api/workflows", () => {
    it("returns workflow list for a project", async () => {
      await createTestWorkflow(testDb, project.id, { name: "Workflow A" });
      await createTestWorkflow(testDb, project.id, { name: "Workflow B" });

      const res = await request(app).get(`/api/workflows?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.workflows).toHaveLength(2);
    });

    it("returns empty list when no workflows exist", async () => {
      const res = await request(app).get(`/api/workflows?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.workflows).toEqual([]);
    });

    it("filters by projectId", async () => {
      const otherProject = await createTestProject(testDb, { name: "Other" });
      await createTestWorkflow(testDb, project.id, { name: "WF A" });
      await createTestWorkflow(testDb, otherProject.id, { name: "WF B" });

      const res = await request(app).get(`/api/workflows?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.workflows).toHaveLength(1);
      expect(res.body.workflows[0].name).toBe("WF A");
    });

    it("parses JSON nodes and edges", async () => {
      const nodes = [{ id: "n1", type: "start", data: {} }];
      const edges = [{ id: "e1", source: "n1", target: "n2" }];
      await createTestWorkflow(testDb, project.id, {
        name: "With Nodes",
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
      });

      const res = await request(app).get(`/api/workflows?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.workflows[0].nodes).toEqual(nodes);
      expect(res.body.workflows[0].edges).toEqual(edges);
    });

    it("returns all workflows when no projectId filter", async () => {
      const otherProject = await createTestProject(testDb, { name: "Other" });
      await createTestWorkflow(testDb, project.id, { name: "WF A" });
      await createTestWorkflow(testDb, otherProject.id, { name: "WF B" });

      const res = await request(app).get("/api/workflows");

      expect(res.status).toBe(200);
      expect(res.body.workflows).toHaveLength(2);
    });
  });

  // ---- POST /api/workflows ----
  describe("POST /api/workflows", () => {
    it("creates a workflow with nodes and edges", async () => {
      const nodes = [{ id: "start", type: "start" }];
      const edges = [{ id: "e1", source: "start", target: "end" }];

      const res = await request(app)
        .post("/api/workflows")
        .send({
          projectId: project.id,
          name: "My Workflow",
          description: "Test workflow",
          nodes,
          edges,
        });

      expect(res.status).toBe(201);
      expect(res.body.workflow.name).toBe("My Workflow");
      expect(res.body.workflow.description).toBe("Test workflow");
      expect(res.body.workflow.nodes).toEqual(nodes);
      expect(res.body.workflow.edges).toEqual(edges);
      expect(res.body.workflow.id).toBeDefined();
    });

    it("creates a workflow with defaults for optional fields", async () => {
      const res = await request(app)
        .post("/api/workflows")
        .send({ projectId: project.id, name: "Minimal" });

      expect(res.status).toBe(201);
      expect(res.body.workflow.nodes).toEqual([]);
      expect(res.body.workflow.edges).toEqual([]);
      expect(res.body.workflow.isDefault).toBe(false);
    });

    it("returns 400 when projectId is missing", async () => {
      const res = await request(app)
        .post("/api/workflows")
        .send({ name: "No Project" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("projectId and name are required");
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/workflows")
        .send({ projectId: project.id });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("projectId and name are required");
    });

    it("clears previous default when creating with isDefault=true", async () => {
      await createTestWorkflow(testDb, project.id, { name: "Old Default", isDefault: true });

      const res = await request(app)
        .post("/api/workflows")
        .send({ projectId: project.id, name: "New Default", isDefault: true });

      expect(res.status).toBe(201);
      expect(res.body.workflow.isDefault).toBe(true);

      // Verify old default was unset
      const listRes = await request(app).get(`/api/workflows?projectId=${project.id}`);
      const oldDefault = listRes.body.workflows.find((w: { name: string }) => w.name === "Old Default");
      expect(oldDefault.isDefault).toBe(false);
    });
  });

  // ---- GET /api/workflows/:id ----
  describe("GET /api/workflows/:id", () => {
    it("returns workflow detail with parsed JSON", async () => {
      const nodes = [{ id: "n1", type: "task" }];
      const workflow = await createTestWorkflow(testDb, project.id, {
        name: "Detailed WF",
        nodes: JSON.stringify(nodes),
      });

      const res = await request(app).get(`/api/workflows/${workflow.id}`);

      expect(res.status).toBe(200);
      expect(res.body.workflow.name).toBe("Detailed WF");
      expect(res.body.workflow.nodes).toEqual(nodes);
      expect(res.body.workflow.edges).toEqual([]);
    });

    it("returns 404 for unknown workflow", async () => {
      const res = await request(app).get("/api/workflows/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });
  });

  // ---- PUT /api/workflows/:id ----
  describe("PUT /api/workflows/:id", () => {
    it("updates workflow name and description", async () => {
      const workflow = await createTestWorkflow(testDb, project.id, { name: "Old Name" });

      const res = await request(app)
        .put(`/api/workflows/${workflow.id}`)
        .send({ name: "New Name", description: "Updated desc" });

      expect(res.status).toBe(200);
      expect(res.body.workflow.name).toBe("New Name");
      expect(res.body.workflow.description).toBe("Updated desc");
    });

    it("updates workflow nodes and edges", async () => {
      const workflow = await createTestWorkflow(testDb, project.id);
      const newNodes = [{ id: "n1", type: "start" }, { id: "n2", type: "end" }];
      const newEdges = [{ id: "e1", source: "n1", target: "n2" }];

      const res = await request(app)
        .put(`/api/workflows/${workflow.id}`)
        .send({ nodes: newNodes, edges: newEdges });

      expect(res.status).toBe(200);
      expect(res.body.workflow.nodes).toEqual(newNodes);
      expect(res.body.workflow.edges).toEqual(newEdges);
    });

    it("returns 404 for unknown workflow", async () => {
      const res = await request(app)
        .put("/api/workflows/nonexistent")
        .send({ name: "Updated" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });

    it("clears previous default when setting isDefault=true", async () => {
      const wf1 = await createTestWorkflow(testDb, project.id, { name: "WF1", isDefault: true });
      const wf2 = await createTestWorkflow(testDb, project.id, { name: "WF2", isDefault: false });

      const res = await request(app)
        .put(`/api/workflows/${wf2.id}`)
        .send({ isDefault: true });

      expect(res.status).toBe(200);
      expect(res.body.workflow.isDefault).toBe(true);

      // Verify old default was unset
      const wf1Res = await request(app).get(`/api/workflows/${wf1.id}`);
      expect(wf1Res.body.workflow.isDefault).toBe(false);
    });
  });

  // ---- DELETE /api/workflows/:id ----
  describe("DELETE /api/workflows/:id", () => {
    it("deletes a workflow", async () => {
      const workflow = await createTestWorkflow(testDb, project.id);

      const res = await request(app).delete(`/api/workflows/${workflow.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const getRes = await request(app).get(`/api/workflows/${workflow.id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for non-existent workflow", async () => {
      const res = await request(app).delete("/api/workflows/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });
  });

  // ---- POST /api/workflows/:id/set-default ----
  describe("POST /api/workflows/:id/set-default", () => {
    it("marks a workflow as default", async () => {
      const workflow = await createTestWorkflow(testDb, project.id, { isDefault: false });

      const res = await request(app).post(`/api/workflows/${workflow.id}/set-default`);

      expect(res.status).toBe(200);
      expect(res.body.workflow.isDefault).toBe(true);
    });

    it("unsets previous default workflow for the same project", async () => {
      const wf1 = await createTestWorkflow(testDb, project.id, { name: "WF1", isDefault: true });
      const wf2 = await createTestWorkflow(testDb, project.id, { name: "WF2", isDefault: false });

      const res = await request(app).post(`/api/workflows/${wf2.id}/set-default`);

      expect(res.status).toBe(200);
      expect(res.body.workflow.isDefault).toBe(true);

      // Verify old default was unset
      const wf1Res = await request(app).get(`/api/workflows/${wf1.id}`);
      expect(wf1Res.body.workflow.isDefault).toBe(false);
    });

    it("does not affect workflows in other projects", async () => {
      const otherProject = await createTestProject(testDb, { name: "Other" });
      const otherWf = await createTestWorkflow(testDb, otherProject.id, { name: "Other WF", isDefault: true });
      const wf = await createTestWorkflow(testDb, project.id, { name: "My WF", isDefault: false });

      await request(app).post(`/api/workflows/${wf.id}/set-default`);

      // Other project's workflow should still be default
      const otherRes = await request(app).get(`/api/workflows/${otherWf.id}`);
      expect(otherRes.body.workflow.isDefault).toBe(true);
    });

    it("returns 404 for non-existent workflow", async () => {
      const res = await request(app).post("/api/workflows/nonexistent/set-default");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });
  });
});
