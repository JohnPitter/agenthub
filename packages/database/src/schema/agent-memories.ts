import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const agentMemories = sqliteTable("agent_memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id"),
  type: text("type", {
    enum: ["lesson", "pattern", "preference", "decision", "error"],
  }).notNull(),
  content: text("content").notNull(),
  context: text("context"),
  importance: integer("importance").notNull().default(3),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_agent_memories_agent").on(table.agentId),
  index("idx_agent_memories_project").on(table.agentId, table.projectId),
]);
