import { pgTable, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  maxProjects: integer("max_projects").notNull().default(5),
  maxTasksPerMonth: integer("max_tasks_per_month").notNull().default(100),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  features: jsonb("features").$type<string[]>().default([]),
  maxStorageMb: integer("max_storage_mb").notNull().default(500),
  repoTtlDays: integer("repo_ttl_days").notNull().default(30),
  allowedModels: jsonb("allowed_models").$type<string[]>().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
