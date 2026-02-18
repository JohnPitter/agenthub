import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("custom").notNull(),
  instructions: text("instructions").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_skills_project").on(table.projectId),
]);

export const agentSkills = sqliteTable("agent_skills", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  skillId: text("skill_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_agent_skills_agent").on(table.agentId),
  index("idx_agent_skills_skill").on(table.skillId),
]);
