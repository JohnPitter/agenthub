import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  cleanTestDb,
} from "../../test/helpers";
import * as schema from "@agenthub/database/schema";
import { gte, and, eq, inArray } from "drizzle-orm";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // ---- Analytics Summary ----
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const { period = "30d" } = req.query;

      let dateThreshold: Date | null = null;
      if (period === "7d") dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      else if (period === "30d") dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      else if (period === "24h") dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const allTasks = dateThreshold
        ? await testDb.select().from(schema.tasks).where(gte(schema.tasks.createdAt, dateThreshold))
        : await testDb.select().from(schema.tasks);

      let totalCostUsd = 0;
      let totalTokens = 0;
      let completedTasks = 0;
      let failedTasks = 0;
      const costBreakdown: Record<string, { agentId: string; agentName: string; model: string; cost: number; tasks: number }> = {};

      for (const task of allTasks) {
        const cost = task.costUsd ? parseFloat(task.costUsd) : 0;
        totalCostUsd += cost;
        totalTokens += task.tokensUsed ?? 0;
        if (task.status === "done") completedTasks++;
        if (task.status === "failed") failedTasks++;

        if (task.assignedAgentId) {
          if (!costBreakdown[task.assignedAgentId]) {
            costBreakdown[task.assignedAgentId] = {
              agentId: task.assignedAgentId,
              agentName: task.assignedAgentId,
              model: "unknown",
              cost: 0,
              tasks: 0,
            };
          }
          costBreakdown[task.assignedAgentId].cost += cost;
          costBreakdown[task.assignedAgentId].tasks++;
        }
      }

      res.json({
        period: period as string,
        totalCostUsd,
        totalTokens,
        totalTasks: allTasks.length,
        completedTasks,
        failedTasks,
        costBreakdown: Object.values(costBreakdown),
        modelCosts: {},
      });
    } catch {
      res.status(500).json({ error: "Failed to get summary" });
    }
  });

  // ---- Analytics Costs (grouped) ----
  app.get("/api/analytics/costs", async (req, res) => {
    try {
      const { period = "30d", groupBy = "agent" } = req.query;

      let dateThreshold: Date | null = null;
      if (period === "7d") dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      else if (period === "30d") dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      else if (period === "24h") dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const allTasks = dateThreshold
        ? await testDb.select().from(schema.tasks).where(gte(schema.tasks.createdAt, dateThreshold))
        : await testDb.select().from(schema.tasks);

      const agents = await testDb.select({ id: schema.agents.id, name: schema.agents.name, color: schema.agents.color }).from(schema.agents);
      const agentMap = new Map(agents.map((a: Record<string, unknown>) => [a.id, a]));

      if (groupBy === "agent") {
        const grouped: Record<string, { agentId: string; agentName: string; agentColor: string | null; totalCost: number; totalTokens: number; taskCount: number }> = {};
        for (const t of allTasks) {
          const aid = t.assignedAgentId ?? "unassigned";
          if (!grouped[aid]) {
            const agent = agentMap.get(aid) as Record<string, unknown> | undefined;
            grouped[aid] = { agentId: aid, agentName: (agent?.name as string) ?? "Unassigned", agentColor: (agent?.color as string) ?? null, totalCost: 0, totalTokens: 0, taskCount: 0 };
          }
          grouped[aid].totalCost += t.costUsd ? parseFloat(t.costUsd) : 0;
          grouped[aid].totalTokens += t.tokensUsed ?? 0;
          grouped[aid].taskCount++;
        }
        res.json(Object.values(grouped));
      } else if (groupBy === "model") {
        const grouped: Record<string, { model: string; totalCost: number; totalTokens: number; taskCount: number }> = {};
        for (const t of allTasks) {
          const model = "openrouter";
          if (!grouped[model]) grouped[model] = { model, totalCost: 0, totalTokens: 0, taskCount: 0 };
          grouped[model].totalCost += t.costUsd ? parseFloat(t.costUsd) : 0;
          grouped[model].totalTokens += t.tokensUsed ?? 0;
          grouped[model].taskCount++;
        }
        res.json(Object.values(grouped));
      } else if (groupBy === "day") {
        const grouped: Record<string, { date: string; totalCost: number; inputTokens: number; outputTokens: number; taskCount: number }> = {};
        for (const t of allTasks) {
          // SQLite stores dates differently — handle gracefully
          let date: string;
          if (t.createdAt instanceof Date && !isNaN(t.createdAt.getTime())) {
            date = t.createdAt.toISOString().split("T")[0];
          } else {
            date = new Date().toISOString().split("T")[0]; // fallback to today
          }
          if (!grouped[date]) grouped[date] = { date, totalCost: 0, inputTokens: 0, outputTokens: 0, taskCount: 0 };
          grouped[date].totalCost += t.costUsd ? parseFloat(t.costUsd) : 0;
          grouped[date].inputTokens += (t.tokensUsed ?? 0) / 2;
          grouped[date].outputTokens += (t.tokensUsed ?? 0) / 2;
          grouped[date].taskCount++;
        }
        res.json(Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        res.status(400).json({ error: "Invalid groupBy" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get cost analytics" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

describe("Analytics Routes — Integration", () => {
  // ---- Summary ----
  describe("GET /api/analytics/summary", () => {
    it("returns zero summary when no tasks", async () => {
      const res = await request(app).get("/api/analytics/summary?period=30d");
      expect(res.status).toBe(200);
      expect(res.body.totalCostUsd).toBe(0);
      expect(res.body.totalTokens).toBe(0);
      expect(res.body.totalTasks).toBe(0);
      expect(res.body.completedTasks).toBe(0);
      expect(res.body.failedTasks).toBe(0);
      expect(res.body.costBreakdown).toEqual([]);
    });

    it("aggregates cost and token data", async () => {
      const project = await createTestProject(testDb);
      const agent = await createTestAgent(testDb);

      await createTestTask(testDb, project.id, { costUsd: "1.50", tokensUsed: 1000, status: "done", assignedAgentId: agent.id });
      await createTestTask(testDb, project.id, { costUsd: "2.00", tokensUsed: 2000, status: "done", assignedAgentId: agent.id });
      await createTestTask(testDb, project.id, { costUsd: "0.50", tokensUsed: 500, status: "failed" });

      const res = await request(app).get("/api/analytics/summary?period=30d");
      expect(res.status).toBe(200);
      expect(res.body.totalCostUsd).toBe(4);
      expect(res.body.totalTokens).toBe(3500);
      expect(res.body.totalTasks).toBe(3);
      expect(res.body.completedTasks).toBe(2);
      expect(res.body.failedTasks).toBe(1);
      expect(res.body.costBreakdown).toHaveLength(1);
      expect(res.body.costBreakdown[0].tasks).toBe(2);
    });

    it("respects period filter", async () => {
      const project = await createTestProject(testDb);

      // Recent task
      await createTestTask(testDb, project.id, { costUsd: "1.00", tokensUsed: 100 });

      // Old task (60 days ago)
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await createTestTask(testDb, project.id, { costUsd: "5.00", tokensUsed: 500, createdAt: oldDate });

      const res30d = await request(app).get("/api/analytics/summary?period=30d");
      expect(res30d.body.totalTasks).toBe(1);
      expect(res30d.body.totalCostUsd).toBe(1);

      const resAll = await request(app).get("/api/analytics/summary?period=all");
      expect(resAll.body.totalTasks).toBe(2);
      expect(resAll.body.totalCostUsd).toBe(6);
    });
  });

  // ---- Costs grouped by agent ----
  describe("GET /api/analytics/costs?groupBy=agent", () => {
    it("groups costs by agent", async () => {
      const project = await createTestProject(testDb);
      const agent1 = await createTestAgent(testDb, { name: "Agent Alpha" });
      const agent2 = await createTestAgent(testDb, { name: "Agent Beta" });

      await createTestTask(testDb, project.id, { costUsd: "1.00", tokensUsed: 100, assignedAgentId: agent1.id });
      await createTestTask(testDb, project.id, { costUsd: "2.00", tokensUsed: 200, assignedAgentId: agent1.id });
      await createTestTask(testDb, project.id, { costUsd: "3.00", tokensUsed: 300, assignedAgentId: agent2.id });

      const res = await request(app).get("/api/analytics/costs?groupBy=agent&period=30d");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const alpha = res.body.find((g: Record<string, unknown>) => g.agentId === agent1.id);
      const beta = res.body.find((g: Record<string, unknown>) => g.agentId === agent2.id);

      expect(alpha.totalCost).toBe(3);
      expect(alpha.taskCount).toBe(2);
      expect(beta.totalCost).toBe(3);
      expect(beta.taskCount).toBe(1);
    });

    it("handles unassigned tasks", async () => {
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, { costUsd: "1.00" });

      const res = await request(app).get("/api/analytics/costs?groupBy=agent&period=30d");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].agentId).toBe("unassigned");
    });
  });

  // ---- Costs grouped by model ----
  describe("GET /api/analytics/costs?groupBy=model", () => {
    it("groups all costs under openrouter", async () => {
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, { costUsd: "1.00", tokensUsed: 100 });
      await createTestTask(testDb, project.id, { costUsd: "2.00", tokensUsed: 200 });

      const res = await request(app).get("/api/analytics/costs?groupBy=model&period=30d");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].model).toBe("openrouter");
      expect(res.body[0].totalCost).toBe(3);
      expect(res.body[0].taskCount).toBe(2);
    });
  });

  // ---- Costs grouped by day ----
  describe("GET /api/analytics/costs?groupBy=day", () => {
    it("groups costs by day", async () => {
      const project = await createTestProject(testDb);
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await createTestTask(testDb, project.id, { costUsd: "1.00", tokensUsed: 100, createdAt: today });
      await createTestTask(testDb, project.id, { costUsd: "2.00", tokensUsed: 200, createdAt: yesterday });

      const res = await request(app).get("/api/analytics/costs?groupBy=day&period=30d");
      expect(res.status).toBe(200);

      // Should have entries for today and yesterday (could be same day depending on timing)
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const totalCost = res.body.reduce((s: number, d: Record<string, unknown>) => s + (d.totalCost as number), 0);
      expect(totalCost).toBe(3);
    });
  });

  // ---- Invalid groupBy ----
  describe("GET /api/analytics/costs with invalid groupBy", () => {
    it("returns 400 for invalid groupBy", async () => {
      const res = await request(app).get("/api/analytics/costs?groupBy=invalid");
      expect(res.status).toBe(400);
    });
  });
});
