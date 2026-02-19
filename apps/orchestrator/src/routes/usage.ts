import { Router } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { db, schema } from "@agenthub/database";
import { gte, and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();

// Cache account info for 10 minutes to avoid repeated SDK calls
let accountCache: { data: Record<string, unknown>; fetchedAt: number } | null = null;
const ACCOUNT_CACHE_TTL = 10 * 60 * 1000;

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000; // refresh 10 min before expiry

let isRefreshingOAuth = false;

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

async function readCredentials(): Promise<ClaudeCredentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshOAuthToken(creds: ClaudeCredentials): Promise<string | null> {
  const oauth = creds.claudeAiOauth;
  if (!oauth?.refreshToken) return null;

  if (isRefreshingOAuth) {
    // Wait for ongoing refresh
    await new Promise((r) => setTimeout(r, 2000));
    const fresh = await readCredentials();
    return fresh?.claudeAiOauth?.accessToken ?? null;
  }

  isRefreshingOAuth = true;
  try {
    logger.info("Refreshing Claude Code OAuth token", "usage");

    const res = await fetch("https://console.anthropic.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: oauth.refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID,
      }),
    });

    if (!res.ok) {
      logger.warn(`OAuth refresh failed: ${res.status}`, "usage");
      return null;
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Update credentials file
    const newOauth = {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? oauth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    const updatedCreds = { ...creds, claudeAiOauth: newOauth };
    await writeFile(CREDENTIALS_PATH, JSON.stringify(updatedCreds, null, 2), "utf-8");

    logger.info("Claude Code OAuth token refreshed successfully", "usage");
    return data.access_token;
  } catch (error) {
    logger.error(`OAuth refresh error: ${error instanceof Error ? error.message : "Unknown"}`, "usage");
    return null;
  } finally {
    isRefreshingOAuth = false;
  }
}

/**
 * Reads OAuth access token from ~/.claude/.credentials.json
 * Auto-refreshes if token is expired or about to expire.
 */
async function getOAuthToken(): Promise<string | null> {
  try {
    const creds = await readCredentials();
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) return null;

    // Check if token needs refresh
    const needsRefresh = oauth.expiresAt && (oauth.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN);
    if (needsRefresh && oauth.refreshToken) {
      const newToken = await refreshOAuthToken(creds!);
      return newToken ?? oauth.accessToken; // fallback to existing if refresh fails
    }

    return oauth.accessToken;
  } catch {
    return null;
  }
}

// Cache usage limits for 2 minutes (they change frequently)
let usageLimitsCache: { data: Record<string, unknown>; fetchedAt: number } | null = null;
const USAGE_LIMITS_CACHE_TTL = 2 * 60 * 1000;

/**
 * GET /api/usage/summary
 * Aggregated cost and token usage from task executions.
 * Query params: period (24h, 7d, 30d, all)
 */
router.get("/usage/summary", async (req, res) => {
  try {
    const { period = "24h" } = req.query;

    let dateThreshold: Date | null = null;
    if (period === "24h") {
      dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (period === "7d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (period === "30d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 30);
    }

    const conditions = dateThreshold
      ? [gte(schema.tasks.createdAt, dateThreshold)]
      : [];

    const tasks = conditions.length > 0
      ? await db.select().from(schema.tasks).where(and(...conditions)).all()
      : await db.select().from(schema.tasks).all();

    let totalCostUsd = 0;
    let totalTokens = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    const costByModel: Record<string, { cost: number; tasks: number }> = {};

    for (const task of tasks) {
      const cost = task.costUsd ? parseFloat(task.costUsd) : 0;
      const tokens = task.tokensUsed ?? 0;

      totalCostUsd += cost;
      totalTokens += tokens;

      if (task.status === "done") completedTasks++;
      if (task.status === "failed") failedTasks++;

      // Group by agent (as proxy for model)
      if (task.assignedAgentId) {
        if (!costByModel[task.assignedAgentId]) {
          costByModel[task.assignedAgentId] = { cost: 0, tasks: 0 };
        }
        costByModel[task.assignedAgentId].cost += cost;
        costByModel[task.assignedAgentId].tasks += 1;
      }
    }

    // Get agent names for the cost breakdown
    const agents = await db.select().from(schema.agents).all();
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    const costBreakdown = Object.entries(costByModel).map(([agentId, data]) => {
      const agent = agentMap.get(agentId);
      return {
        agentId,
        agentName: agent?.name ?? "Desconhecido",
        model: agent?.model ?? "unknown",
        cost: data.cost,
        tasks: data.tasks,
      };
    }).sort((a, b) => b.cost - a.cost);

    // Aggregate cost per model (not per agent)
    const modelCosts: Record<string, { cost: number; tasks: number; inputTokens: number; outputTokens: number }> = {};
    for (const entry of costBreakdown) {
      if (!modelCosts[entry.model]) {
        modelCosts[entry.model] = { cost: 0, tasks: 0, inputTokens: 0, outputTokens: 0 };
      }
      modelCosts[entry.model].cost += entry.cost;
      modelCosts[entry.model].tasks += entry.tasks;
    }

    res.json({
      period,
      totalCostUsd,
      totalTokens,
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      costBreakdown,
      modelCosts,
    });
  } catch (error) {
    logger.error("Failed to get usage summary", "usage", { error: String(error) });
    res.status(500).json({ error: "Failed to get usage summary" });
  }
});

/**
 * GET /api/usage/account
 * Returns Claude Code account info (subscription type, email, etc.)
 * Uses SDK query().accountInfo() with 10-min cache.
 */
router.get("/usage/account", async (_req, res) => {
  try {
    // Return cache if fresh
    if (accountCache && Date.now() - accountCache.fetchedAt < ACCOUNT_CACHE_TTL) {
      return res.json(accountCache.data);
    }

    // Spawn a minimal SDK query to extract account info
    const conversation = query({
      prompt: "Say OK",
      options: {
        maxTurns: 1,
        permissionMode: "plan",
        allowedTools: [],
      },
    });

    const info = await conversation.accountInfo();

    // Consume the generator to avoid dangling process
    conversation.close();

    const data = {
      email: info.email ?? null,
      organization: info.organization ?? null,
      subscriptionType: info.subscriptionType ?? null,
      tokenSource: info.tokenSource ?? null,
      apiKeySource: info.apiKeySource ?? null,
    };

    accountCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (error) {
    logger.error("Failed to get account info", "usage", { error: String(error) });

    // If cache exists but expired, still return stale data as fallback
    if (accountCache) {
      return res.json(accountCache.data);
    }
    res.status(500).json({ error: "Failed to get account info" });
  }
});

// Cache supported models for 10 minutes
let modelsCache: { data: { value: string; displayName: string; description: string }[]; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL = 10 * 60 * 1000;

/**
 * GET /api/usage/models
 * Returns all models available in the Claude Code CLI.
 * Uses SDK query().supportedModels() with 10-min cache.
 */
router.get("/usage/models", async (_req, res) => {
  try {
    if (modelsCache && Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL) {
      return res.json({ models: modelsCache.data });
    }

    const conversation = query({
      prompt: "Say OK",
      options: {
        maxTurns: 1,
        permissionMode: "plan",
        allowedTools: [],
      },
    });

    const models = await conversation.supportedModels();
    conversation.close();

    const data = models.map((m) => ({
      value: m.value,
      displayName: m.displayName,
      description: m.description,
    }));

    modelsCache = { data, fetchedAt: Date.now() };
    res.json({ models: data });
  } catch (error) {
    logger.error("Failed to get supported models", "usage", { error: String(error) });

    if (modelsCache) {
      return res.json({ models: modelsCache.data });
    }

    // Fallback with known models if SDK is unavailable
    res.json({
      models: [
        { value: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable model" },
        { value: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", description: "Fast and intelligent" },
      ],
    });
  }
});

/**
 * GET /api/usage/connection
 * Checks if Claude Code CLI is connected via OAuth.
 * Returns connection status, account email, and plan info.
 */
router.get("/usage/connection", async (_req, res) => {
  try {
    // Reuse account cache if fresh
    if (accountCache && Date.now() - accountCache.fetchedAt < ACCOUNT_CACHE_TTL) {
      return res.json({
        connected: true,
        email: accountCache.data.email,
        subscriptionType: accountCache.data.subscriptionType,
        tokenSource: accountCache.data.tokenSource,
        apiKeySource: accountCache.data.apiKeySource,
      });
    }

    const conversation = query({
      prompt: "Say OK",
      options: {
        maxTurns: 1,
        permissionMode: "plan",
        allowedTools: [],
      },
    });

    const info = await conversation.accountInfo();
    conversation.close();

    const data = {
      email: info.email ?? null,
      organization: info.organization ?? null,
      subscriptionType: info.subscriptionType ?? null,
      tokenSource: info.tokenSource ?? null,
      apiKeySource: info.apiKeySource ?? null,
    };

    // Update account cache as well
    accountCache = { data, fetchedAt: Date.now() };

    res.json({
      connected: true,
      email: data.email,
      subscriptionType: data.subscriptionType,
      tokenSource: data.tokenSource,
      apiKeySource: data.apiKeySource,
    });
  } catch (error) {
    logger.error("Failed to check connection", "usage", { error: String(error) });
    res.json({
      connected: false,
      email: null,
      subscriptionType: null,
      tokenSource: null,
      apiKeySource: null,
      error: "Claude Code CLI não está conectado",
    });
  }
});

/**
 * GET /api/usage/limits
 * Fetches real-time usage limits from Anthropic OAuth API.
 * Returns session (5h), weekly (all models), weekly (Sonnet only), and extra usage data.
 */
async function fetchAnthropicUsage(token: string): Promise<Response> {
  return fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.0.32",
    },
  });
}

function parseUsageLimits(raw: Record<string, unknown>) {
  const normalize = (entry: Record<string, unknown> | undefined) => {
    if (!entry) return null;
    return {
      utilization: (entry.utilization as number) ?? 0,
      resetsAt: (entry.resets_at as string) ?? null,
    };
  };

  const extraRaw = raw.extra_usage as Record<string, unknown> | undefined;

  return {
    fiveHour: normalize(raw.five_hour as Record<string, unknown>),
    sevenDay: normalize(raw.seven_day as Record<string, unknown>),
    sevenDaySonnet: normalize(raw.seven_day_sonnet as Record<string, unknown>),
    extraUsage: extraRaw ? {
      isEnabled: (extraRaw.is_enabled as boolean) ?? false,
      monthlyLimit: (extraRaw.monthly_limit as number) ?? 0,
      usedCredits: (extraRaw.used_credits as number) ?? 0,
      utilization: (extraRaw.utilization as number) ?? 0,
    } : null,
  };
}

router.get("/usage/limits", async (_req, res) => {
  try {
    // Return cache if fresh
    if (usageLimitsCache && Date.now() - usageLimitsCache.fetchedAt < USAGE_LIMITS_CACHE_TTL) {
      return res.json(usageLimitsCache.data);
    }

    let token = await getOAuthToken();
    if (!token) {
      return res.status(401).json({ error: "OAuth token não encontrado" });
    }

    let response = await fetchAnthropicUsage(token);

    // If 401, force refresh and retry once
    if (response.status === 401) {
      logger.info("Usage API returned 401, attempting token refresh", "usage");
      const creds = await readCredentials();
      if (creds) {
        const newToken = await refreshOAuthToken(creds);
        if (newToken) {
          token = newToken;
          response = await fetchAnthropicUsage(token);
        }
      }
    }

    if (!response.ok) {
      logger.warn("Anthropic usage API returned non-OK", "usage", { status: String(response.status) });
      return res.status(response.status).json({ error: "Falha ao buscar limites de uso" });
    }

    const raw = await response.json() as Record<string, unknown>;
    const data = parseUsageLimits(raw);

    usageLimitsCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (error) {
    logger.error("Failed to fetch usage limits", "usage", { error: String(error) });

    // Return stale cache as fallback
    if (usageLimitsCache) {
      return res.json(usageLimitsCache.data);
    }
    res.status(500).json({ error: "Failed to fetch usage limits" });
  }
});

/**
 * POST /api/usage/disconnect
 * Deletes Claude Code OAuth credentials (~/.claude/.credentials.json).
 */
router.post("/usage/disconnect", async (_req, res) => {
  try {
    const { unlink } = await import("fs/promises");
    try {
      await unlink(CREDENTIALS_PATH);
    } catch {
      // File may not exist
    }
    // Clear caches
    accountCache = null;
    usageLimitsCache = null;
    logger.info("Claude Code CLI disconnected", "usage");
    res.json({ disconnected: true });
  } catch (err) {
    logger.error(`Failed to disconnect Claude: ${err}`, "usage");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

/**
 * GET /api/usage/analytics
 * Aggregated cost/token data grouped by agent, model, or day.
 * Query params: period (7d, 30d, all), groupBy (agent, model, day)
 */
router.get("/usage/analytics", async (req, res) => {
  try {
    const { period = "30d", groupBy = "agent" } = req.query;

    let dateThreshold: Date | null = null;
    if (period === "7d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (period === "30d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 30);
    }

    if (groupBy === "agent") {
      const conditions = dateThreshold
        ? and(gte(schema.tasks.createdAt, dateThreshold))
        : undefined;

      const rows = conditions
        ? await db
            .select({
              agentId: schema.tasks.assignedAgentId,
              agentName: schema.agents.name,
              agentColor: schema.agents.color,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
            .where(conditions)
            .groupBy(schema.tasks.assignedAgentId)
            .all()
        : await db
            .select({
              agentId: schema.tasks.assignedAgentId,
              agentName: schema.agents.name,
              agentColor: schema.agents.color,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
            .groupBy(schema.tasks.assignedAgentId)
            .all();

      const data = rows
        .filter((r) => r.agentId)
        .map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName ?? "Desconhecido",
          agentColor: r.agentColor ?? null,
          totalCost: parseFloat(String(r.totalCost)) || 0,
          totalTokens: Number(r.totalTokens) || 0,
          taskCount: Number(r.taskCount) || 0,
        }))
        .sort((a, b) => b.totalCost - a.totalCost);

      return res.json(data);
    }

    if (groupBy === "model") {
      const conditions = dateThreshold
        ? and(gte(schema.tasks.createdAt, dateThreshold))
        : undefined;

      const rows = conditions
        ? await db
            .select({
              model: schema.agents.model,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
            .where(conditions)
            .groupBy(schema.agents.model)
            .all()
        : await db
            .select({
              model: schema.agents.model,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
            .groupBy(schema.agents.model)
            .all();

      const data = rows
        .filter((r) => r.model)
        .map((r) => ({
          model: r.model!,
          totalCost: parseFloat(String(r.totalCost)) || 0,
          totalTokens: Number(r.totalTokens) || 0,
          taskCount: Number(r.taskCount) || 0,
        }))
        .sort((a, b) => b.totalCost - a.totalCost);

      return res.json(data);
    }

    if (groupBy === "day") {
      const conditions = dateThreshold
        ? and(gte(schema.tasks.createdAt, dateThreshold))
        : undefined;

      const rows = conditions
        ? await db
            .select({
              dateUnix: sql<number>`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER) * 86400`,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .where(conditions)
            .groupBy(sql`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER)`)
            .orderBy(sql`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER)`)
            .all()
        : await db
            .select({
              dateUnix: sql<number>`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER) * 86400`,
              totalCost: sql<string>`COALESCE(SUM(CAST(${schema.tasks.costUsd} AS REAL)), 0)`,
              totalTokens: sql<number>`COALESCE(SUM(${schema.tasks.tokensUsed}), 0)`,
              taskCount: sql<number>`COUNT(${schema.tasks.id})`,
            })
            .from(schema.tasks)
            .groupBy(sql`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER)`)
            .orderBy(sql`CAST(${schema.tasks.createdAt} / 86400 AS INTEGER)`)
            .all();

      const data = rows.map((r) => {
        const totalTokens = Number(r.totalTokens) || 0;
        const inputTokens = Math.round(totalTokens * 0.3);
        const outputTokens = totalTokens - inputTokens;
        return {
          date: new Date(Number(r.dateUnix) * 1000).toISOString().split("T")[0],
          totalCost: parseFloat(String(r.totalCost)) || 0,
          inputTokens,
          outputTokens,
          taskCount: Number(r.taskCount) || 0,
        };
      });

      return res.json(data);
    }

    res.status(400).json({ error: "Invalid groupBy parameter. Use: agent, model, or day" });
  } catch (error) {
    logger.error("Failed to get usage analytics", "usage", { error: String(error) });
    res.status(500).json({ error: "Failed to get usage analytics" });
  }
});

export { router as usageRouter };
