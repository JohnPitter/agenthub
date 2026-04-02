import type { Request, Response, NextFunction } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export type Permission =
  | "project:read" | "project:write" | "project:delete"
  | "task:read" | "task:write" | "task:assign"
  | "agent:read" | "agent:write"
  | "team:manage" | "team:invite";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [], // special: has everything
  admin: [
    "project:read", "project:write", "project:delete",
    "task:read", "task:write", "task:assign",
    "agent:read", "agent:write",
    "team:invite",
  ],
  member: [
    "project:read", "project:write",
    "task:read", "task:write",
    "agent:read",
  ],
  viewer: [
    "project:read",
    "task:read",
    "agent:read",
  ],
};

function hasPermission(role: string, permission: Permission): boolean {
  if (role === "owner") return true;
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission);
}

export async function getUserRoleInTeam(userId: string, teamId: string): Promise<string | null> {
  const member = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
    .then(r => r[0]);
  return member?.role ?? null;
}

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const teamId = (req.query.teamId as string) ?? req.body?.teamId ?? req.params.teamId;

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!teamId) {
      next();
      return;
    }

    const role = await getUserRoleInTeam(userId, teamId);
    if (!role) {
      res.status(403).json({ error: "Not a member of this team" });
      return;
    }
    if (!hasPermission(role, permission)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

/**
 * Verify the authenticated user has access to the project specified by projectId.
 * Extracts projectId from: req.params.projectId, req.query.projectId, or req.body.projectId.
 * Access is granted if:
 *   - User is a global admin
 *   - User is the project owner
 *   - User is a member of the project's team
 *   - Project has no owner and no team (legacy/unowned projects)
 */
export function requireProjectAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const projectId = req.params.projectId
      ?? req.params.id
      ?? (req.query.projectId as string)
      ?? req.body?.projectId;

    if (!projectId) {
      // No projectId in request — skip authorization (route doesn't need it)
      next();
      return;
    }

    try {
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const project = await db.select({
        ownerId: schema.projects.ownerId,
        teamId: schema.projects.teamId,
      }).from(schema.projects).where(eq(schema.projects.id, pid)).then(r => r[0]);

      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Unowned projects are accessible (legacy projects created before auth)
      if (!project.ownerId && !project.teamId) {
        next();
        return;
      }

      // Owner always has access
      if (project.ownerId === userId) {
        next();
        return;
      }

      // Global admin has access
      const [user] = await db.select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      if (user?.role === "admin") {
        next();
        return;
      }

      // Team member has access
      if (project.teamId) {
        const role = await getUserRoleInTeam(userId, project.teamId);
        if (role) {
          next();
          return;
        }
      }

      logger.warn(`User ${userId} denied access to project ${projectId}`, "authorization");
      res.status(403).json({ error: "Access denied to this project" });
    } catch (err) {
      logger.error(`Project access check failed: ${err}`, "authorization");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
