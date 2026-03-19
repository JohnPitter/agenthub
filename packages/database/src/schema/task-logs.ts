import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { agents } from "./agents";

export const taskLogs = pgTable("task_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  detail: text("detail"),
  filePath: text("file_path"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (table) => ({
  taskIdIdx: index("task_logs_task_id_idx").on(table.taskId),
  createdAtIdx: index("task_logs_created_at_idx").on(table.createdAt),
}));
