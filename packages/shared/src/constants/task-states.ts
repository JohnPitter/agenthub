import type { TaskStatus } from "../types/task";

export const TASK_STATES = {
  CREATED: "created",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  CHANGES_REQUESTED: "changes_requested",
  DONE: "done",
  BLOCKED: "blocked",
  FAILED: "failed",
} as const;

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ["assigned", "in_progress"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked", "failed", "created"],
  review: ["done", "changes_requested", "created"],
  changes_requested: ["in_progress", "created"],
  done: [],
  blocked: ["created", "assigned"],
  failed: ["created"],
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
  "failed->created": "system",
};
