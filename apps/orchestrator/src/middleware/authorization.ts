import type { Request, Response, NextFunction } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";

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
    .get();
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
