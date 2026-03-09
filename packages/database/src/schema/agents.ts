import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const agents = pgTable("agents", {
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
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  color: text("color"),
  avatar: text("avatar"),
  soul: text("soul"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
