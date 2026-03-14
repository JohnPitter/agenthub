import { pgTable, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  stack: text("stack"),
  icon: text("icon"),
  description: text("description"),
  teamId: text("team_id"),
  ownerId: text("owner_id"),
  githubUrl: text("github_url"),
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  status: text("status", { enum: ["active", "archived"] }).default("active").notNull(),
  lastAccessedAt: timestamp("last_accessed_at").$defaultFn(() => new Date()),
  diskSizeMb: numeric("disk_size_mb", { precision: 10, scale: 2 }).default("0"),
  isShallowClone: boolean("is_shallow_clone").notNull().default(true),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
