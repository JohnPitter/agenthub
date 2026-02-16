import { db, schema } from "@agenthub/database";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";
import type { AgentMemoryType } from "@agenthub/shared";

interface StoreMemoryInput {
  agentId: string;
  projectId?: string | null;
  type: AgentMemoryType;
  content: string;
  context?: string | null;
  importance?: number;
}

class AgentMemoryService {
  async store(input: StoreMemoryInput): Promise<string> {
    const id = nanoid();
    await db.insert(schema.agentMemories).values({
      id,
      agentId: input.agentId,
      projectId: input.projectId ?? null,
      type: input.type,
      content: input.content,
      context: input.context ?? null,
      importance: input.importance ?? 3,
      createdAt: new Date(),
    });

    logger.info(
      `Memory stored for agent ${input.agentId}: [${input.type}] ${input.content.slice(0, 80)}...`,
      "agent-memory",
    );

    return id;
  }

  async retrieve(agentId: string, projectId?: string | null, limit = 10): Promise<string> {
    // Get global memories (no projectId)
    const globalMemories = await db
      .select()
      .from(schema.agentMemories)
      .where(
        and(
          eq(schema.agentMemories.agentId, agentId),
          eq(schema.agentMemories.projectId, ""),
        ),
      )
      .orderBy(desc(schema.agentMemories.importance), desc(schema.agentMemories.createdAt))
      .limit(limit)
      .all();

    // Get project-specific memories
    let projectMemories: typeof globalMemories = [];
    if (projectId) {
      projectMemories = await db
        .select()
        .from(schema.agentMemories)
        .where(
          and(
            eq(schema.agentMemories.agentId, agentId),
            eq(schema.agentMemories.projectId, projectId),
          ),
        )
        .orderBy(desc(schema.agentMemories.importance), desc(schema.agentMemories.createdAt))
        .limit(limit)
        .all();
    }

    // Also get memories with null projectId (truly global)
    const nullProjectMemories = await db
      .select()
      .from(schema.agentMemories)
      .where(eq(schema.agentMemories.agentId, agentId))
      .orderBy(desc(schema.agentMemories.importance), desc(schema.agentMemories.createdAt))
      .limit(limit * 2)
      .all();

    // Merge and deduplicate
    const seen = new Set<string>();
    const allMemories = [...projectMemories, ...globalMemories, ...nullProjectMemories]
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => {
        // Sort by importance desc, then by createdAt desc
        if (a.importance !== b.importance) return b.importance - a.importance;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, limit);

    if (allMemories.length === 0) return "";

    // Format as markdown block for injection into system prompt
    const lines = allMemories.map((m) => {
      const typeEmoji: Record<string, string> = {
        lesson: "📝",
        pattern: "🔁",
        preference: "⭐",
        decision: "🎯",
        error: "⚠️",
      };
      const emoji = typeEmoji[m.type] || "📌";
      const projectTag = m.projectId ? ` [project:${m.projectId}]` : "";
      return `- ${emoji} **${m.type}**${projectTag}: ${m.content}`;
    });

    return `\n\n---\n## Your Memories\nThese are lessons and patterns you've learned from previous tasks. Use them to avoid repeating mistakes and apply proven patterns.\n\n${lines.join("\n")}\n---\n`;
  }

  async extractFromResult(
    agentId: string,
    projectId: string | null,
    taskTitle: string,
    result: string,
  ): Promise<void> {
    // Simple heuristic: extract key learnings from the result
    // Look for patterns like "I learned", "important note", "for future reference"
    const lowerResult = result.toLowerCase();

    const hasLearning =
      lowerResult.includes("learned") ||
      lowerResult.includes("note for") ||
      lowerResult.includes("important") ||
      lowerResult.includes("gotcha") ||
      lowerResult.includes("watch out") ||
      lowerResult.includes("careful with") ||
      lowerResult.includes("pattern") ||
      lowerResult.includes("convention");

    if (hasLearning && result.length > 100) {
      // Store a summary as a lesson
      const summary = result.length > 500 ? result.slice(0, 500) + "..." : result;
      await this.store({
        agentId,
        projectId,
        type: "lesson",
        content: `Task "${taskTitle}": ${summary}`,
        context: taskTitle,
        importance: 3,
      });
    }
  }

  async storeError(
    agentId: string,
    projectId: string | null,
    taskTitle: string,
    error: string,
  ): Promise<void> {
    await this.store({
      agentId,
      projectId,
      type: "error",
      content: `Failed task "${taskTitle}": ${error}`,
      context: taskTitle,
      importance: 4,
    });
  }

  async list(agentId: string, projectId?: string | null): Promise<unknown[]> {
    if (projectId) {
      return db
        .select()
        .from(schema.agentMemories)
        .where(
          and(
            eq(schema.agentMemories.agentId, agentId),
            eq(schema.agentMemories.projectId, projectId),
          ),
        )
        .orderBy(desc(schema.agentMemories.createdAt))
        .all();
    }

    return db
      .select()
      .from(schema.agentMemories)
      .where(eq(schema.agentMemories.agentId, agentId))
      .orderBy(desc(schema.agentMemories.createdAt))
      .all();
  }

  async delete(memoryId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentMemories)
      .where(eq(schema.agentMemories.id, memoryId));

    return (result as unknown as { changes: number }).changes > 0;
  }
}

export const agentMemory = new AgentMemoryService();
