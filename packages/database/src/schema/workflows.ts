import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** JSON-serialized WorkflowNode[] */
  nodes: text("nodes").notNull().default("[]"),
  /** JSON-serialized WorkflowEdge[] */
  edges: text("edges").notNull().default("[]"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
