import type { TaskStatus } from "../types/task";

export const TASK_STATES = {
  CREATED: "created",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  CHANGES_REQUESTED: "changes_requested",
  DONE: "done",
  BLOCKED: "blocked",
} as const;

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ["assigned", "in_progress"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "changes_requested"],
  changes_requested: ["in_progress"],
  done: [],
  blocked: ["created", "assigned"],
};

export const TRANSITION_ACTORS: Record<string, "user" | "agent" | "system" | "any"> = {
  "created->assigned": "system",
  "created->in_progress": "agent",
  "assigned->in_progress": "agent",
  "assigned->blocked": "agent",
  "in_progress->review": "agent",
  "in_progress->blocked": "agent",
  "review->done": "user",
  "review->changes_requested": "user",
  "changes_requested->in_progress": "agent",
  "blocked->created": "user",
  "blocked->assigned": "user",
};
