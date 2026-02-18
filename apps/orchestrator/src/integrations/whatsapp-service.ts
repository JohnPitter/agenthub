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

interface WhatsAppServiceConfig {
  projectId: string;
  linkedAgentId?: string;
  allowedNumber?: string;
}

export class WhatsAppService {
  private client: Whatsapp | null = null;
  private config: WhatsAppServiceConfig;
  private integrationId: string;
  private isConnecting = false;
  private listenersAttached = false;

  constructor(config: WhatsAppServiceConfig, integrationId: string) {
    this.config = config;
    this.integrationId = integrationId;
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
          contentType: msg.type === "chat" ? "text" : msg.type,
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
    const lower = text.trim().toLowerCase();

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
    } catch (error) {
      logger.error(`Failed to execute action ${action.action}: ${error}`, "whatsapp");
      await this.sendMessage(from, "❌ Erro ao executar operação. Tente novamente.").catch(() => {});
    }
  }

  private getHelpText(): string {
    return [
      "🤖 *AgentHub — WhatsApp*",
      "",
      "Você pode conversar naturalmente comigo! Exemplos:",
      "",
      '📋 "Quais são as tasks?" — Lista todas as tasks',
      '📋 "Mostra as tasks em andamento" — Filtra por status',
      '🔍 "Me mostra a task XYZ" — Detalhes de uma task',
      '➕ "Cria uma task: implementar dark mode" — Cria nova task',
      '✅ "Aprova a task XYZ" — Avança status',
      '🤖 "Quais agentes estão disponíveis?" — Lista agentes',
      '📊 "Como tá o projeto?" — Overview do projeto',
      '🚀 "Atribui a task XYZ pro Dev" — Atribuir a um agente',
      '🐛 "Tem um bug no login" — Escala para o Tech Lead',
      "",
      "*Atalhos rápidos:*",
      "/status — Lista tasks (sem IA)",
      "/help — Esta mensagem",
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
        await this.sendMessage(from, "⚠️ Nenhum Tech Lead disponível no momento. Configure um agente antes.");
        return;
      }

      // Acknowledge receipt
      await this.sendMessage(from, `✅ Recebido! Encaminhando para *${techLead.name}*...`);

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
          `Solicitação recebida via WhatsApp de *${contactName}*:\n`,
          messageText,
          "\n---",
          "Instruções: Analise o pedido acima como Tech Lead.",
          "Se for uma nova feature ou correção, inicie o workflow normal (Architect → Dev).",
          "Se for uma pergunta sobre status ou informação, responda diretamente.",
          "Sua resposta final (campo result) será enviada de volta ao solicitante via WhatsApp, então seja claro e conciso.",
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
      const cleanup = this.waitForTaskResult(taskId, from);

      // Start the full workflow (Tech Lead → Architect → Dev)
      await agentManager.runWorkflow(taskId, techLead.id);

      logger.info(`WhatsApp message from ${contactName} routed to ${techLead.name} (task ${taskId})`, "whatsapp");
    } catch (error) {
      logger.error(`Failed to route to Tech Lead: ${error}`, "whatsapp");
      await this.sendMessage(from, "❌ Erro ao processar sua mensagem. Tente novamente.").catch(() => {});
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
        this.sendMessage(replyTo, "❌ A tarefa falhou durante o processamento. O time vai investigar.").catch(() => {});
      }
    };

    eventBus.on("task:status", handler);

    // Timeout after 10 minutes
    const timeout = setTimeout(() => {
      eventBus.off("task:status", handler);
      this.sendMessage(replyTo, "⏱️ A tarefa está demorando mais do que o esperado. Você pode acompanhar pelo painel web.").catch(() => {});
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
        .where(eq(schema.tasks.id, taskId)).get();
      if (!task) return;

      let reply = task.result || "✅ Tarefa processada.";

      // Truncate for WhatsApp (max ~4000 chars)
      if (reply.length > 4000) {
        reply = reply.slice(0, 3950) + "\n\n... (resposta truncada, veja o painel web para detalhes)";
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

  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("WhatsApp not connected");
    }

    try {
      await this.client.sendText(to, content);
      logger.info(`WhatsApp message sent to ${to}`, "whatsapp");
    } catch (error) {
      logger.error(`Failed to send WhatsApp message: ${error instanceof Error ? error.message : "Unknown error"}`, "whatsapp");
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
        content: `[Mensagem do tipo ${msg.type} recebida]`,
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

  private cleanStaleLocks(): void {
    try {
      const sessionDir = path.join(TOKEN_DIR, `agenthub-${this.integrationId}`);
      if (!fs.existsSync(sessionDir)) return;

      for (const file of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
        const lockPath = path.join(sessionDir, file);
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
          logger.info(`Removed stale lock file: ${file}`, "whatsapp");
        }
      }
    } catch (error) {
      logger.warn(`Failed to clean stale locks: ${error instanceof Error ? error.message : "Unknown"}`, "whatsapp");
    }
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
    .all();

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
