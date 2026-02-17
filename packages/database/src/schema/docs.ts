import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const docs = sqliteTable("docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  category: text("category"),
  icon: text("icon"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  parentId: text("parent_id"),
  order: integer("order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
