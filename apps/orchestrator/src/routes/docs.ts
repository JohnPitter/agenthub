import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export const docsRouter: ReturnType<typeof Router> = Router();

// GET /api/docs — list all docs (pinned first, then by updatedAt desc)
docsRouter.get("/", async (_req, res) => {
  try {
    const docs = await db
      .select()
      .from(schema.docs)
      .orderBy(desc(schema.docs.pinned), desc(schema.docs.updatedAt), asc(schema.docs.order));
    res.json({ docs });
  } catch (error) {
    logger.error(`Failed to list documents: ${error}`, "docs-route");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

// GET /api/docs/:id — get single doc
docsRouter.get("/:id", async (req, res) => {
  try {
    const doc = await db
      .select()
      .from(schema.docs)
      .where(eq(schema.docs.id, req.params.id))
      .get();

    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json({ doc });
  } catch (error) {
    logger.error(`Failed to get document: ${error}`, "docs-route");
    res.status(500).json({ error: "Failed to get document" });
  }
});

// POST /api/docs — create document
docsRouter.post("/", async (req, res) => {
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
      pinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.docs).values(doc);
    res.status(201).json({ doc });
  } catch (error) {
    logger.error(`Failed to create document: ${error}`, "docs-route");
    res.status(500).json({ error: "Failed to create document" });
  }
});

// Circular reference check for parentId updates
async function hasCircularRef(docId: string, newParentId: string | null): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === docId) return true;
  let current: string | null = newParentId;
  while (current) {
    const parent = await db.select({ parentId: schema.docs.parentId })
      .from(schema.docs).where(eq(schema.docs.id, current)).get();
    if (!parent) break;
    if (parent.parentId === docId) return true;
    current = parent.parentId;
  }
  return false;
}

// PATCH /api/docs/:id — update document
docsRouter.patch("/:id", async (req, res) => {
  try {
    const { title, content, category, icon, pinned, parentId, order } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (icon !== undefined) updates.icon = icon;
    if (pinned !== undefined) updates.pinned = pinned;
    if (parentId !== undefined) {
      const circular = await hasCircularRef(req.params.id, parentId);
      if (circular) {
        return res.status(400).json({ error: "Circular reference detected" });
      }
      updates.parentId = parentId;
    }
    if (order !== undefined) updates.order = order;

    await db
      .update(schema.docs)
      .set(updates)
      .where(eq(schema.docs.id, req.params.id));

    const doc = await db
      .select()
      .from(schema.docs)
      .where(eq(schema.docs.id, req.params.id))
      .get();

    res.json({ doc });
  } catch (error) {
    logger.error(`Failed to update document: ${error}`, "docs-route");
    res.status(500).json({ error: "Failed to update document" });
  }
});

// DELETE /api/docs/:id — delete document (reassign children to deleted doc's parent)
docsRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Reassign children to the deleted doc's parent before removing
    const deletedDoc = await db.select().from(schema.docs).where(eq(schema.docs.id, id)).get();
    if (deletedDoc) {
      await db.update(schema.docs)
        .set({ parentId: deletedDoc.parentId, updatedAt: new Date() })
        .where(eq(schema.docs.parentId, id));
    }

    await db.delete(schema.docs).where(eq(schema.docs.id, id));
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete document: ${error}`, "docs-route");
    res.status(500).json({ error: "Failed to delete document" });
  }
});
