import wppconnect from "@wppconnect-team/wppconnect";
import type { Whatsapp, Message } from "@wppconnect-team/wppconnect";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { STORAGE_BASE } from "../lib/storage.js";
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
} from "./whatsapp-ops.js";

const TOKEN_DIR = path.join(STORAGE_BASE, "whatsapp-tokens");

/** Safely extract a serialized WID string from any value (string, Wid object, etc.) */
function serializeWid(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return value.includes("@") ? value : `${value.replace(/\D/g, "")}@c.us`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Try _serialized first (Wid object standard field)
    if (typeof obj._serialized === "string" && obj._serialized) return obj._serialized;
    // Try user + server
    if (typeof obj.user === "string" && typeof obj.server === "string") return `${obj.user}@${obj.server}`;
    // Try id field
    if (typeof obj.id === "string" && obj.id) return obj.id;
  }
  return null;
}

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
  /** whatsappNumber → project list — pending numbered project selection */
  private pendingProjectSelection = new Map<string, { projects: { id: string; name: string }[]; timestamp: number }>();
  /** whatsappNumber → selected project — user already picked a project for next create_task */
  private selectedProject = new Map<string, { id: string; name: string; timestamp: number }>();

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
    this.cleanChromiumProfile();

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
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process",
            "--no-first-run",
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

        // Normalize WID — extract serialized string from from/chatId
        const from: string = serializeWid(msg.from) || serializeWid(msg.chatId) || String(msg.from);

        // Whitelist check — only allow messages from the authorized number
        if (this.config.allowedNumber) {
          const senderNumber = from.replace("@c.us", "");
          const allowed = this.config.allowedNumber.replace(/\D/g, "");
          if (senderNumber !== allowed) {
            logger.info(`Blocked message from unauthorized number: ${from}`, "whatsapp");
            return;
          }
        }
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
    // Check if this is a response to a pending project selection (numbered list)
    if (await this.handleProjectSelection(from, text)) return;

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
      .then(r => r[0]);

    if (!receptionist) {
      logger.warn(
        "No receptionist agent found, falling back to direct Tech Lead routing",
        "whatsapp",
      );
      await this.routeToTechLead(from, contactName, text);
      return;
    }

    // Inject selected project context so receptionist doesn't ask again
    let enrichedContent = content;
    const selectedProj = this.selectedProject.get(from);
    if (selectedProj && Date.now() - selectedProj.timestamp > 5 * 60 * 1000) {
      this.selectedProject.delete(from); // expired
    }
    if (selectedProj && this.selectedProject.has(from)) {
      const systemMsg = `[SYSTEM: User already selected project "${selectedProj.name}" (ID: ${selectedProj.id}). Use this projectId for create_task. Do NOT call list_projects again.]`;
      if (typeof enrichedContent === "string") {
        enrichedContent = `${systemMsg}\n\n${enrichedContent}`;
      } else if (Array.isArray(enrichedContent)) {
        enrichedContent = [{ type: "text" as const, text: systemMsg }, ...enrichedContent];
      }
    }

    const response = await handleReceptionistMessage(
      receptionist.id,
      this.config.projectId,
      from,
      enrichedContent,
    );

    // Send the receptionist's natural language response
    await this.sendMessage(from, response.text);

    // Execute action if present — the receptionist AI decides when to emit actions
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
        case "list_projects": {
          const projects = await db
            .select({ id: schema.projects.id, name: schema.projects.name })
            .from(schema.projects);
          if (projects.length === 0) {
            result = "📁 Nenhum projeto encontrado.";
          } else {
            let msg = "📁 *Projetos disponíveis:*\n\n";
            projects.forEach((p, i) => {
              msg += `*${i + 1}.* ${p.name}\n`;
            });
            msg += "\n_Responda com o número do projeto._";
            this.pendingProjectSelection.set(from, {
              projects: projects.map((p) => ({ id: p.id, name: p.name })),
              timestamp: Date.now(),
            });
            result = msg;
          }
          break;
        }
        case "create_task": {
          // Use projectId from action, or previously selected project, or default
          let targetProjectId = action.projectId as string | undefined;
          if (!targetProjectId) {
            const selected = this.selectedProject.get(from);
            if (selected) {
              targetProjectId = selected.id;
              this.selectedProject.delete(from);
            }
          }
          result = await createTask(
            targetProjectId || projectId,
            action.title as string,
            action.description as string | undefined,
            action.priority as string | undefined,
          );
          break;
        }
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

      // After task creation, auto-assign to start workflow + offer tracking
      if (action.action === "create_task" && !result.startsWith("❌")) {
        const idMatch = result.match(/\*ID:\*\s*`([^`]+)`/);
        if (idMatch) {
          const taskId = idMatch[1];
          // Auto-move to "assigned" to trigger the agent workflow
          const assignResult = await advanceTaskStatus(taskId, "assigned");
          if (!assignResult.startsWith("❌")) {
            await this.sendMessage(from, "🚀 *Workflow iniciado!* O Tech Lead já está analisando a task.");

            // Actually trigger the workflow
            const { agentManager } = await import("../agents/agent-manager.js");
            const techLeadAgent = await db.select().from(schema.agents)
              .where(and(eq(schema.agents.role, "tech_lead"), eq(schema.agents.isActive, true)))
              .then(r => r[0]);
            if (techLeadAgent) {
              agentManager.runWorkflow(taskId, techLeadAgent.id).catch(err =>
                logger.error(`Failed to start workflow for task ${taskId}: ${err}`, "whatsapp")
              );
            }

            await this.offerTaskTracking(from, taskId, action.title as string);
          } else {
            logger.warn(`Could not auto-assign task ${taskId}: ${assignResult}`, "whatsapp");
            await this.offerTaskTracking(from, taskId, action.title as string);
          }
        }
      }

      // After moving to assigned (workflow starts), offer tracking
      if (action.action === "advance_status" && action.status === "assigned" && !result.startsWith("❌")) {
        const taskId = action.taskId as string;
        const task = await db.select({ title: schema.tasks.title })
          .from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
        .where(eq(schema.agents.isActive, true));

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

      // Start the full workflow (Tech Lead → Architect → Dev) — fire-and-forget
      agentManager.runWorkflow(taskId, techLead.id).catch(err =>
        logger.error(`Workflow failed for task ${taskId}: ${err}`, "whatsapp")
      );

      logger.info(`WhatsApp message from ${contactName} routed to ${techLead.name} (task ${taskId})`, "whatsapp");
    } catch (error) {
      logger.error(`Failed to route to Tech Lead: ${error}`, "whatsapp");
      await this.sendMessage(from, "❌ Failed to process your message. Please try again.").catch(() => {});
    }
  }

  /**
   * Wait for a task to reach a terminal state and send the result back via WhatsApp.
   * Returns a cleanup function.
   */
  private waitForTaskResult(taskId: string, replyTo: string): () => void {
    const handler = (data: { taskId: string; status: string }) => {
      if (data.taskId !== taskId) return;

      if (data.status === "review" || data.status === "done") {
        eventBus.off("task:status", handler);
        clearTimeout(timeout);
        this.sendTaskResult(taskId, replyTo);
      } else if (data.status === "failed" || data.status === "cancelled") {
        eventBus.off("task:status", handler);
        clearTimeout(timeout);
        this.sendMessage(replyTo, "❌ The task failed during processing. The team will investigate.").catch(() => {});
      }
    };

    eventBus.on("task:status", handler);

    // Timeout after 10 minutes
    const timeout = setTimeout(() => {
      eventBus.off("task:status", handler);
      this.sendMessage(replyTo, "⏱️ The task is taking longer than expected. You can follow the progress on the web dashboard.").catch(() => {});
    }, 10 * 60 * 1000);

    return () => {
      eventBus.off("task:status", handler);
      clearTimeout(timeout);
    };
  }

  /**
   * Fetch task result and send as WhatsApp reply.
   */
  private async sendTaskResult(taskId: string, to: string): Promise<void> {
    try {
      const task = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, taskId)).then(r => r[0]);
      if (!task) return;

      let reply = task.result || "✅ Task processed.";

      // Truncate for WhatsApp (max ~4000 chars)
      if (reply.length > 4000) {
        reply = reply.slice(0, 3950) + "\n\n... (response truncated, see web dashboard for details)";
      }

      await this.sendMessage(to, reply);

      // Save outgoing message
      await db.insert(schema.messages).values({
        id: nanoid(),
        projectId: this.config.projectId,
        agentId: this.config.linkedAgentId || null,
        source: "agent",
        content: reply,
        contentType: "text",
        metadata: JSON.stringify({ to, via: "whatsapp", taskId }),
      });
    } catch (error) {
      logger.error(`Failed to send task result via WhatsApp: ${error}`, "whatsapp");
    }
  }

  // ─── Task Watcher (Real-time Status via WhatsApp) ───────────────────

  private setupTaskWatcherListeners(): void {
    // Listen for task status changes
    eventBus.on("task:status", (data: { taskId: string; status: string; agentId?: string }) => {
      const watcher = this.taskWatchers.get(data.taskId);
      if (!watcher) return;

      const emoji = STATUS_EMOJI[data.status] ?? "▪️";
      const msg = `${emoji} *Status update:* \`${watcher.taskTitle}\`\n\n` +
        `Status changed to: *${data.status}*`;

      this.sendMessage(watcher.whatsappNumber, msg).catch((err) => {
        logger.warn(`Failed to send status update to watcher: ${err}`, "whatsapp");
      });

      // Auto-cleanup on terminal states
      if (["done", "failed", "cancelled"].includes(data.status)) {
        const finalEmoji = data.status === "done" ? "✅" : data.status === "failed" ? "💥" : "❌";
        this.sendMessage(
          watcher.whatsappNumber,
          `${finalEmoji} Task *${watcher.taskTitle}* is now *${data.status}*. Real-time tracking stopped.`,
        ).catch(() => {});
        this.taskWatchers.delete(data.taskId);
        logger.info(`Task watcher removed for ${data.taskId} (terminal: ${data.status})`, "whatsapp");
      }
    });

    // Listen for workflow phase changes (more granular)
    eventBus.on("workflow:phase", (data: {
      taskId: string;
      phase: string;
      agentName?: string;
      detail?: string;
    }) => {
      const watcher = this.taskWatchers.get(data.taskId);
      if (!watcher) return;

      const phaseLabels: Record<string, string> = {
        tech_lead_triage: "🔍 Tech Lead analyzing...",
        architect_planning: "📐 Architect creating plan...",
        split_task_dispatch: "🔀 Splitting into subtasks...",
        dev_execution: "💻 Developer implementing...",
        qa_review: "🧪 QA reviewing...",
        dev_fix: "🔧 Developer fixing issues...",
        tech_lead_fix_plan: "📋 Tech Lead creating fix plan...",
        completed: "🏁 Workflow completed!",
      };

      const label = phaseLabels[data.phase] ?? `⚙️ ${data.phase}`;
      const agent = data.agentName ? ` (${data.agentName})` : "";
      const msg = `🔄 *${watcher.taskTitle}*\n${label}${agent}`;

      this.sendMessage(watcher.whatsappNumber, msg).catch((err) => {
        logger.warn(`Failed to send workflow phase to watcher: ${err}`, "whatsapp");
      });
    });
  }

  /**
   * Offer real-time tracking after a task is created via WhatsApp.
   */
  private async offerTaskTracking(
    whatsappNumber: string,
    taskId: string,
    taskTitle: string,
  ): Promise<void> {
    this.pendingTrackConfirmations.set(whatsappNumber, taskId);

    // Store title temporarily for when they confirm
    this.pendingTrackConfirmations.set(`title:${taskId}`, taskTitle);

    await this.sendMessage(
      whatsappNumber,
      `📡 *Would you like to receive real-time updates for this task?*\n\n` +
      `Reply *yes* to get status notifications via WhatsApp, or *no* to skip.`,
    );

    // Auto-expire the confirmation after 2 minutes
    setTimeout(() => {
      if (this.pendingTrackConfirmations.get(whatsappNumber) === taskId) {
        this.pendingTrackConfirmations.delete(whatsappNumber);
        this.pendingTrackConfirmations.delete(`title:${taskId}`);
      }
    }, 2 * 60 * 1000);
  }

  /**
   * Check if incoming message is a numbered reply to a project selection list.
   * Returns true if handled (caller should skip normal routing).
   */
  private async handleProjectSelection(from: string, text: string): Promise<boolean> {
    const pending = this.pendingProjectSelection.get(from);
    if (!pending) return false;

    // Expire after 5 minutes
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
      this.pendingProjectSelection.delete(from);
      return false;
    }

    const num = parseInt(text.trim(), 10);
    if (isNaN(num) || num < 1 || num > pending.projects.length) {
      await this.sendMessage(from,
        `⚠️ Responda com um número entre *1* e *${pending.projects.length}*, ou envie /help para cancelar.`
      );
      return true; // consume the message, don't pass to receptionist
    }

    const selected = pending.projects[num - 1];
    this.pendingProjectSelection.delete(from);
    this.selectedProject.set(from, { ...selected, timestamp: Date.now() });

    await this.sendMessage(
      from,
      `✅ Projeto *${selected.name}* selecionado.\n\n` +
        `Agora me diga:\n` +
        `1. *Título* da tarefa\n` +
        `2. *Descrição* detalhada\n` +
        `3. *Prioridade* (low/medium/high/urgent)`,
    );

    logger.info(`Project selected via WhatsApp: ${selected.name} (${selected.id}) by ${from}`, "whatsapp");
    return true;
  }

  /**
   * Check if incoming message is a response to a tracking confirmation.
   * Returns true if handled (caller should skip normal routing).
   */
  private handleTrackConfirmation(from: string, text: string): boolean {
    const taskId = this.pendingTrackConfirmations.get(from);
    if (!taskId) return false;

    const lower = text.trim().toLowerCase();
    const isYes = ["yes", "y", "sim", "s", "si", "ok", "👍"].includes(lower);
    const isNo = ["no", "n", "não", "nao", "nope", "👎"].includes(lower);

    if (!isYes && !isNo) return false; // Not a clear answer, let normal routing handle it

    const taskTitle = this.pendingTrackConfirmations.get(`title:${taskId}`) ?? taskId.slice(0, 8);

    // Cleanup
    this.pendingTrackConfirmations.delete(from);
    this.pendingTrackConfirmations.delete(`title:${taskId}`);

    if (isYes) {
      this.taskWatchers.set(taskId, { whatsappNumber: from, taskId, taskTitle });
      this.sendMessage(from, `✅ Real-time tracking enabled for *${taskTitle}*.\n\nYou'll receive updates as the task progresses. Send /unwatch to stop.`).catch(() => {});
      logger.info(`Task watcher registered: ${taskId} → ${from}`, "whatsapp");
    } else {
      this.sendMessage(from, `👌 No problem. You can always check the task status later.`).catch(() => {});
    }

    return true;
  }

  // ─── Connection Management ──────────────────────────────────────────

  private async handleDisconnect(reason: string): Promise<void> {
    logger.warn(`WhatsApp disconnected: ${reason}`, "whatsapp");
    await this.updateIntegrationStatus("disconnected");
    eventBus.emit("integration:status", { type: "whatsapp", status: "disconnected" });
    this.client = null;
    this.isConnecting = false;
    this.listenersAttached = false;
  }

  private async handleError(reason: string): Promise<void> {
    logger.error(`WhatsApp error: ${reason}`, "whatsapp");
    await this.updateIntegrationStatus("error");
    eventBus.emit("integration:status", { type: "whatsapp", status: "error" });
    this.isConnecting = false;
    this.listenersAttached = false;
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      logger.warn("WhatsApp not connected", "whatsapp");
      return;
    }

    try {
      await this.client.close();
      this.client = null;
      this.listenersAttached = false;
      await this.updateIntegrationStatus("disconnected");
      eventBus.emit("integration:status", { type: "whatsapp", status: "disconnected" });
      logger.info("WhatsApp disconnected", "whatsapp");
    } catch (error) {
      logger.error(`WhatsApp disconnect error: ${error instanceof Error ? error.message : "Unknown error"}`, "whatsapp");
      throw error;
    }
  }

  async sendMessage(to: string | unknown, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("WhatsApp not connected");
    }

    const chatId = serializeWid(to);
    if (!chatId) {
      logger.error(`Cannot send message: invalid WID value: ${JSON.stringify(to)}`, "whatsapp");
      return;
    }

    try {
      await this.client.sendText(chatId, content);
      logger.info(`WhatsApp message sent to ${chatId}`, "whatsapp");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send WhatsApp message to ${chatId}: ${msg}`, "whatsapp");
      throw error;
    }
  }

  private async buildMessageContent(
    msg: Message,
  ): Promise<{ content: string | ContentBlock[]; textForLog: string }> {
    const textForLog = msg.body || `[${msg.type}]`;

    if (msg.type === "chat" && msg.body) {
      return { content: msg.body, textForLog };
    }

    const blocks: ContentBlock[] = [];

    if (
      ["image", "ptt", "audio", "video", "sticker"].includes(msg.type)
    ) {
      try {
        const base64 = await this.client!.downloadMedia(msg);
        if (base64) {
          const match = base64.match(/^data:(.*?);base64,(.*)$/s);
          const mediaType = match ? match[1] : "image/jpeg";
          const data = match ? match[2] : base64;

          if (msg.type === "image" || msg.type === "sticker") {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: mediaType, data },
            });
          }
          // Audio/video: just note the type, Haiku can't process these directly
        }
      } catch (err) {
        logger.warn(`Failed to download media: ${err}`, "whatsapp");
      }
    }

    if (msg.body) blocks.push({ type: "text", text: msg.body });

    if (blocks.length === 0) {
      return {
        content: `[Message of type ${msg.type} received]`,
        textForLog,
      };
    }

    return {
      content:
        blocks.length === 1 && blocks[0].type === "text"
          ? blocks[0].text
          : blocks,
      textForLog,
    };
  }

  updateAllowedNumber(allowedNumber: string | undefined): void {
    this.config.allowedNumber = allowedNumber;
    logger.info(`Allowed number updated to: ${allowedNumber || "(none)"}`, "whatsapp");
  }

  getConnectionStatus(): "disconnected" | "connecting" | "connected" | "error" {
    if (this.isConnecting) return "connecting";
    if (!this.client) return "disconnected";
    return "connected";
  }

  /**
   * Remove Chromium singleton lock files from the wppconnect session directory.
   * These lock files store the previous container's hostname and block Chromium
   * from launching after a redeploy. Uses rm -rf on Singleton* files.
   */
  private cleanChromiumProfile(): void {
    const sessionDir = path.join(TOKEN_DIR, `agenthub-${this.integrationId}`);
    try {
      if (!fs.existsSync(sessionDir)) return;
      let cleaned = 0;
      const cleanDir = (dir: string, depth: number) => {
        if (depth > 5) return;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, entry.name);
            if (entry.name.startsWith("Singleton")) {
              // SingletonLock is a SYMLINK on Linux, not a regular file!
              // entry.isFile() returns false for symlinks — use lstatSync instead
              try {
                fs.unlinkSync(fp); // works for files, symlinks, and sockets
                cleaned++;
              } catch { /* ignore if already deleted */ }
            } else if (entry.isDirectory() && entry.name !== "node_modules") {
              cleanDir(fp, depth + 1);
            }
          }
        } catch { /* ignore permission errors */ }
      };
      cleanDir(sessionDir, 0);
      if (cleaned > 0) {
        logger.info(`Removed ${cleaned} Chromium lock(s) in ${sessionDir}`, "whatsapp");
      } else {
        logger.debug(`No Chromium locks found in ${sessionDir}`, "whatsapp");
      }
    } catch (error) {
      logger.warn(`Failed to clean Chromium locks: ${error instanceof Error ? error.message : "Unknown"}`, "whatsapp");
    }

    // Clean leftover chrome-tmp-* dirs from old approach
    try {
      for (const entry of fs.readdirSync(TOKEN_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("chrome-tmp-")) {
          fs.rmSync(path.join(TOKEN_DIR, entry.name), { recursive: true, force: true });
        }
      }
    } catch { /* ignore */ }
  }

  private async updateIntegrationStatus(
    status: "disconnected" | "connecting" | "connected" | "error"
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
      if (status === "connected") {
        updateData.lastConnectedAt = new Date();
      }

      await db.update(schema.integrations).set(updateData)
        .where(eq(schema.integrations.id, this.integrationId));
    } catch (error) {
      logger.error(`Failed to update integration status: ${error instanceof Error ? error.message : "Unknown error"}`, "whatsapp");
    }
  }
}

// Singleton
let whatsappServiceInstance: WhatsAppService | null = null;

export function getWhatsAppService(
  config?: WhatsAppServiceConfig,
  integrationId?: string
): WhatsAppService {
  if (!whatsappServiceInstance && config && integrationId) {
    whatsappServiceInstance = new WhatsAppService(config, integrationId);
  }
  if (!whatsappServiceInstance) {
    throw new Error("WhatsApp service not initialized");
  }
  return whatsappServiceInstance;
}

export function resetWhatsAppService(): void {
  whatsappServiceInstance = null;
}

export async function restoreWhatsAppSessions(): Promise<void> {
  const connected = await db
    .select()
    .from(schema.integrations)
    .where(
      and(
        eq(schema.integrations.type, "whatsapp"),
        eq(schema.integrations.status, "connected"),
      ),
    )
    ;

  if (connected.length === 0) {
    logger.info("No WhatsApp sessions to restore", "whatsapp");
    return;
  }

  for (const integration of connected) {
    const config = integration.config ? JSON.parse(integration.config) : {};
    const service = getWhatsAppService(
      {
        projectId: integration.projectId!,
        linkedAgentId: integration.linkedAgentId ?? undefined,
        allowedNumber: config.allowedNumber,
      },
      integration.id,
    );
    logger.info(`Auto-restoring WhatsApp session for integration ${integration.id}`, "whatsapp");
    await service.connect();
  }
}
