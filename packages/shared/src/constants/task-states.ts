import type { TaskStatus } from "../types/task";

export const TASK_STATES = {
  CREATED: "created",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  CHANGES_REQUESTED: "changes_requested",
  DONE: "done",
  CANCELLED: "cancelled",
  BLOCKED: "blocked",
  FAILED: "failed",
} as const;

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review", "blocked", "failed", "created", "cancelled"],
  review: ["done", "changes_requested", "created", "cancelled"],
  changes_requested: ["in_progress", "created", "cancelled"],
  done: [],
  cancelled: [],
  blocked: ["created", "assigned", "cancelled"],
  failed: ["created", "cancelled"],
};

export const TRANSITION_ACTORS: Record<string, "user" | "agent" | "system" | "any"> = {
  "created->assigned": "system",
  "created->in_progress": "agent",
  "assigned->in_progress": "agent",
  "assigned->blocked": "agent",
  "in_progress->review": "agent",
  "in_progress->blocked": "agent",
  "in_progress->created": "system",
  "in_progress->failed": "system",
  "review->done": "user",
  "review->changes_requested": "user",
  "review->created": "system",
  "changes_requested->in_progress": "agent",
  "changes_requested->created": "system",
  "blocked->created": "user",
  "blocked->assigned": "user",
  "blocked->cancelled": "user",
  "failed->created": "system",
  "failed->cancelled": "user",
  "created->cancelled": "user",
  "assigned->cancelled": "user",
  "in_progress->cancelled": "user",
  "review->cancelled": "user",
  "changes_requested->cancelled": "user",
};
