import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const docs = pgTable("docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  category: text("category"),
  icon: text("icon"),
  pinned: boolean("pinned").notNull().default(false),
  parentId: text("parent_id"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
