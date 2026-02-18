import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export const skillsRouter = Router();
export const agentSkillsRouter = Router();

// ---------------------------------------------------------------------------
// Skills CRUD — mounted at /api/skills
// ---------------------------------------------------------------------------

// GET /api/skills — list all skills (optional ?projectId filter)
skillsRouter.get("/", async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;

    const rows = projectId
      ? await db
          .select()
          .from(schema.skills)
          .where(eq(schema.skills.projectId, projectId))
      : await db.select().from(schema.skills);

    res.json({ skills: rows });
  } catch (error) {
    logger.error(`Failed to list skills: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to list skills" });
  }
});

// GET /api/skills/:id
skillsRouter.get("/:id", async (req, res) => {
  try {
    const skill = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, req.params.id))
      .get();

    if (!skill) return res.status(404).json({ error: "Skill not found" });
    res.json({ skill });
  } catch (error) {
    logger.error(`Failed to get skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to get skill" });
  }
});

// POST /api/skills
skillsRouter.post("/", async (req, res) => {
  try {
    const { name, description, category, instructions, projectId, isActive } = req.body;

    if (!name || !instructions) {
      return res.status(400).json({ error: "name and instructions are required" });
    }

    const skill = {
      id: nanoid(),
      projectId: projectId ?? null,
      name,
      description: description ?? null,
      category: category ?? "custom",
      instructions,
      isActive: isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.skills).values(skill);
    res.status(201).json({ skill });
  } catch (error) {
    logger.error(`Failed to create skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to create skill" });
  }
});

// PATCH /api/skills/:id
skillsRouter.patch("/:id", async (req, res) => {
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const allowedFields = ["name", "description", "category", "instructions", "isActive", "projectId"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await db.update(schema.skills).set(updates).where(eq(schema.skills.id, req.params.id));

    const skill = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, req.params.id))
      .get();

    if (!skill) return res.status(404).json({ error: "Skill not found" });
    res.json({ skill });
  } catch (error) {
    logger.error(`Failed to update skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to update skill" });
  }
});

// DELETE /api/skills/:id — cascade deletes agent_skills
skillsRouter.delete("/:id", async (req, res) => {
  try {
    const skill = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, req.params.id))
      .get();

    if (!skill) return res.status(404).json({ error: "Skill not found" });

    // Delete agent_skills associations first
    await db.delete(schema.agentSkills).where(eq(schema.agentSkills.skillId, req.params.id));
    await db.delete(schema.skills).where(eq(schema.skills.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to delete skill" });
  }
});

// ---------------------------------------------------------------------------
// Agent ↔ Skill assignments — mounted at /api/agents
// ---------------------------------------------------------------------------

// GET /api/agents/:agentId/skills — list skills assigned to an agent
agentSkillsRouter.get("/:agentId/skills", async (req, res) => {
  try {
    const { agentId } = req.params;

    const rows = await db
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
  } catch (error) {
    logger.error(`Failed to list agent skills: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to list agent skills" });
  }
});

// POST /api/agents/:agentId/skills — assign a skill to an agent
agentSkillsRouter.post("/:agentId/skills", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { skillId } = req.body;

    if (!skillId) {
      return res.status(400).json({ error: "skillId is required" });
    }

    // Check skill exists
    const skill = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, skillId))
      .get();

    if (!skill) return res.status(404).json({ error: "Skill not found" });

    // Check duplicate
    const existing = await db
      .select()
      .from(schema.agentSkills)
      .where(
        and(
          eq(schema.agentSkills.agentId, agentId),
          eq(schema.agentSkills.skillId, skillId),
        ),
      )
      .get();

    if (existing) {
      return res.status(409).json({ error: "Skill already assigned to this agent" });
    }

    const agentSkill = {
      id: nanoid(),
      agentId,
      skillId,
      createdAt: new Date(),
    };

    await db.insert(schema.agentSkills).values(agentSkill);
    res.status(201).json({ agentSkill });
  } catch (error) {
    logger.error(`Failed to assign skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to assign skill" });
  }
});

// DELETE /api/agents/:agentId/skills/:skillId — unassign a skill from an agent
agentSkillsRouter.delete("/:agentId/skills/:skillId", async (req, res) => {
  try {
    const { agentId, skillId } = req.params;

    const existing = await db
      .select()
      .from(schema.agentSkills)
      .where(
        and(
          eq(schema.agentSkills.agentId, agentId),
          eq(schema.agentSkills.skillId, skillId),
        ),
      )
      .get();

    if (!existing) {
      return res.status(404).json({ error: "Skill assignment not found" });
    }

    await db
      .delete(schema.agentSkills)
      .where(
        and(
          eq(schema.agentSkills.agentId, agentId),
          eq(schema.agentSkills.skillId, skillId),
        ),
      );

    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to unassign skill: ${error}`, "skills-route");
    res.status(500).json({ error: "Failed to unassign skill" });
  }
});
