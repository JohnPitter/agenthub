import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { tasks } from "./tasks";
import { agents } from "./agents";

export const taskLogs = sqliteTable("task_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  detail: text("detail"),
  filePath: text("file_path"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
