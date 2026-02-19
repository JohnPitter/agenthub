import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export const workflowsRouter: ReturnType<typeof Router> = Router();

// GET /api/workflows?projectId=...
workflowsRouter.get("/", async (req, res) => {
  try {
    const { projectId } = req.query;
    const conditions = [];

    if (projectId) conditions.push(eq(schema.workflows.projectId, projectId as string));

    const workflows = await db
      .select()
      .from(schema.workflows)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.workflows.createdAt));

    // Parse JSON columns for the response
    const parsed = workflows.map((w) => ({
      ...w,
      nodes: JSON.parse(w.nodes),
      edges: JSON.parse(w.edges),
    }));

    res.json({ workflows: parsed });
  } catch (error) {
    logger.error(`Failed to list workflows: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to list workflows" });
  }
});

// GET /api/workflows/:id
workflowsRouter.get("/:id", async (req, res) => {
  try {
    const workflow = await db
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
    logger.error(`Failed to get workflow: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to get workflow" });
  }
});

// POST /api/workflows
workflowsRouter.post("/", async (req, res) => {
  try {
    const { projectId, name, description, nodes, edges, isDefault } = req.body;

    if (!projectId || !name) {
      return res.status(400).json({ error: "projectId and name are required" });
    }

    const id = nanoid();

    // If this is set as default, clear other defaults for the project
    if (isDefault) {
      await db
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

    await db.insert(schema.workflows).values(workflow);

    logger.info(`Created workflow "${name}" (${id}) for project ${projectId}`, "workflows-router");

    res.status(201).json({
      workflow: {
        ...workflow,
        nodes: nodes ?? [],
        edges: edges ?? [],
      },
    });
  } catch (error) {
    logger.error(`Failed to create workflow: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to create workflow" });
  }
});

// PUT /api/workflows/:id
workflowsRouter.put("/:id", async (req, res) => {
  try {
    const existing = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, req.params.id))
      .get();

    if (!existing) return res.status(404).json({ error: "Workflow not found" });

    const { name, description, nodes, edges, isDefault } = req.body;

    // If setting as default, clear other defaults for the project
    if (isDefault && !existing.isDefault) {
      await db
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

    await db.update(schema.workflows).set(updates).where(eq(schema.workflows.id, req.params.id));

    const updated = await db
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
    logger.error(`Failed to update workflow: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to update workflow" });
  }
});

// DELETE /api/workflows/:id
workflowsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, req.params.id))
      .get();

    if (!existing) return res.status(404).json({ error: "Workflow not found" });

    await db.delete(schema.workflows).where(eq(schema.workflows.id, req.params.id));

    logger.info(`Deleted workflow ${req.params.id}`, "workflows-router");
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete workflow: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to delete workflow" });
  }
});

// POST /api/workflows/:id/set-default
workflowsRouter.post("/:id/set-default", async (req, res) => {
  try {
    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, req.params.id))
      .get();

    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    // Clear all defaults for this project
    await db
      .update(schema.workflows)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(schema.workflows.projectId, workflow.projectId), eq(schema.workflows.isDefault, true)));

    // Set this workflow as default
    await db
      .update(schema.workflows)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(schema.workflows.id, req.params.id));

    logger.info(`Set workflow ${req.params.id} as default for project ${workflow.projectId}`, "workflows-router");

    res.json({
      workflow: {
        ...workflow,
        isDefault: true,
        nodes: JSON.parse(workflow.nodes),
        edges: JSON.parse(workflow.edges),
      },
    });
  } catch (error) {
    logger.error(`Failed to set default workflow: ${error}`, "workflows-router");
    res.status(500).json({ error: "Failed to set default workflow" });
  }
});
