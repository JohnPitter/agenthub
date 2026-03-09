import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  stack: text("stack"),
  icon: text("icon"),
  description: text("description"),
  teamId: text("team_id"),
  githubUrl: text("github_url"),
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  status: text("status", { enum: ["active", "archived"] }).default("active").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
