import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type").notNull(), // "task_completed" | "review_needed" | "agent_error" | "info"
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"), // deep link like /project/123/tasks
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
