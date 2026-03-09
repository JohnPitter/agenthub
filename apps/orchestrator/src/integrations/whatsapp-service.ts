import wppconnect from "@wppconnect-team/wppconnect";
import type { Whatsapp, Message } from "@wppconnect-team/wppconnect";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { eventBus } from "../realtime/event-bus.js";
import { handleReceptionistMessage, type ContentBlock, type ReceptionistAction } from "../agents/receptionist-service.js";
import {
  listTasks,
  getTaskDetail,
  createTask,
  advanceTaskStatus,
  listAgents,
  getProjectOverview,
  assignTaskToAgent,
  listProjects,
} from "./whatsapp-ops.js";

const TOKEN_DIR = path.join(process.cwd(), "data", "whatsapp-tokens");

const STATUS_EMOJI: Record<string, string> = {
  created: "📋", assigned: "📌", in_progress: "🔄", review: "👀",
  changes_requested: "📝", done: "✅", cancelled: "❌", blocked: "🚧", failed: "💥",
};

interface WhatsAppServiceConfig {
  projectId: string;
  linkedAgentId?: string;
  allowedNumber?: string;
}

/** Tracks a WhatsApp user watching a task's real-time status */
interface TaskWatcher {
  whatsappNumber: string;
  taskId: string;
  taskTitle: string;
}

export class WhatsAppService {
  private client: Whatsapp | null = null;
  private config: WhatsAppServiceConfig;
  private integrationId: string;
  private isConnecting = false;
  private listenersAttached = false;

  /** taskId → TaskWatcher — active real-time watchers */
  private taskWatchers = new Map<string, TaskWatcher>();
  /** whatsappNumber → taskId — pending "do you want to track?" confirmations */
  private pendingTrackConfirmations = new Map<string, string>();

  constructor(config: WhatsAppServiceConfig, integrationId: string) {
    this.config = config;
    this.integrationId = integrationId;
    this.setupTaskWatcherListeners();
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.client) {
      logger.warn("WhatsApp already connecting or connected", "whatsapp");
      return;
    }

    this.isConnecting = true;
    this.listenersAttached = false;
    await this.updateIntegrationStatus("connecting");

    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    this.cleanStaleLocks();

    // Fire-and-forget — route responds immediately
    this.startConnection().catch((error) => {
      logger.error(
        `WhatsApp background connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "whatsapp"
      );
    });
  }

  private async startConnection(): Promise<void> {
    try {
      this.client = await wppconnect.create({
        session: `agenthub-${this.integrationId}`,
        headless: true,
        logQR: true,
        autoClose: 0,
        disableWelcome: true,
        updatesLog: false,
        waitForLogin: true,
        folderNameToken: TOKEN_DIR,
        deviceName: "AgentHub",
        useChrome: true,
        browserArgs: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        puppeteerOptions: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
          protocolTimeout: 300000,
        },

        catchQR: (base64Qr: string, _asciiQR: string, attempt: number) => {
          logger.info(`QR code received (attempt ${attempt}), emitting to client`, "whatsapp");
          eventBus.emit("integration:status", {
            type: "whatsapp",
            status: "connecting",
            qr: base64Qr,
          });
        },

        statusFind: (status: string, _session: string) => {
          logger.info(`WhatsApp status: ${status}`, "whatsapp");

          if (status === "inChat" || status === "isLogged") {
            // Don't call onConnected here — this.client is still null
            // because wppconnect.create() hasn't returned yet.
            // Just update status; listeners will be attached after create() resolves.
            this.isConnecting = false;
            this.updateIntegrationStatus("connected");
            eventBus.emit("integration:status", { type: "whatsapp", status: "connected" });
          } else if (status === "browserClose" || status === "serverClose" || status === "desconnectedMobile") {
            this.handleDisconnect(status);
          } else if (status === "autocloseCalled" || status === "qrReadError") {
            this.handleError(status);
          }
        },
      });

      // client is now set — attach message listeners
      this.onConnected();
    } catch (error) {
      logger.error(
        `WhatsApp connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "whatsapp"
      );
      await this.updateIntegrationStatus("error");
      eventBus.emit("integration:status", { type: "whatsapp", status: "error" });
      try { await this.client?.close(); } catch { /* ignore */ }
      this.client = null;
      this.isConnecting = false;
    }
  }

  private async onConnected(): Promise<void> {
    if (this.listenersAttached) return;
    if (!this.client) {
      logger.warn("onConnected called but client is null, skipping", "whatsapp");
      return;
    }
    this.listenersAttached = true;
    this.isConnecting = false;

    logger.info("WhatsApp connection established, attaching message listeners", "whatsapp");
    await this.updateIntegrationStatus("connected");
    eventBus.emit("integration:status", { type: "whatsapp", status: "connected" });

    this.client.onMessage(async (msg: Message) => {
      try {
        if (msg.fromMe) return;

        // Whitelist check — only allow messages from the authorized number
        if (this.config.allowedNumber) {
          const senderNumber = msg.from.replace("@c.us", "");
          const allowed = this.config.allowedNumber.replace(/\D/g, "");
          if (senderNumber !== allowed) {
            logger.info(`Blocked message from unauthorized number: ${msg.from}`, "whatsapp");
            return;
          }
        }

        const from = msg.from;
        const contactName =
          msg.sender?.pushname || msg.sender?.formattedName || from;

        const { content, textForLog } = await this.buildMessageContent(msg);

        logger.info(
          `WhatsApp message from ${contactName} (${from}): ${textForLog}`,
          "whatsapp",
        );

        // Save incoming message
        await db.insert(schema.messages).values({
          id: nanoid(),
          projectId: this.config.projectId,
          agentId: this.config.linkedAgentId || null,
          source: "whatsapp",
          content: textForLog,
          contentType: "text",
          metadata: JSON.stringify({
            from,
            contactName,
            messageId: msg.id,
            timestamp: msg.timestamp,
          }),
        });

        eventBus.emit("integration:message", {
          type: "whatsapp",
          from: contactName,
          content: textForLog,
        });

        // Route to the appropriate handler
        await this.handleIncomingMessage(from, contactName, textForLog, content);
      } catch (error) {
        logger.error(
          `Failed to process WhatsApp message: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "whatsapp",
        );
      }
    });

    this.client.onStateChange((state: string) => {
      logger.info(`WhatsApp state changed: ${state}`, "whatsapp");
      if (state === "CONFLICT" || state === "UNPAIRED" || state === "UNLAUNCHED") {
        this.handleDisconnect(state);
      }
    });
  }

  // ─── Message Routing ────────────────────────────────────────────────

  private async handleIncomingMessage(
    from: string,
    contactName: string,
    text: string,
    content: string | ContentBlock[],
  ): Promise<void> {
    // Check if this is a response to a tracking confirmation
    if (this.handleTrackConfirmation(from, text)) return;

    const lower = text.trim().toLowerCase();

    // Unwatch command — stop all real-time tracking for this user
    if (lower === "/unwatch") {
      let count = 0;
      for (const [taskId, watcher] of this.taskWatchers) {
        if (watcher.whatsappNumber === from) {
          this.taskWatchers.delete(taskId);
          count++;
        }
      }
      const msg = count > 0
        ? `✅ Stopped tracking ${count} task(s).`
        : `ℹ️ You are not tracking any tasks.`;
      await this.sendMessage(from, msg);
      return;
    }

    // Quick commands — no Receptionist API call, direct ops
    if (lower === "/status" || lower === "/tasks") {
      const result = await listTasks(this.config.projectId);
      await this.sendMessage(from, result);
      return;
    }

    if (lower === "/help" || lower === "/ajuda") {
      await this.sendMessage(from, this.getHelpText());
      return;
    }

    // Everything else → Receptionist AI + action dispatcher
    await this.handleWithReceptionist(from, contactName, text, content);
  }

  private async handleWithReceptionist(
    from: string,
    contactName: string,
    text: string,
    content: string | ContentBlock[],
  ): Promise<void> {
    const receptionist = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.role, "receptionist"))
      .get();

    if (!receptionist) {
      logger.warn(
        "No receptionist agent found, falling back to direct Tech Lead routing",
        "whatsapp",
      );
      await this.routeToTechLead(from, contactName, text);
      return;
    }

    const response = await handleReceptionistMessage(
      receptionist.id,
      this.config.projectId,
      from,
      content,
    );

    // Send the receptionist's natural language response
    await this.sendMessage(from, response.text);

    // Execute action if present
    if (response.parsedAction) {
      await this.executeAction(from, contactName, response.parsedAction);
    }
  }

  private async executeAction(
    from: string,
    contactName: string,
    action: ReceptionistAction,
  ): Promise<void> {
    const projectId = this.config.projectId;
    let result: string;

    try {
      switch (action.action) {
        case "list_tasks":
          result = await listTasks(projectId, action.status as string | undefined);
          break;
        case "get_task":
          result = await getTaskDetail(action.taskId as string);
          break;
        case "list_projects":
          result = await listProjects();
          break;
        case "create_task":
          result = await createTask(
            projectId,
            action.title as string,
            action.description as string | undefined,
            action.priority as string | undefined,
          );
          break;
        case "advance_status":
          result = await advanceTaskStatus(action.taskId as string, action.status as string);
          break;
        case "list_agents":
          result = await listAgents();
          break;
        case "project_overview":
          result = await getProjectOverview(projectId);
          break;
        case "assign_task":
          result = await assignTaskToAgent(
            action.taskId as string,
            action.agentName as string | undefined,
          );
          break;
        case "escalate":
          await this.routeToTechLead(from, contactName, action.summary as string);
          return; // routeToTechLead handles its own response
        default:
          logger.warn(`Unknown receptionist action: ${action.action}`, "whatsapp");
          return;
      }

      await this.sendMessage(from, result);

      // After task creation, offer real-time tracking
      if (action.action === "create_task" && !result.startsWith("❌")) {
        const idMatch = result.match(/\*ID:\*\s*`([^`]+)`/);
        if (idMatch) {
          await this.offerTaskTracking(from, idMatch[1], action.title as string);
        }
      }

      // After moving to assigned (workflow starts), offer tracking
      if (action.action === "advance_status" && action.status === "assigned" && !result.startsWith("❌")) {
        const taskId = action.taskId as string;
        const task = await db.select({ title: schema.tasks.title })
          .from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
        if (task) {
          await this.offerTaskTracking(from, taskId, task.title);
        }
      }
    } catch (error) {
      logger.error(`Failed to execute action ${action.action}: ${error}`, "whatsapp");
      await this.sendMessage(from, "❌ Failed to execute operation. Please try again.").catch(() => {});
    }
  }

  private getHelpText(): string {
    return [
      "🤖 *AgentHub — WhatsApp*",
      "",
      "You can chat naturally with me! Examples:",
      "",
      '📋 "What are the tasks?" — List all tasks',
      '📋 "Show tasks in progress" — Filter by status',
      '🔍 "Show me task XYZ" — Task details',
      '➕ "Create a task: implement dark mode" — Create new task',
      '✅ "Approve task XYZ" — Advance status',
      '🤖 "Which agents are available?" — List agents',
      '📊 "How is the project?" — Project overview',
      '🚀 "Assign task XYZ to Dev" — Assign to an agent',
      '🐛 "There is a bug in the login" — Escalate to Tech Lead',
      "",
      "*Quick shortcuts:*",
      "/status — List tasks (no AI)",
      "/unwatch — Stop real-time tracking",
      "/help — This message",
    ].join("\n");
  }

  /**
   * Route a free-text message to the Tech Lead agent.
   * Creates a task, runs the agent workflow, and sends the result back.
   */
  private async routeToTechLead(
    from: string,
    contactName: string,
    messageText: string,
  ): Promise<void> {
    try {
      const { agentManager } = await import("../agents/agent-manager.js");

      // Find Tech Lead or linked agent
      const agents = await db.select().from(schema.agents)
        .where(eq(schema.agents.isActive, true)).all();

      const techLead = this.config.linkedAgentId
        ? agents.find(a => a.id === this.config.linkedAgentId)
        : agents.find(a => a.role === "tech_lead");

      if (!techLead) {
        await this.sendMessage(from, "⚠️ No Tech Lead available at the moment. Please configure an agent first.");
        return;
      }

      // Acknowledge receipt
      await this.sendMessage(from, `✅ Received! Forwarding to *${techLead.name}*...`);

      // Create task
      const taskId = nanoid();
      const taskTitle = messageText.length > 100
        ? messageText.slice(0, 97) + "..."
        : messageText;

      await db.insert(schema.tasks).values({
        id: taskId,
        projectId: this.config.projectId,
        title: taskTitle,
        description: [
          `Request received via WhatsApp from *${contactName}*:\n`,
          messageText,
          "\n---",
          "Instructions: Analyze the request above as Tech Lead.",
          "If it's a new feature or fix, start the normal workflow (Architect → Dev).",
          "If it's a question about status or information, respond directly.",
          "Your final response (result field) will be sent back to the requester via WhatsApp, so be clear and concise.",
        ].join("\n"),
        priority: "medium",
        category: null,
        assignedAgentId: null,
        status: "created",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      eventBus.emit("task:created", { task: { id: taskId, projectId: this.config.projectId } });

      // Listen for task completion to reply
      this.waitForTaskResult(taskId, from);

      // Offer real-time tracking
      await this.offerTaskTracking(from, taskId, taskTitle);

      // Start the full workflow (Tech Lead → Architect → Dev)
      await agentManager.runWorkflow(taskId, techLead.id);

      logger.info(`WhatsApp message from ${contactName} routed to ${techLead.name} (task ${taskId})`, "whatsapp");
    } catch (error) {
      logger.error(`Failed to route to Tech Lead: ${error}`, "whatsapp");
      await this.sendMessage(from, "❌ Failed to process your request. Please try again.").catch(() => {});
    }
  }

  // Placeholder methods that would be implemented in the complete file
  private async buildMessageContent(msg: Message): Promise<{ content: string | ContentBlock[]; textForLog: string }> {
    // Implementation would extract text/media from message
    return { content: msg.body || "", textForLog: msg.body || "" };
  }

  private cleanStaleLocks(): void {
    // Implementation would clean up stale lock files
  }

  private async updateIntegrationStatus(status: string): Promise<void> {
    // Implementation would update database status
  }

  private handleDisconnect(status: string): void {
    // Implementation would handle disconnect events
  }

  private handleError(status: string): void {
    // Implementation would handle error events
  }

  private setupTaskWatcherListeners(): void {
    // Implementation would set up event listeners
  }

  private handleTrackConfirmation(from: string, text: string): boolean {
    // Implementation would handle tracking confirmations
    return false;
  }

  private async sendMessage(to: string, message: string): Promise<void> {
    // Implementation would send WhatsApp message
  }

  private async offerTaskTracking(from: string, taskId: string, title: string): Promise<void> {
    // Implementation would offer task tracking
  }

  private waitForTaskResult(taskId: string, from: string): void {
    // Implementation would wait for task completion
  }
}

// Export functions for restoring sessions
export async function restoreWhatsAppSessions(): Promise<void> {
  // Implementation would restore active WhatsApp sessions
}
