import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** JSON-serialized WorkflowNode[] */
  nodes: text("nodes").notNull().default("[]"),
  /** JSON-serialized WorkflowEdge[] */
  edges: text("edges").notNull().default("[]"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
