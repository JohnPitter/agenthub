import express from "express";
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
import { usageRouter } from "./routes/usage";
import { memoriesRouter } from "./routes/memories.js";
import { devServerRouter } from "./routes/dev-server.js";
import { devServerManager } from "./processes/dev-server-manager.js";
import { setupSocketHandlers } from "./realtime/socket-handler";
import { securityHeaders } from "./middleware/security-headers.js";
import { requestLogger } from "./middleware/request-logger";
import { authLimiter, apiLimiter, gitLimiter, agentLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { verifyJWT } from "./services/auth-service.js";
import { logger } from "./lib/logger";
import { restoreWhatsAppSessions } from "./integrations/whatsapp-service.js";
import { taskTimeoutManager } from "./tasks/task-lifecycle";
import { taskWatcher } from "./tasks/task-watcher.js";
import { docsRouter } from "./routes/docs.js";
import { docsGeneratorRouter } from "./routes/docs-generator.js";
import { openaiRouter } from "./routes/openai.js";
import { codexOAuthRouter, codexCallbackRouter } from "./routes/codex-oauth.js";
import { workflowsRouter } from "./routes/workflows.js";
import { notificationsRouter } from "./routes/notifications.js";
import { teamsRouter } from "./routes/teams.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@agenthub/shared";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT ?? "3001");

const app = express();

// Middleware stack
app.use(securityHeaders);
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);

// Public auth routes (stricter rate limit)
app.use("/api/auth", authLimiter, authRouter);
app.use("/callback", codexCallbackRouter); // PUBLIC — OpenAI OAuth redirect

// Auth middleware for all other API routes
app.use("/api", authMiddleware);

// Git routes (git-specific rate limit)
app.use("/api", gitLimiter, gitRouter);
app.use("/api", gitLimiter, pullRequestsRouter);

// Agent / AI execution routes (higher throughput)
app.use("/api/tasks", agentLimiter, tasksRouter);
app.use("/api/openai", agentLimiter, openaiRouter);
app.use("/api/openai", agentLimiter, codexOAuthRouter);
app.use("/api/workflows", agentLimiter, workflowsRouter);

// All other API routes (default rate limit)
app.use("/api/projects", apiLimiter, projectsRouter);
app.use("/api/agents", apiLimiter, agentsRouter);
app.use("/api/agents", apiLimiter, memoriesRouter);
app.use("/api/messages", apiLimiter, messagesRouter);
app.use("/api/dashboard", apiLimiter, dashboardRouter);
app.use("/api", apiLimiter, filesRouter);
app.use("/api", apiLimiter, analyticsRouter);
app.use("/api", apiLimiter, integrationsRouter);
app.use("/api", apiLimiter, usageRouter);
app.use("/api/projects", apiLimiter, devServerRouter);
app.use("/api/docs", apiLimiter, docsRouter);
app.use("/api/docs-gen", apiLimiter, docsGeneratorRouter);
app.use("/api/notifications", apiLimiter, notificationsRouter);
app.use("/api/teams", apiLimiter, teamsRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Global error handler (must be last)
app.use(errorHandler);

// HTTP + Socket.io server
const httpServer = createServer(app);
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: ["http://localhost:5173", "http://localhost:5174"], methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  if (!cookie) return next(new Error("Authentication required"));
  const match = cookie.match(/agenthub_token=([^;]+)/);
  if (!match) return next(new Error("Authentication required"));
  try {
    verifyJWT(match[1]);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

setupSocketHandlers(io);

// Start task timeout manager
taskTimeoutManager.start();
taskWatcher.start();

httpServer.listen(PORT, () => {
  logger.info(`Orchestrator running on http://localhost:${PORT}`, "server");

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
  devServerManager.stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully", "server");
  taskTimeoutManager.stop();
  taskWatcher.stop();
  devServerManager.stopAll();
  process.exit(0);
});

export { io };
