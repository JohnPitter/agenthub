import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const agentMemories = pgTable("agent_memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id"),
  type: text("type", {
    enum: ["lesson", "pattern", "preference", "decision", "error"],
  }).notNull(),
  content: text("content").notNull(),
  context: text("context"),
  importance: integer("importance").notNull().default(3),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_agent_memories_agent").on(table.agentId),
  index("idx_agent_memories_project").on(table.agentId, table.projectId),
]);
