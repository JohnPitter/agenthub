import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export interface EnabledModel {
  id: string;
  name: string;
  provider: string;
}

export const openrouterConfig = pgTable("openrouter_config", {
  id: text("id").primaryKey(),
  apiKey: text("api_key").notNull(),
  enabledModels: jsonb("enabled_models").$type<EnabledModel[]>().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
