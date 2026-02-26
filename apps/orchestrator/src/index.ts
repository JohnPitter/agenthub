import express from "express";
import cors from "cors";
import helmet from "helmet";
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
import { usageRouter } from "./routes/usage";
import { memoriesRouter } from "./routes/memories.js";
import { devServerRouter } from "./routes/dev-server.js";
import { devServerManager } from "./processes/dev-server-manager.js";
import { setupSocketHandlers } from "./realtime/socket-handler";
import { healthRouter } from "./routes/health.js";
import { requestLogger } from "./middleware/request-logger";
import { authLimiter, apiLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { verifyJWT } from "./services/auth-service.js";
import { logger } from "./lib/logger";
import { env } from "./lib/env.js";
import { restoreWhatsAppSessions } from "./integrations/whatsapp-service.js";
import { taskTimeoutManager } from "./tasks/task-lifecycle";
import { taskWatcher } from "./tasks/task-watcher.js";
import { docsRouter } from "./routes/docs.js";
import { docsGeneratorRouter } from "./routes/docs-generator.js";
import { openaiRouter } from "./routes/openai.js";
import { geminiRouter } from "./routes/gemini.js";
import { codexOAuthRouter, codexCallbackRouter } from "./routes/codex-oauth.js";
import { claudeOAuthRouter, claudeCallbackRouter } from "./routes/claude-oauth.js";
import { geminiOAuthRouter, geminiCallbackRouter } from "./routes/gemini-oauth.js";
import { workflowsRouter } from "./routes/workflows.js";
import { notificationsRouter } from "./routes/notifications.js";
import { teamsRouter } from "./routes/teams.js";
import { skillsRouter, agentSkillsRouter } from "./routes/skills.js";
import { DEFAULT_AGENTS } from "@agenthub/shared";
import type { ServerToClientEvents, ClientToServerEvents } from "@agenthub/shared";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";

const { PORT, CORS_ORIGINS } = env;

const app = express();

// Middleware stack
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Monaco Editor workers
}));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);

// Public health check (before auth)
app.use(healthRouter);

// Public auth routes (stricter rate limit)
app.use("/api/auth", authLimiter, authRouter);
app.use("/callback", codexCallbackRouter); // PUBLIC — OpenAI OAuth redirect
app.use("/callback/claude", claudeCallbackRouter); // PUBLIC — Claude OAuth redirect
app.use("/callback/gemini", geminiCallbackRouter); // PUBLIC — Gemini OAuth redirect

// Auth middleware for all other API routes
app.use("/api", authMiddleware);

// Single API rate limiter applied ONCE for all authenticated routes
app.use("/api", apiLimiter);

// Git routes
app.use("/api", gitRouter);
app.use("/api", pullRequestsRouter);

// Agent / AI execution routes
app.use("/api/tasks", tasksRouter);
app.use("/api/openai", openaiRouter);
app.use("/api/openai", codexOAuthRouter);
app.use("/api/claude", claudeOAuthRouter);
app.use("/api/gemini", geminiRouter);
app.use("/api/gemini", geminiOAuthRouter);
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
app.use("/api", usageRouter);
app.use("/api/projects", devServerRouter);
app.use("/api/docs", docsRouter);
app.use("/api/docs-gen", docsGeneratorRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/agents", agentSkillsRouter);

// Global error handler (must be last)
app.use(errorHandler);

// HTTP + Socket.io server
const httpServer = createServer(app);
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  if (!cookie) return next(new Error("Authentication required"));
  const match = cookie.match(/agenthub_token=([^;]+)/);
  if (!match) return next(new Error("Authentication required"));
  try {
    const payload = verifyJWT(match[1]);
    socket.data.userId = payload.userId;
    socket.data.login = payload.login;
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

  // Sync default agents' allowedTools with current blueprints
  try {
    const defaultAgents = await db.select().from(schema.agents).where(eq(schema.agents.isDefault, true));
    let synced = 0;
    for (const agent of defaultAgents) {
      const blueprint = DEFAULT_AGENTS.find((b) => b.role === agent.role);
      if (!blueprint) continue;
      const currentTools = JSON.stringify(JSON.parse(agent.allowedTools || "[]").sort());
      const blueprintTools = JSON.stringify([...blueprint.allowedTools].sort());
      if (currentTools !== blueprintTools) {
        await db
          .update(schema.agents)
          .set({ allowedTools: JSON.stringify(blueprint.allowedTools), updatedAt: new Date() })
          .where(eq(schema.agents.id, agent.id));
        logger.info(`Synced tools for ${agent.name}: ${blueprint.allowedTools.join(", ")}`, "startup");
        synced++;
      }
    }
    if (synced > 0) {
      logger.info(`Synced allowedTools for ${synced} default agent(s)`, "startup");
    }
  } catch (err) {
    logger.error(`Failed to sync default agent tools: ${err}`, "startup");
  }

  // Auto-restore WhatsApp sessions (fire-and-forget)
  restoreWhatsAppSessions().catch((err) => {
    logger.error(`Failed to restore WhatsApp sessions: ${err}`, "whatsapp");
  });
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`, "server");
  taskTimeoutManager.stop();
  taskWatcher.stop();
  devServerManager.stopAll();

  // Close HTTP + Socket.io servers, wait up to 30s for active connections to drain
  io.close();
  httpServer.close(() => {
    logger.info("All connections closed, exiting", "server");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Graceful shutdown timeout (30s), forcing exit", "server");
    process.exit(1);
  }, 30_000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export { io };
