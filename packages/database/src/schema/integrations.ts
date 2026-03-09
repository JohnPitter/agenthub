import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type", { enum: ["whatsapp", "telegram", "git", "openai"] }).notNull(),
  status: text("status", {
    enum: ["disconnected", "connecting", "connected", "error"],
  }).default("disconnected").notNull(),
  config: text("config"),
  credentials: text("credentials"), // Encrypted credentials (AES-256-GCM)
  linkedAgentId: text("linked_agent_id"),
  lastConnectedAt: timestamp("last_connected_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
