import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  isPrivate: z.boolean().optional(),
});

export const importProjectSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  cloneUrl: z.string().url(),
  htmlUrl: z.string().url(),
  description: z.string().optional(),
});
