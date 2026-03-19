import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type").notNull(), // "task_completed" | "review_needed" | "agent_error" | "info"
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"), // deep link like /project/123/tasks
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (table) => ({
  projectIdIdx: index("notifications_project_id_idx").on(table.projectId),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));
