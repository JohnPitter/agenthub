import { z } from "zod";

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z.enum(["feature", "bug", "refactor", "test", "docs"]).optional(),
  assignedAgentId: z.string().optional(),
  parentTaskId: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z
    .enum([
      "created",
      "assigned",
      "in_progress",
      "review",
      "changes_requested",
      "done",
      "cancelled",
      "blocked",
      "failed",
    ])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z.enum(["feature", "bug", "refactor", "test", "docs"]).optional(),
  assignedAgentId: z.string().nullable().optional(),
  result: z.string().optional(),
});
