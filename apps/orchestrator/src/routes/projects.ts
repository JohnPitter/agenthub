import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { scanWorkspace } from "../workspace/scanner";

export const projectsRouter = Router();

// GET /api/projects — list all projects
projectsRouter.get("/", async (_req, res) => {
  const projects = await db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt));
  res.json({ projects });
});

// GET /api/projects/:id — get single project
projectsRouter.get("/:id", async (req, res) => {
  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, req.params.id))
    .get();

  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
});

// POST /api/projects — create project
projectsRouter.post("/", async (req, res) => {
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

  await db.insert(schema.projects).values(project);
  res.status(201).json({ project });
});

// PATCH /api/projects/:id — update project
projectsRouter.patch("/:id", async (req, res) => {
  const { name, description, status } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;

  await db
    .update(schema.projects)
    .set(updates)
    .where(eq(schema.projects.id, req.params.id));

  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, req.params.id))
    .get();

  res.json({ project });
});

// DELETE /api/projects/:id — delete project
projectsRouter.delete("/:id", async (req, res) => {
  await db.delete(schema.projects).where(eq(schema.projects.id, req.params.id));
  res.json({ success: true });
});

// POST /api/projects/scan — scan workspace for projects
projectsRouter.post("/scan", async (req, res) => {
  const { workspacePath } = req.body;

  if (!workspacePath) {
    return res.status(400).json({ error: "workspacePath is required" });
  }

  try {
    const scanned = scanWorkspace(workspacePath);
    res.json({ projects: scanned });
  } catch (error) {
    res.status(400).json({ error: "Failed to scan workspace" });
  }
});
