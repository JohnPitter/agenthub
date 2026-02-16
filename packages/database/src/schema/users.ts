import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
