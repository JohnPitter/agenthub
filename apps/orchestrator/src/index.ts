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
import { requestLogger } from "./middleware/request-logger";
import { rateLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { verifyJWT } from "./services/auth-service.js";
import { logger } from "./lib/logger";
import { taskTimeoutManager } from "./tasks/task-lifecycle";
import { taskWatcher } from "./tasks/task-watcher.js";
import { docsRouter } from "./routes/docs.js";
import { openaiRouter } from "./routes/openai.js";
import { codexOAuthRouter, codexCallbackRouter } from "./routes/codex-oauth.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@agenthub/shared";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT ?? "3001");

const app = express();

// Middleware stack
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);
app.use(rateLimiter);

// Public auth routes (no auth required)
app.use("/api/auth", authRouter);
app.use("/callback", codexCallbackRouter); // PUBLIC — OpenAI OAuth redirect

// Auth middleware for all other API routes
app.use("/api", authMiddleware);

// REST API routes (protected)
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/agents", memoriesRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api", gitRouter);
app.use("/api", filesRouter);
app.use("/api", analyticsRouter);
app.use("/api", pullRequestsRouter);
app.use("/api", integrationsRouter);
app.use("/api", usageRouter);
app.use("/api/projects", devServerRouter);
app.use("/api/docs", docsRouter);
app.use("/api/openai", openaiRouter);
app.use("/api/openai", codexOAuthRouter);

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
