import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";
import { agents } from "./agents";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  assignedAgentId: text("assigned_agent_id").references(() => agents.id),
  parentTaskId: text("parent_task_id"),
  title: text("title").notNull(),
  description: text("description"),
  parsedSpec: text("parsed_spec"),
  status: text("status", {
    enum: ["created", "assigned", "in_progress", "review", "changes_requested", "done", "cancelled", "blocked", "failed"],
  }).default("created").notNull(),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).default("medium").notNull(),
  category: text("category"),
  branch: text("branch"),
  sessionId: text("session_id"),
  result: text("result"),
  costUsd: text("cost_usd"),
  tokensUsed: integer("tokens_used"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});
