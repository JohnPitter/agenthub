import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  model: text("model").notNull(),
  maxThinkingTokens: integer("max_thinking_tokens"),
  systemPrompt: text("system_prompt").notNull(),
  description: text("description").notNull(),
  allowedTools: text("allowed_tools"),
  permissionMode: text("permission_mode", {
    enum: ["default", "acceptEdits", "bypassPermissions"],
  }).default("acceptEdits").notNull(),
  level: text("level", { enum: ["junior", "pleno", "senior", "especialista", "arquiteto"] }).default("senior").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  color: text("color"),
  avatar: text("avatar"),
  soul: text("soul"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
