import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { agents } from "./agents";
import { projects } from "./projects";

export const agentProjectConfigs = sqliteTable("agent_project_configs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  allowedTools: text("allowed_tools"),
  additionalDirectories: text("additional_directories"),
  additionalPrompt: text("additional_prompt"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
});
