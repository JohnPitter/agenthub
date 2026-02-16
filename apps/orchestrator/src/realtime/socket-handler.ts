import type { Server as SocketServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@agenthub/shared";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { agentManager } from "../agents/agent-manager";
import { transitionTask } from "../tasks/task-lifecycle";
import { eventBus } from "./event-bus";
import { logger } from "../lib/logger";
import { GitService } from "../git/git-service";
import { GitHubService } from "../git/github-service";
import { decrypt } from "../lib/encryption";

const gitService = new GitService();
const githubService = new GitHubService();

export function setupSocketHandlers(
  io: SocketServer<ClientToServerEvents, ServerToClientEvents>,
) {
  // Bridge EventBus → Socket.io
  setupEventBridge(io);

  io.on("connection", (socket) => {
    logger.info(`Client connected: ${socket.id}`, "socket");

    // Join project room
    socket.on("project:select", ({ projectId }) => {
      socket.join(`project:${projectId}`);
      logger.debug(`Socket ${socket.id} joined project:${projectId}`, "socket");
    });

    socket.on("board:subscribe", ({ projectId }) => {
      socket.join(`project:${projectId}`);
    });

    socket.on("board:unsubscribe", ({ projectId }) => {
      socket.leave(`project:${projectId}`);
    });

    // User sends a message → route through workflow (Tech Lead → Architect → Dev)
    socket.on("user:message", async ({ projectId, content, agentId }) => {
      logger.info(`User message in ${projectId}: ${content.slice(0, 100)}`, "socket");

      // Find Tech Lead
      const agents = await db.select().from(schema.agents);
      const techLead = agents.find((a) => a.role === "tech_lead" && a.isActive);

      if (!techLead) {
        logger.warn("No Tech Lead agent available", "socket");
        return;
      }

      // Create a task from the user message
      const task = {
        id: nanoid(),
        projectId,
        title: content.slice(0, 200),
        description: content,
        priority: "medium" as const,
        category: null,
        assignedAgentId: techLead.id,
        status: "created" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.tasks).values(task);
      eventBus.emit("task:created", { task });

      // If a specific agent was requested, assign directly (skip workflow)
      if (agentId) {
        await agentManager.assignTask(task.id, agentId);
      } else {
        // Run the full workflow: Tech Lead → Architect → Dev
        await agentManager.runWorkflow(task.id, techLead.id);
      }
    });

    // User explicitly creates a task
    socket.on("user:create_task", async ({ projectId, description }) => {
      logger.info(`Create task in ${projectId}: ${description.slice(0, 100)}`, "socket");

      const task = {
        id: nanoid(),
        projectId,
        title: description.slice(0, 200),
        description,
        priority: "medium" as const,
        category: null,
        assignedAgentId: null,
        status: "created" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.tasks).values(task);
      eventBus.emit("task:created", { task });
    });

    // Execute a task with a specific agent
    socket.on("user:execute_task", async ({ taskId, agentId }) => {
      logger.info(`Execute task ${taskId} with agent ${agentId}`, "socket");
      await agentManager.assignTask(taskId, agentId);
    });

    // Cancel a running task
    socket.on("user:cancel_task", async ({ taskId }) => {
      logger.info(`Cancel task: ${taskId}`, "socket");
      await agentManager.cancelTask(taskId);
    });

    // Approve a task in review
    socket.on("user:approve_task", async ({ taskId }) => {
      logger.info(`Approve task: ${taskId}`, "socket");
      await transitionTask(taskId, "done", undefined, "Approved by user");

      // Git auto-commit logic
      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (!task) return;

      const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get();
      if (!project) return;

      const gitConfig = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, task.projectId),
            eq(schema.integrations.type, "git")
          )
        )
        .get();

      if (gitConfig && gitConfig.config) {
        const config = JSON.parse(gitConfig.config);

        if (config.autoCommit) {
          // Auto-commit enabled
          try {
            const commitMessage = `feat(task-${task.id}): ${task.title}`;

            await gitService.stageAll(project.path);
            const commitSha = await gitService.commit(project.path, commitMessage);

            // Log commit in taskLogs
            await db.insert(schema.taskLogs).values({
              id: crypto.randomUUID(),
              taskId: task.id,
              agentId: task.assignedAgentId,
              action: "git_commit",
              fromStatus: null,
              toStatus: null,
              detail: commitSha,
              filePath: null,
              createdAt: new Date(),
            });

            // Update task.result
            await db.update(schema.tasks).set({
              result: `Committed as ${commitSha}`,
            }).where(eq(schema.tasks.id, taskId));

            // Emit event
            eventBus.emit("task:git_commit", {
              taskId: task.id,
              projectId: task.projectId,
              commitSha,
              commitMessage,
              branchName: task.branch || "main",
            });

            logger.info(`Auto-committed task ${taskId}: ${commitSha}`, "socket");
          } catch (error) {
            logger.error(`Failed to auto-commit task ${taskId}: ${error}`, "socket");
          }
        } else {
          // Auto-commit disabled - emit ready to commit event
          try {
            const changedFiles = await gitService.getChangedFiles(project.path);
            if (changedFiles.length > 0) {
              eventBus.emit("task:ready_to_commit", {
                taskId: task.id,
                projectId: task.projectId,
                changedFiles,
              });
            }
          } catch (error) {
            logger.error(`Failed to check changed files for task ${taskId}: ${error}`, "socket");
          }
        }
      }
    });

    // Manual commit for a task
    socket.on("user:commit_task", async ({ taskId, message }) => {
      logger.info(`Manual commit for task: ${taskId}`, "socket");

      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (!task) return;

      const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get();
      if (!project) return;

      try {
        await gitService.stageAll(project.path);
        const commitSha = await gitService.commit(project.path, message);

        // Log commit in taskLogs
        await db.insert(schema.taskLogs).values({
          id: crypto.randomUUID(),
          taskId: task.id,
          agentId: task.assignedAgentId,
          action: "git_commit",
          fromStatus: null,
          toStatus: null,
          detail: commitSha,
          filePath: null,
          createdAt: new Date(),
        });

        // Update task.result
        await db.update(schema.tasks).set({
          result: `Committed as ${commitSha}`,
        }).where(eq(schema.tasks.id, taskId));

        // Emit event
        eventBus.emit("task:git_commit", {
          taskId: task.id,
          projectId: task.projectId,
          commitSha,
          commitMessage: message,
          branchName: task.branch || "main",
        });

        logger.info(`Manual commit for task ${taskId}: ${commitSha}`, "socket");

        // Auto-push logic
        const gitConfig = await db
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.projectId, task.projectId),
              eq(schema.integrations.type, "git")
            )
          )
          .get();

        if (gitConfig && gitConfig.config) {
          const config = JSON.parse(gitConfig.config);

          if (config.pushOnCommit) {
            try {
              const credentials = gitConfig.credentials
                ? JSON.parse(decrypt(gitConfig.credentials))
                : undefined;

              await gitService.push(
                project.path,
                task.branch || config.defaultBranch || "main",
                "origin",
                credentials
              );

              eventBus.emit("task:git_push", {
                taskId: task.id,
                projectId: task.projectId,
                branchName: task.branch || config.defaultBranch || "main",
                commitSha,
                remote: "origin",
              });

              logger.info(`Auto-pushed task ${taskId} to remote`, "socket");

              // Auto-PR after push
              const pushBranch = task.branch || config.defaultBranch || "main";
              await tryAutoPR(task, project.path, pushBranch, config);
            } catch (error) {
              logger.error(`Auto-push failed for task ${taskId}: ${error}`, "socket");

              eventBus.emit("task:git_push_error", {
                taskId: task.id,
                projectId: task.projectId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to manual commit task ${taskId}: ${error}`, "socket");
      }
    });

    // Manual push for a task
    socket.on("user:push_task", async ({ taskId }) => {
      logger.info(`Manual push for task: ${taskId}`, "socket");

      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (!task) {
        logger.warn(`Task not found for push: ${taskId}`, "socket");
        return;
      }

      const project = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, task.projectId))
        .get();

      if (!project) {
        logger.warn(`Project not found for push: ${task.projectId}`, "socket");
        return;
      }

      const gitConfig = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, task.projectId),
            eq(schema.integrations.type, "git")
          )
        )
        .get();

      if (!gitConfig) {
        logger.warn(`Git integration not configured for project: ${task.projectId}`, "socket");
        eventBus.emit("task:git_push_error", {
          taskId: task.id,
          projectId: task.projectId,
          error: "Git integration not configured",
        });
        return;
      }

      try {
        const config = gitConfig.config ? JSON.parse(gitConfig.config) : {};
        const credentials = gitConfig.credentials
          ? JSON.parse(decrypt(gitConfig.credentials))
          : undefined;

        const branchName = task.branch || config.defaultBranch || "main";

        await gitService.push(project.path, branchName, "origin", credentials);

        // Get current commit SHA
        const commitSha = task.result?.match(/Committed as ([a-f0-9]+)/)?.[1] || "";

        eventBus.emit("task:git_push", {
          taskId: task.id,
          projectId: task.projectId,
          branchName,
          commitSha,
          remote: "origin",
        });

        logger.info(`Manual push for task ${taskId} to remote`, "socket");

        // Auto-PR after push
        await tryAutoPR(task, project.path, branchName, config);
      } catch (error) {
        logger.error(`Manual push failed for task ${taskId}: ${error}`, "socket");

        eventBus.emit("task:git_push_error", {
          taskId: task.id,
          projectId: task.projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Reject a task with feedback → re-assign to original agent
    socket.on("user:reject_task", async ({ taskId, feedback }) => {
      logger.info(`Reject task: ${taskId} with feedback`, "socket");
      await transitionTask(taskId, "changes_requested", undefined, feedback);

      // Re-assign to original agent with feedback
      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (task?.assignedAgentId) {
        const updatedDescription = [
          task.description ?? "",
          "\n\n---\n## Feedback do Review\n",
          feedback,
          "\n\nPor favor, implemente as mudanças solicitadas acima.",
        ].join("");

        await db.update(schema.tasks).set({
          description: updatedDescription,
          updatedAt: new Date(),
        }).where(eq(schema.tasks.id, taskId));

        await agentManager.assignTask(taskId, task.assignedAgentId);
        logger.info(`Re-assigned rejected task ${taskId} to agent ${task.assignedAgentId}`, "socket");
      }
    });

    socket.on("disconnect", () => {
      logger.debug(`Client disconnected: ${socket.id}`, "socket");
    });
  });
}

/**
 * Auto-create PR after a successful push if autoPR is enabled in git config.
 */
async function tryAutoPR(task: { id: string; projectId: string; title: string; branch: string | null }, projectPath: string, branchName: string, config: Record<string, unknown>) {
  if (!config.autoPR) return;

  try {
    // Check if a PR already exists for this branch
    const existingPR = await githubService.findPRForBranch(projectPath, branchName);
    if (existingPR) {
      logger.debug(`PR already exists for branch ${branchName}: #${existingPR.number}`, "socket");
      return;
    }

    const baseBranch = (config.defaultBranch as string) || "main";
    const pr = await githubService.createPR(projectPath, {
      title: task.title,
      body: `Automated PR for task \`${task.id}\`\n\nBranch: \`${branchName}\` → \`${baseBranch}\``,
      headBranch: branchName,
      baseBranch,
      draft: false,
    });

    if (pr) {
      // Log PR creation
      await db.insert(schema.taskLogs).values({
        id: crypto.randomUUID(),
        taskId: task.id,
        agentId: null,
        action: "pr_created",
        fromStatus: null,
        toStatus: null,
        detail: JSON.stringify({ prNumber: pr.number, prUrl: pr.url }),
        filePath: null,
        createdAt: new Date(),
      });

      eventBus.emit("task:pr_created", {
        taskId: task.id,
        projectId: task.projectId,
        prNumber: pr.number,
        prUrl: pr.url,
        prTitle: pr.title,
        headBranch: branchName,
        baseBranch,
      });

      logger.info(`Auto-PR created for task ${task.id}: #${pr.number}`, "socket");
    }
  } catch (error) {
    logger.error(`Auto-PR failed for task ${task.id}: ${error}`, "socket");
  }
}

function setupEventBridge(io: SocketServer<ClientToServerEvents, ServerToClientEvents>) {
  // Forward all events from EventBus to Socket.io rooms
  eventBus.on("agent:status", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:status", data);
  });

  eventBus.on("agent:message", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:message", data);
  });

  eventBus.on("agent:stream", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:stream", data);
  });

  eventBus.on("agent:tool_use", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:tool_use", data);
  });

  eventBus.on("agent:result", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:result", data);
  });

  eventBus.on("agent:error", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:error", data);
  });

  eventBus.on("agent:notification", (data) => {
    io.to(`project:${data.projectId}`).emit("agent:notification", data);
  });

  eventBus.on("task:status", (data) => {
    io.emit("task:status", data);
  });

  eventBus.on("task:created", (data) => {
    io.emit("task:created", data);
  });

  eventBus.on("task:updated", (data) => {
    io.emit("task:updated", data);
  });

  eventBus.on("task:queued", (data) => {
    io.to(`project:${data.projectId}`).emit("task:queued", data);
  });

  eventBus.on("task:git_branch", (data) => {
    io.to(`project:${data.projectId}`).emit("task:git_branch", data);
  });

  eventBus.on("task:git_commit", (data) => {
    io.to(`project:${data.projectId}`).emit("task:git_commit", data);
  });

  eventBus.on("task:ready_to_commit", (data) => {
    io.to(`project:${data.projectId}`).emit("task:ready_to_commit", data);
  });

  eventBus.on("task:git_push", (data) => {
    io.to(`project:${data.projectId}`).emit("task:git_push", data);
  });

  eventBus.on("task:git_push_error", (data) => {
    io.to(`project:${data.projectId}`).emit("task:git_push_error", data);
  });

  eventBus.on("task:pr_created", (data) => {
    io.to(`project:${data.projectId}`).emit("task:pr_created", data);
  });

  eventBus.on("task:pr_merged", (data) => {
    io.to(`project:${data.projectId}`).emit("task:pr_merged", data);
  });

  eventBus.on("workflow:phase", (data) => {
    io.to(`project:${data.projectId}`).emit("workflow:phase", data);
  });

  eventBus.on("board:activity", (data) => {
    io.to(`project:${data.projectId}`).emit("board:activity", data);
  });

  eventBus.on("board:agent_cursor", (data) => {
    io.to(`project:${data.projectId}`).emit("board:agent_cursor", data);
  });

  eventBus.on("integration:status", (data) => {
    io.emit("integration:status", data);
  });

  eventBus.on("integration:message", (data) => {
    io.emit("integration:message", data);
  });

  logger.info("EventBus → Socket.io bridge established", "socket");
}
