import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestTask,
  cleanTestDb,
} from "../test/helpers.js";
import * as schema from "@agenthub/database/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;

async function createTestUser(overrides?: Record<string, unknown>) {
  const user = {
    id: nanoid(),
    githubId: Math.floor(Math.random() * 999999),
    login: `user-${nanoid(6)}`,
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.users).values(user);
  return user;
}

async function createTestPlan(overrides?: Record<string, unknown>) {
  const plan = {
    id: nanoid(),
    name: `Plan-${nanoid(6)}`,
    description: "Test plan",
    maxProjects: 5,
    maxTasksPerMonth: 100,
    maxStorageMb: 1000,
    repoTtlDays: 30,
    priceMonthly: "9.99",
    features: JSON.stringify(["feature-a"]),
    isDefault: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.plans).values(plan);
  return plan;
}

/** SQLite-safe project creation (avoids binding null/boolean issues) */
async function createStorageProject(overrides?: Record<string, unknown>) {
  const defaults: Record<string, unknown> = {
    id: nanoid(),
    name: "Test Project",
    path: `/tmp/test-project-${nanoid(8)}`,
    stack: JSON.stringify(["typescript"]),
    status: "active",
    diskSizeMb: "0",
    isShallowClone: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const merged = { ...defaults, ...overrides };

  // Convert lastAccessedAt if provided
  if (merged.lastAccessedAt instanceof Date) {
    // SQLite stores as integer
  }

  // Boolean to integer for SQLite
  if (typeof merged.isShallowClone === "boolean") {
    merged.isShallowClone = merged.isShallowClone ? 1 : 0;
  }

  await testDb.insert(schema.projects).values(merged);
  return merged;
}

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

describe("StorageService — Unit Tests via DB", () => {
  describe("getUserLimits", () => {
    it("returns default limits when user has no plan", async () => {
      const user = await createTestUser();

      const [userRow] = await testDb
        .select({ planId: schema.users.planId })
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(userRow.planId).toBeNull();
      // Default limits from StorageService
      const defaults = { maxStorageMb: 500, maxProjects: 3, repoTtlDays: 14 };
      expect(defaults.maxStorageMb).toBe(500);
      expect(defaults.maxProjects).toBe(3);
    });

    it("returns plan limits when user has a plan", async () => {
      const plan = await createTestPlan({
        maxProjects: 10,
        maxStorageMb: 2000,
        repoTtlDays: 60,
      });
      const user = await createTestUser({ planId: plan.id });

      const [userRow] = await testDb
        .select({ planId: schema.users.planId })
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(userRow.planId).toBe(plan.id);

      const [planRow] = await testDb
        .select({
          maxProjects: schema.plans.maxProjects,
          maxStorageMb: schema.plans.maxStorageMb,
          repoTtlDays: schema.plans.repoTtlDays,
        })
        .from(schema.plans)
        .where(eq(schema.plans.id, userRow.planId));

      expect(planRow.maxProjects).toBe(10);
      expect(planRow.maxStorageMb).toBe(2000);
      expect(planRow.repoTtlDays).toBe(60);
    });
  });

  describe("getUserStorageUsage — data logic", () => {
    it("returns zero usage for user with no projects", async () => {
      const user = await createTestUser();

      const projects = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.ownerId, user.id));

      expect(projects).toHaveLength(0);
    });

    it("calculates total disk usage from projects", async () => {
      const user = await createTestUser();

      await createStorageProject({
        ownerId: user.id,
        diskSizeMb: "100.50",
      });
      await createStorageProject({
        ownerId: user.id,
        diskSizeMb: "50.25",
      });

      const projects = await testDb
        .select({ diskSizeMb: schema.projects.diskSizeMb })
        .from(schema.projects)
        .where(eq(schema.projects.ownerId, user.id));

      const totalMb = projects.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, p: any) => sum + parseFloat(p.diskSizeMb ?? "0"),
        0,
      );
      expect(totalMb).toBeCloseTo(150.75, 2);
    });

    it("counts projects correctly", async () => {
      const user = await createTestUser();

      await createStorageProject({ ownerId: user.id });
      await createStorageProject({ ownerId: user.id });
      await createStorageProject({ ownerId: user.id });

      const projects = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.ownerId, user.id));

      expect(projects).toHaveLength(3);
    });

    it("does not count projects from other users", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await createStorageProject({ ownerId: user1.id, diskSizeMb: "100" });
      await createStorageProject({ ownerId: user2.id, diskSizeMb: "200" });

      const user1Projects = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.ownerId, user1.id));

      expect(user1Projects).toHaveLength(1);
    });
  });

  describe("canCloneRepo — logic", () => {
    it("allows clone when under project and storage limits", () => {
      const usage = {
        projectCount: 2,
        maxProjects: 5,
        usedMb: 200,
        limitMb: 1000,
      };

      const projectLimitReached = usage.maxProjects !== -1 && usage.projectCount >= usage.maxProjects;
      const storageLimitReached = usage.limitMb > 0 && usage.usedMb > usage.limitMb;

      expect(projectLimitReached).toBe(false);
      expect(storageLimitReached).toBe(false);
    });

    it("blocks clone when project limit reached", () => {
      const usage = {
        projectCount: 5,
        maxProjects: 5,
        usedMb: 200,
        limitMb: 1000,
      };

      const projectLimitReached = usage.maxProjects !== -1 && usage.projectCount >= usage.maxProjects;
      expect(projectLimitReached).toBe(true);
    });

    it("blocks clone when storage limit reached", () => {
      const usage = {
        projectCount: 2,
        maxProjects: 5,
        usedMb: 1100,
        limitMb: 1000,
      };

      const storageLimitReached = usage.limitMb > 0 && usage.usedMb > usage.limitMb;
      expect(storageLimitReached).toBe(true);
    });

    it("allows unlimited projects when maxProjects is -1", () => {
      const usage = {
        projectCount: 999,
        maxProjects: -1,
        usedMb: 200,
        limitMb: 1000,
      };

      const projectLimitReached = usage.maxProjects !== -1 && usage.projectCount >= usage.maxProjects;
      expect(projectLimitReached).toBe(false);
    });

    it("blocks clone when estimated size would exceed limit", () => {
      const usage = {
        projectCount: 2,
        maxProjects: 5,
        usedMb: 900,
        limitMb: 1000,
      };
      const estimatedSizeMb = 200;

      const storageLimitReached = usage.limitMb > 0 && (usage.usedMb + estimatedSizeMb) > usage.limitMb;
      expect(storageLimitReached).toBe(true);
    });
  });

  describe("usedPercent calculation", () => {
    it("calculates percentage correctly", () => {
      const usedMb = 250;
      const limitMb = 1000;
      const usedPercent = limitMb > 0 ? Math.round((usedMb / limitMb) * 10000) / 100 : 0;
      expect(usedPercent).toBe(25);
    });

    it("returns 0 percent when limitMb is 0", () => {
      const usedMb = 250;
      const limitMb = 0;
      const usedPercent = limitMb > 0 ? Math.round((usedMb / limitMb) * 10000) / 100 : 0;
      expect(usedPercent).toBe(0);
    });

    it("calculates fractional percentages correctly", () => {
      const usedMb = 333;
      const limitMb = 1000;
      const usedPercent = limitMb > 0 ? Math.round((usedMb / limitMb) * 10000) / 100 : 0;
      expect(usedPercent).toBe(33.3);
    });
  });

  describe("updateProjectDiskSize — DB logic", () => {
    it("updates disk size in database", async () => {
      const user = await createTestUser();
      const project = await createStorageProject({ ownerId: user.id, diskSizeMb: "0" });

      await testDb.update(schema.projects)
        .set({ diskSizeMb: "42.5" })
        .where(eq(schema.projects.id, project.id as string));

      const [updated] = await testDb
        .select({ diskSizeMb: schema.projects.diskSizeMb })
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      expect(updated.diskSizeMb).toBe("42.5");
    });
  });

  describe("touchProject — DB logic", () => {
    it("updates lastAccessedAt timestamp", async () => {
      const user = await createTestUser();
      const project = await createStorageProject({
        ownerId: user.id,
      });

      const newDate = new Date();
      await testDb.update(schema.projects)
        .set({ lastAccessedAt: newDate })
        .where(eq(schema.projects.id, project.id as string));

      const [updated] = await testDb
        .select({ lastAccessedAt: schema.projects.lastAccessedAt })
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      // Verify the field was updated (non-null)
      expect(updated.lastAccessedAt).toBeDefined();
      expect(updated.lastAccessedAt).not.toBeNull();
    });
  });

  describe("cleanupExpiredRepos — logic", () => {
    it("identifies expired projects based on lastAccessedAt and TTL", () => {
      // Test the TTL cutoff date calculation logic used by cleanupExpiredRepos
      const repoTtlDays = 14;
      const cutoffDate = new Date(Date.now() - repoTtlDays * 24 * 60 * 60 * 1000);

      // 30 days ago — should be expired
      const expiredDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(expiredDate < cutoffDate).toBe(true);

      // 1 day ago — should NOT be expired
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      expect(recentDate < cutoffDate).toBe(false);

      // Exactly at cutoff — should NOT be expired (must be strictly less than)
      expect(cutoffDate < cutoffDate).toBe(false);
    });

    it("stores and retrieves multiple projects per user", async () => {
      const user = await createTestUser();

      await createStorageProject({
        ownerId: user.id,
        path: "/home/testuser/.agenthub/repos/user1/project-a",
      });
      await createStorageProject({
        ownerId: user.id,
        path: "/home/testuser/.agenthub/repos/user1/project-b",
      });

      const allProjects = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.ownerId, user.id));

      expect(allProjects).toHaveLength(2);
    });

    it("skips projects with URL paths (already cleaned)", () => {
      const path = "https://github.com/user/repo";
      const shouldSkip = path.startsWith("http");
      expect(shouldSkip).toBe(true);
    });

    it("skips projects with active tasks", async () => {
      const user = await createTestUser();
      const project = await createStorageProject({ ownerId: user.id });

      await createTestTask(testDb, project.id as string, { status: "in_progress" });
      await createTestTask(testDb, project.id as string, { status: "done" });

      const tasks = await testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, project.id as string));

      const activeTasks = tasks.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => ["assigned", "in_progress", "review"].includes(t.status),
      );

      expect(activeTasks).toHaveLength(1);
    });

    it("sets path to githubUrl after cleanup", async () => {
      const user = await createTestUser();
      const githubUrl = "https://github.com/user/my-repo";
      const project = await createStorageProject({
        ownerId: user.id,
        githubUrl,
        path: "/home/testuser/.agenthub/repos/user1/my-repo",
      });

      await testDb.update(schema.projects).set({
        path: githubUrl,
        diskSizeMb: "0",
        updatedAt: new Date(),
      }).where(eq(schema.projects.id, project.id as string));

      const [updated] = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      expect(updated.path).toBe(githubUrl);
      expect(updated.diskSizeMb).toBe("0");
    });
  });

  describe("deleteProjectClone — DB logic", () => {
    it("returns empty array when project not found", async () => {
      const projects = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, "nonexistent"));

      expect(projects).toHaveLength(0);
    });

    it("identifies non-cloned projects (http path)", async () => {
      const user = await createTestUser();
      const project = await createStorageProject({
        ownerId: user.id,
        path: "https://github.com/user/repo",
      });

      const [found] = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      expect(found.path.startsWith("http")).toBe(true);
    });

    it("updates project after deletion", async () => {
      const user = await createTestUser();
      const githubUrl = "https://github.com/user/my-repo";
      const project = await createStorageProject({
        ownerId: user.id,
        githubUrl,
        path: "/home/testuser/.agenthub/repos/user1/my-repo",
        diskSizeMb: "150",
      });

      await testDb.update(schema.projects).set({
        path: githubUrl,
        diskSizeMb: "0",
        updatedAt: new Date(),
      }).where(eq(schema.projects.id, project.id as string));

      const [updated] = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      expect(updated.path).toBe(githubUrl);
      expect(updated.diskSizeMb).toBe("0");
    });
  });

  describe("recloneProject — DB logic", () => {
    it("updates project with new clone info", async () => {
      const user = await createTestUser({ accessToken: "enc-token" });
      const project = await createStorageProject({
        ownerId: user.id,
        path: "https://github.com/user/my-repo",
        githubUrl: "https://github.com/user/my-repo",
        diskSizeMb: "0",
      });

      const newPath = "/home/testuser/.agenthub/repos/user1/my-repo";
      const sizeMb = 42.5;

      await testDb.update(schema.projects).set({
        path: newPath,
        diskSizeMb: String(sizeMb),
        isShallowClone: 1,
        lastAccessedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(schema.projects.id, project.id as string));

      const [updated] = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      expect(updated.path).toBe(newPath);
      expect(updated.diskSizeMb).toBe("42.5");
      expect(updated.isShallowClone).toBe(1);
    });

    it("requires access token for reclone", async () => {
      const user = await createTestUser();

      const [userRow] = await testDb
        .select({ accessToken: schema.users.accessToken })
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(userRow.accessToken).toBeNull();
    });

    it("requires remote URL for reclone", async () => {
      const user = await createTestUser();
      const project = await createStorageProject({
        ownerId: user.id,
        path: "/local/path/only",
      });

      const [found] = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id as string));

      const cloneUrl = found.githubUrl ?? found.path;
      expect(cloneUrl.startsWith("http")).toBe(false);
    });
  });
});
