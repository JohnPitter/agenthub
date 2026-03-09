import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { agents } from "./agents";
import { tasks } from "./tasks";

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id),
  agentId: text("agent_id").references(() => agents.id),
  source: text("source", {
    enum: ["user", "agent", "system", "whatsapp", "telegram"],
  }).notNull(),
  content: text("content").notNull(),
  contentType: text("content_type", {
    enum: ["text", "code", "markdown", "thinking", "tool_use", "error"],
  }).default("text").notNull(),
  metadata: text("metadata"),
  parentMessageId: text("parent_message_id"),
  isThinking: boolean("is_thinking").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});
