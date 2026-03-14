import { db, schema } from "@agenthub/database";
import { eq, and, lt, count, sql } from "drizzle-orm";
import { userReposDir, getDirectorySizeMb, isPathWithinRepos } from "../lib/storage.js";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import { GitService } from "../git/git-service.js";
import { safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

export interface StorageUsage {
  usedMb: number;
  limitMb: number;
  usedPercent: number;
  projectCount: number;
  maxProjects: number;
  repoTtlDays: number;
}

const DEFAULT_LIMITS = { maxStorageMb: 500, maxProjects: 3, repoTtlDays: 14 };

export class StorageService {
  private git = new GitService();

  /** Get user plan limits, falling back to free defaults */
  private async getUserLimits(userId: string): Promise<{ maxStorageMb: number; maxProjects: number; repoTtlDays: number }> {
    const user = await db
      .select({ planId: schema.users.planId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .then(r => r[0]);
    if (!user?.planId) return DEFAULT_LIMITS;

    const plan = await db.select({
      maxProjects: schema.plans.maxProjects,
      maxStorageMb: schema.plans.maxStorageMb,
      repoTtlDays: schema.plans.repoTtlDays,
    }).from(schema.plans).where(eq(schema.plans.id, user.planId)).then(r => r[0]);

    return plan ?? DEFAULT_LIMITS;
  }

  /** Get user's current storage usage vs. plan limits */
  async getUserStorageUsage(userId: string): Promise<StorageUsage> {
    const limits = await this.getUserLimits(userId);

    const [sizeResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${schema.projects.diskSizeMb}::numeric), 0)` })
      .from(schema.projects)
      .where(eq(schema.projects.ownerId, userId));

    const usedMb = parseFloat(sizeResult?.total ?? "0");

    const [countResult] = await db
      .select({ count: count() })
      .from(schema.projects)
      .where(eq(schema.projects.ownerId, userId));

    const projectCount = countResult?.count ?? 0;
    const limitMb = limits.maxStorageMb;

    return {
      usedMb: Math.round(usedMb * 100) / 100,
      limitMb,
      usedPercent: limitMb > 0 ? Math.round((usedMb / limitMb) * 10000) / 100 : 0,
      projectCount,
      maxProjects: limits.maxProjects,
      repoTtlDays: limits.repoTtlDays,
    };
  }

  /** Check if user can clone a new repo */
  async canCloneRepo(userId: string, estimatedSizeMb = 0): Promise<{ allowed: boolean; reason?: string }> {
    const usage = await this.getUserStorageUsage(userId);

    if (usage.maxProjects !== -1 && usage.projectCount >= usage.maxProjects) {
      return { allowed: false, reason: `Project limit reached (${usage.projectCount}/${usage.maxProjects}). Upgrade your plan or delete a project.` };
    }

    if (usage.limitMb > 0 && (usage.usedMb + estimatedSizeMb) > usage.limitMb) {
      return { allowed: false, reason: `Storage limit reached (${usage.usedMb.toFixed(1)}MB / ${usage.limitMb}MB). Free up space or upgrade your plan.` };
    }

    return { allowed: true };
  }

  /** Update disk size for a project */
  async updateProjectDiskSize(projectId: string, projectPath: string): Promise<number> {
    const sizeMb = await getDirectorySizeMb(projectPath);
    await db.update(schema.projects)
      .set({ diskSizeMb: String(sizeMb) })
      .where(eq(schema.projects.id, projectId));
    return sizeMb;
  }

  /** Touch lastAccessedAt for a project (fire-and-forget) */
  async touchProject(projectId: string): Promise<void> {
    await db.update(schema.projects)
      .set({ lastAccessedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  }

  /** Cleanup expired repos based on plan TTL */
  async cleanupExpiredRepos(): Promise<{ cleaned: number; freedMb: number }> {
    let cleaned = 0;
    let freedMb = 0;

    const allUsers = await db.select({ id: schema.users.id, planId: schema.users.planId }).from(schema.users);

    for (const user of allUsers) {
      const limits = await this.getUserLimits(user.id);
      const cutoffDate = new Date(Date.now() - limits.repoTtlDays * 24 * 60 * 60 * 1000);

      const expiredProjects = await db.select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.ownerId, user.id),
            lt(schema.projects.lastAccessedAt, cutoffDate),
          ),
        );

      for (const project of expiredProjects) {
        if (!project.path || project.path.startsWith("http")) continue;
        if (!existsSync(project.path)) continue;
        if (!isPathWithinRepos(project.path)) continue;

        const [activeTasks] = await db.select({ count: count() })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.projectId, project.id),
              sql`${schema.tasks.status} IN ('assigned', 'in_progress', 'review')`,
            ),
          );
        if ((activeTasks?.count ?? 0) > 0) continue;

        try {
          const sizeMb = parseFloat(project.diskSizeMb ?? "0");
          await rm(project.path, { recursive: true, force: true });

          await db.update(schema.projects).set({
            path: project.githubUrl ?? project.path,
            diskSizeMb: "0",
            updatedAt: new Date(),
          }).where(eq(schema.projects.id, project.id));

          freedMb += sizeMb;
          cleaned++;
          logger.info(`Cleaned expired repo: ${project.name} (${sizeMb.toFixed(1)}MB)`, "storage-cleanup");
        } catch (err) {
          logger.error(`Failed to cleanup repo ${project.name}: ${err}`, "storage-cleanup");
        }
      }
    }

    return { cleaned, freedMb: Math.round(freedMb * 100) / 100 };
  }

  /** Delete a specific project's local clone */
  async deleteProjectClone(projectId: string): Promise<void> {
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).then(r => r[0]);
    if (!project) throw new Error("Project not found");
    if (!project.path || project.path.startsWith("http")) throw new Error("Project is not locally cloned");
    if (!isPathWithinRepos(project.path)) throw new Error("Invalid project path");

    await rm(project.path, { recursive: true, force: true });
    await db.update(schema.projects).set({
      path: project.githubUrl ?? project.path,
      diskSizeMb: "0",
      updatedAt: new Date(),
    }).where(eq(schema.projects.id, projectId));

    logger.info(`Deleted local clone for project: ${project.name}`, "storage");
  }

  /** Re-clone a project that was previously cleaned up */
  async recloneProject(projectId: string, userId: string): Promise<string> {
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).then(r => r[0]);
    if (!project) throw new Error("Project not found");

    const quota = await this.canCloneRepo(userId);
    if (!quota.allowed) throw new Error(quota.reason ?? "Storage quota exceeded");

    const user = await db.select({ accessToken: schema.users.accessToken }).from(schema.users).where(eq(schema.users.id, userId)).then(r => r[0]);
    if (!user?.accessToken) throw new Error("GitHub access token not found");

    const token = safeDecrypt(user.accessToken);
    const cloneUrl = project.githubUrl ?? project.path;
    if (!cloneUrl.startsWith("http")) throw new Error("No remote URL available for re-clone");

    const userDir = userReposDir(userId);
    await mkdir(userDir, { recursive: true });
    const dirName = project.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    let targetPath = join(userDir, dirName);
    if (existsSync(targetPath)) {
      targetPath = join(userDir, `${dirName}-${nanoid(6)}`);
    }

    await this.git.clone(cloneUrl, targetPath, { type: "https", token }, { depth: 1 });

    const sizeMb = await getDirectorySizeMb(targetPath);
    await db.update(schema.projects).set({
      path: targetPath,
      diskSizeMb: String(sizeMb),
      isShallowClone: true,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.projects.id, projectId));

    logger.info(`Re-cloned project: ${project.name} → ${targetPath} (${sizeMb}MB)`, "storage");
    return targetPath;
  }
}

export const storageService = new StorageService();
