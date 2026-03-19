import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { agents } from "./agents";

export const tasks = pgTable("tasks", {
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
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
  statusIdx: index("tasks_status_idx").on(table.status),
  createdAtIdx: index("tasks_created_at_idx").on(table.createdAt),
  assignedAgentIdIdx: index("tasks_assigned_agent_id_idx").on(table.assignedAgentId),
  parentTaskIdIdx: index("tasks_parent_task_id_idx").on(table.parentTaskId),
}));
