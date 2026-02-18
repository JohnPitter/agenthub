import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type", { enum: ["whatsapp", "telegram", "git", "openai"] }).notNull(),
  status: text("status", {
    enum: ["disconnected", "connecting", "connected", "error"],
  }).default("disconnected").notNull(),
  config: text("config"),
  credentials: text("credentials"), // Encrypted credentials (AES-256-GCM)
  linkedAgentId: text("linked_agent_id"),
  lastConnectedAt: integer("last_connected_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
