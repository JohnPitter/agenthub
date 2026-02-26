import { Router } from "express";
import { client } from "@agenthub/database";
import { logger } from "../lib/logger.js";

export const healthRouter: ReturnType<typeof Router> = Router();

healthRouter.get("/health", async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number; detail?: string }> = {};
  let healthy = true;

  // Database check
  try {
    const start = Date.now();
    await client.execute("SELECT 1");
    checks.database = { status: "ok", latency: Date.now() - start };
  } catch (err) {
    healthy = false;
    checks.database = { status: "fail", detail: err instanceof Error ? err.message : "Unknown error" };
    logger.error(`Health check — database failed: ${err}`, "health");
  }

  // Memory check
  const mem = process.memoryUsage();
  const heapRatio = mem.heapUsed / mem.heapTotal;
  if (heapRatio > 0.95) {
    healthy = false;
    checks.memory = { status: "fail", detail: `Heap usage ${(heapRatio * 100).toFixed(1)}%` };
  } else {
    checks.memory = { status: "ok", detail: `Heap usage ${(heapRatio * 100).toFixed(1)}%` };
  }

  // Uptime check
  checks.uptime = { status: "ok", detail: `${Math.floor(process.uptime())}s` };

  const status = healthy ? "ok" : "degraded";
  res.status(healthy ? 200 : 503).json({
    status,
    checks,
    version: process.env.npm_package_version ?? "0.17.1",
    timestamp: new Date().toISOString(),
  });
});
