import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("custom").notNull(),
  instructions: text("instructions").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_skills_project").on(table.projectId),
]);

export const agentSkills = pgTable("agent_skills", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  skillId: text("skill_id").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_agent_skills_agent").on(table.agentId),
  index("idx_agent_skills_skill").on(table.skillId),
]);
