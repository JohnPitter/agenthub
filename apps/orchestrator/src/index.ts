import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { projectsRouter } from "./routes/projects";
import { tasksRouter } from "./routes/tasks";
import { agentsRouter } from "./routes/agents";
import { messagesRouter } from "./routes/messages";
import { dashboardRouter } from "./routes/dashboard";
import { gitRouter } from "./routes/git";
import { filesRouter } from "./routes/files";
import { analyticsRouter } from "./routes/analytics";
import { pullRequestsRouter } from "./routes/pull-requests";
import { integrationsRouter } from "./routes/integrations";
import { adminRouter } from "./routes/admin.js";
import { plansRouter } from "./routes/plans.js";
import { memoriesRouter } from "./routes/memories.js";
import { devServerRouter } from "./routes/dev-server.js";
import { setupSocketHandlers } from "./realtime/socket-handler";
import { securityHeaders } from "./middleware/security-headers.js";
import { requestLogger } from "./middleware/request-logger";
import { authLimiter, apiLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { verifyJWT, isTokenBlacklisted } from "./services/auth-service.js";
import cookie from "cookie";
import { logger } from "./lib/logger";
import { restoreWhatsAppSessions } from "./integrations/whatsapp-service.js";
import { taskTimeoutManager } from "./tasks/task-lifecycle";
import { taskWatcher } from "./tasks/task-watcher.js";
import { docsRouter } from "./routes/docs.js";
import { docsGeneratorRouter } from "./routes/docs-generator.js";
import { workflowsRouter } from "./routes/workflows.js";
import { notificationsRouter } from "./routes/notifications.js";
import { teamsRouter } from "./routes/teams.js";
import { skillsRouter, agentSkillsRouter } from "./routes/skills.js";
import { storageRouter } from "./routes/storage.js";
import { settingsRouter } from "./routes/settings.js";
import { storageCleanup } from "./tasks/storage-cleanup.js";
import { DEFAULT_AGENTS } from "@agenthub/shared";
import type { ServerToClientEvents, ClientToServerEvents } from "@agenthub/shared";
import { db, schema } from "@agenthub/database";
import { eq, count } from "drizzle-orm";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT ?? "3001");

const app = express();

// Trust first proxy (needed for secure cookies behind reverse proxy / load balancer)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Middleware stack
app.use(securityHeaders);
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:5174"];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);

// Public auth routes (stricter rate limit)
app.use("/api/auth", authLimiter, authRouter);
// Public setup-status check (must be before authMiddleware)
app.get("/api/admin/setup-status", async (_req, res) => {
  try {
    const configs = await db.select().from(schema.openrouterConfig);
    const hasApiKey = configs.length > 0 && !!configs[0]?.apiKey;
    const [planCount] = await db.select({ count: count() }).from(schema.plans);
    const hasPlans = (planCount?.count ?? 0) > 0;
    const [adminCount] = await db.select({ count: count() }).from(schema.users).where(eq(schema.users.role, "admin"));
    const hasAdmin = (adminCount?.count ?? 0) > 0;
    const isSetupComplete = hasApiKey && hasPlans && hasAdmin;
    res.json({ isSetupComplete, steps: { hasAdmin, hasApiKey, hasPlans } });
  } catch (err) {
    logger.error(`Failed to check setup status: ${err}`, "admin");
    res.status(500).json({ error: "Failed to check setup status" });
  }
});
// Auth middleware for all other API routes
app.use("/api", authMiddleware);

// Single API rate limiter applied ONCE for all authenticated routes
app.use("/api", apiLimiter);

// Git routes
app.use("/api", gitRouter);
app.use("/api", pullRequestsRouter);

// Agent / AI execution routes
app.use("/api/tasks", tasksRouter);
app.use("/api/workflows", workflowsRouter);

// All other API routes
app.use("/api/projects", projectsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/agents", memoriesRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api", filesRouter);
app.use("/api", analyticsRouter);
app.use("/api", integrationsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/plans", plansRouter);
app.use("/api/projects", devServerRouter);
app.use("/api/docs", docsRouter);
app.use("/api/docs-gen", docsGeneratorRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/agents", agentSkillsRouter);
app.use("/api/storage", storageRouter);
app.use("/api/settings", settingsRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// In production, serve the web frontend (SPA)
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(process.cwd(), "apps/web/dist");
  app.use(express.static(webDist));
  app.get("{*path}", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

// Global error handler (must be last)
app.use(errorHandler);

// HTTP + Socket.io server
const httpServer = createServer(app);
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigins, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const rawCookie = socket.handshake.headers.cookie;
  if (!rawCookie) return next(new Error("Authentication required"));

  const cookies = cookie.parse(rawCookie);
  const token = cookies.agenthub_token;
  if (!token) return next(new Error("Authentication required"));

  // Check blacklist (logout invalidation)
  if (isTokenBlacklisted(token)) return next(new Error("Token has been revoked"));

  try {
    const payload = verifyJWT(token);
    // Cache user on socket for handlers to use without re-verifying
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

setupSocketHandlers(io);

// Start task timeout manager
taskTimeoutManager.start();
taskWatcher.start();

httpServer.listen(PORT, async () => {
  logger.info(`Orchestrator running on http://localhost:${PORT}`, "server");

  // Sync default agents with current blueprints (tools, model, thinking tokens)
  try {
    const defaultAgents = await db.select().from(schema.agents).where(eq(schema.agents.isDefault, true));
    let synced = 0;
    for (const agent of defaultAgents) {
      const blueprint = DEFAULT_AGENTS.find((b) => b.role === agent.role);
      if (!blueprint) continue;

      const updates: Record<string, unknown> = {};

      // Sync allowedTools
      const currentTools = JSON.stringify(JSON.parse(agent.allowedTools || "[]").sort());
      const blueprintTools = JSON.stringify([...blueprint.allowedTools].sort());
      if (currentTools !== blueprintTools) {
        updates.allowedTools = JSON.stringify(blueprint.allowedTools);
      }

      // Sync model
      if (agent.model !== blueprint.model) {
        updates.model = blueprint.model;
      }

      // Sync maxThinkingTokens
      if (agent.maxThinkingTokens !== blueprint.maxThinkingTokens) {
        updates.maxThinkingTokens = blueprint.maxThinkingTokens;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));
        const changedFields = Object.keys(updates).filter(k => k !== "updatedAt").join(", ");
        logger.info(`Synced ${changedFields} for ${agent.name}`, "startup");
        synced++;
      }
    }
    if (synced > 0) {
      logger.info(`Synced ${synced} default agent(s)`, "startup");
    }
  } catch (err) {
    logger.error(`Failed to sync default agent tools: ${err}`, "startup");
  }

  // Start storage cleanup scheduler
  storageCleanup.start();

  // Auto-restore WhatsApp sessions (fire-and-forget)
  restoreWhatsAppSessions().catch((err) => {
    logger.error(`Failed to restore WhatsApp sessions: ${err}`, "whatsapp");
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully", "server");
  taskTimeoutManager.stop();
  taskWatcher.stop();
  storageCleanup.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully", "server");
  taskTimeoutManager.stop();
  taskWatcher.stop();
  storageCleanup.stop();
  process.exit(0);
});

export { io };
