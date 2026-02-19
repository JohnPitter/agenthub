import crypto from "crypto";
import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getUserRoleInTeam } from "../middleware/authorization.js";
import { logger } from "../lib/logger.js";

export const teamsRouter: ReturnType<typeof Router> = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// POST /api/teams — create team
teamsRouter.post("/", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const slug = slugify(name) + "-" + nanoid(6);
    const teamId = nanoid();
    const now = new Date();

    const team = {
      id: teamId,
      name: name.trim(),
      slug,
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.teams).values(team);

    // Auto-add creator as owner member
    await db.insert(schema.teamMembers).values({
      id: nanoid(),
      teamId,
      userId,
      role: "owner" as const,
      joinedAt: now,
    });

    logger.info(`Team created: ${team.name} (${team.slug})`, "teams");
    res.status(201).json({ team });
  } catch (error) {
    logger.error(`Failed to create team: ${error}`, "teams");
    res.status(500).json({ error: "Failed to create team" });
  }
});

// GET /api/teams — list teams for current user
teamsRouter.get("/", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const memberships = await db
      .select({
        team: schema.teams,
        role: schema.teamMembers.role,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .where(eq(schema.teamMembers.userId, userId))
      .orderBy(desc(schema.teams.updatedAt));

    const teams = memberships.map((m) => ({
      ...m.team,
      role: m.role,
    }));

    res.json({ teams });
  } catch (error) {
    logger.error(`Failed to list teams: ${error}`, "teams");
    res.status(500).json({ error: "Failed to list teams" });
  }
});

// GET /api/teams/:id — get team details
teamsRouter.get("/:id", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const team = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, req.params.id))
      .get();

    if (!team) return res.status(404).json({ error: "Team not found" });

    // Check membership
    const role = await getUserRoleInTeam(userId, team.id);
    if (!role) return res.status(403).json({ error: "Not a member of this team" });

    res.json({ team, role });
  } catch (error) {
    logger.error(`Failed to get team: ${error}`, "teams");
    res.status(500).json({ error: "Failed to get team" });
  }
});

// GET /api/teams/:id/members — list members with user info
teamsRouter.get("/:id/members", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const role = await getUserRoleInTeam(userId, req.params.id);
    if (!role) return res.status(403).json({ error: "Not a member of this team" });

    const members = await db
      .select({
        id: schema.teamMembers.id,
        teamId: schema.teamMembers.teamId,
        userId: schema.teamMembers.userId,
        role: schema.teamMembers.role,
        joinedAt: schema.teamMembers.joinedAt,
        userName: schema.users.name,
        userLogin: schema.users.login,
        userAvatar: schema.users.avatarUrl,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
      .where(eq(schema.teamMembers.teamId, req.params.id));

    res.json({ members });
  } catch (error) {
    logger.error(`Failed to list team members: ${error}`, "teams");
    res.status(500).json({ error: "Failed to list team members" });
  }
});

// POST /api/teams/:id/invite — create invite
teamsRouter.post("/:id/invite", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const teamId = req.params.id;
    const role = await getUserRoleInTeam(userId, teamId);
    if (!role || (role !== "owner" && role !== "admin")) {
      return res.status(403).json({ error: "Only owners and admins can invite members" });
    }

    const { email, role: inviteRole } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const validRoles = ["admin", "member", "viewer"];
    const finalRole = validRoles.includes(inviteRole) ? inviteRole : "member";

    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = {
      id: nanoid(),
      teamId,
      email: email.trim().toLowerCase(),
      role: finalRole as "admin" | "member" | "viewer",
      token,
      expiresAt,
      createdAt: now,
    };

    await db.insert(schema.teamInvites).values(invite);

    logger.info(`Invite created for ${invite.email} to team ${teamId}`, "teams");
    res.status(201).json({ invite });
  } catch (error) {
    logger.error(`Failed to create invite: ${error}`, "teams");
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// POST /api/teams/invite/:token/accept — accept invite
teamsRouter.post("/invite/:token/accept", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const invite = await db
      .select()
      .from(schema.teamInvites)
      .where(eq(schema.teamInvites.token, req.params.token))
      .get();

    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.acceptedAt) return res.status(400).json({ error: "Invite already accepted" });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invite has expired" });

    // Check if user is already a member
    const existing = await db
      .select()
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, invite.teamId), eq(schema.teamMembers.userId, userId)))
      .get();

    if (existing) return res.status(400).json({ error: "Already a member of this team" });

    const now = new Date();

    // Add user as member
    await db.insert(schema.teamMembers).values({
      id: nanoid(),
      teamId: invite.teamId,
      userId,
      role: invite.role as "owner" | "admin" | "member" | "viewer",
      joinedAt: now,
    });

    // Mark invite as accepted
    await db
      .update(schema.teamInvites)
      .set({ acceptedAt: now })
      .where(eq(schema.teamInvites.id, invite.id));

    logger.info(`User ${userId} accepted invite to team ${invite.teamId}`, "teams");
    res.json({ success: true, teamId: invite.teamId });
  } catch (error) {
    logger.error(`Failed to accept invite: ${error}`, "teams");
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// DELETE /api/teams/:id/members/:userId — remove member
teamsRouter.delete("/:id/members/:userId", async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    if (!currentUserId) return res.status(401).json({ error: "Authentication required" });

    const teamId = req.params.id;
    const targetUserId = req.params.userId;

    const currentRole = await getUserRoleInTeam(currentUserId, teamId);
    if (!currentRole || (currentRole !== "owner" && currentRole !== "admin")) {
      return res.status(403).json({ error: "Only owners and admins can remove members" });
    }

    // Cannot remove the owner
    const targetRole = await getUserRoleInTeam(targetUserId, teamId);
    if (targetRole === "owner") {
      return res.status(400).json({ error: "Cannot remove the team owner" });
    }

    // Admin cannot remove other admins
    if (currentRole === "admin" && targetRole === "admin") {
      return res.status(403).json({ error: "Admins cannot remove other admins" });
    }

    await db
      .delete(schema.teamMembers)
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId)));

    logger.info(`User ${targetUserId} removed from team ${teamId}`, "teams");
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to remove member: ${error}`, "teams");
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// PATCH /api/teams/:id/members/:userId — update member role
teamsRouter.patch("/:id/members/:userId", async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    if (!currentUserId) return res.status(401).json({ error: "Authentication required" });

    const teamId = req.params.id;
    const targetUserId = req.params.userId;
    const { role: newRole } = req.body;

    const currentRole = await getUserRoleInTeam(currentUserId, teamId);
    if (currentRole !== "owner") {
      return res.status(403).json({ error: "Only the team owner can change roles" });
    }

    const validRoles = ["admin", "member", "viewer"];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: "Invalid role. Must be admin, member, or viewer" });
    }

    // Cannot change owner's role
    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: "Cannot change your own role as owner" });
    }

    await db
      .update(schema.teamMembers)
      .set({ role: newRole })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, targetUserId)));

    logger.info(`User ${targetUserId} role updated to ${newRole} in team ${teamId}`, "teams");
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to update member role: ${error}`, "teams");
    res.status(500).json({ error: "Failed to update member role" });
  }
});
