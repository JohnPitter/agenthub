import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { nanoid } from "nanoid";
import path from "path";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { eventBus } from "../realtime/event-bus.js";

const AUTH_STATE_DIR = path.join(process.cwd(), "data", "whatsapp-auth");

interface WhatsAppServiceConfig {
  projectId: string;
  linkedAgentId?: string; // Tech Lead agent ID
}

export class WhatsAppService {
  private client: InstanceType<typeof Client> | null = null;
  private config: WhatsAppServiceConfig;
  private integrationId: string;
  private isConnecting = false;

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

    try {
      // Update integration status
      await this.updateIntegrationStatus("connecting");

      // Create client with LocalAuth for session persistence
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.integrationId,
          dataPath: AUTH_STATE_DIR,
        }),
        puppeteer: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      });

      // QR code event
      this.client.on("qr", (qr: string) => {
        logger.info("QR code received, emitting to client", "whatsapp");

        // Print to console for dev
        qrcode.generate(qr, { small: true }, (qrString) => {
          console.log(qrString);
        });

        // Emit via EventBus
        eventBus.emit("integration:status", {
          type: "whatsapp",
          status: "connecting",
          qr,
        });
      });

      // Ready event - connection established
      this.client.on("ready", async () => {
        logger.info("WhatsApp connection established", "whatsapp");
        await this.updateIntegrationStatus("connected");
        eventBus.emit("integration:status", {
          type: "whatsapp",
          status: "connected",
        });
        this.isConnecting = false;
      });

      // Authenticated event
      this.client.on("authenticated", () => {
        logger.info("WhatsApp authenticated", "whatsapp");
      });

      // Auth failure event
      this.client.on("auth_failure", async (msg: string) => {
        logger.error(`WhatsApp auth failure: ${msg}`, "whatsapp");
        await this.updateIntegrationStatus("error");
        eventBus.emit("integration:status", {
          type: "whatsapp",
          status: "error",
        });
        this.isConnecting = false;
      });

      // Disconnected event
      this.client.on("disconnected", async (reason: string) => {
        logger.warn(`WhatsApp disconnected: ${reason}`, "whatsapp");
        await this.updateIntegrationStatus("disconnected");
        eventBus.emit("integration:status", {
          type: "whatsapp",
          status: "disconnected",
        });
        this.client = null;
        this.isConnecting = false;
      });

      // Incoming messages
      this.client.on("message", async (msg: any) => {
        try {
          // Only process messages from others (not from self)
          if (msg.fromMe) return;

          const messageText = msg.body;
          if (!messageText) return;

          const from = msg.from;
          const contact = await msg.getContact();
          const contactName = contact.pushname || contact.number || from;

          logger.info(
            `WhatsApp message from ${contactName} (${from}): ${messageText}`,
            "whatsapp"
          );

          // Save message to database
          const messageId = nanoid();
          await db.insert(schema.messages).values({
            id: messageId,
            projectId: this.config.projectId,
            agentId: this.config.linkedAgentId || null,
            source: "whatsapp",
            content: messageText,
            contentType: "text",
            metadata: JSON.stringify({
              from,
              contactName,
              messageId: msg.id._serialized,
              timestamp: msg.timestamp,
            }),
          });

          // Emit to client
          eventBus.emit("integration:message", {
            type: "whatsapp",
            from: contactName,
            content: messageText,
          });

          logger.info(`Saved WhatsApp message to database: ${messageId}`, "whatsapp");
        } catch (error) {
          logger.error(
            `Failed to process WhatsApp message: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            "whatsapp"
          );
        }
      });

      // Initialize the client
      await this.client.initialize();
      logger.info("WhatsApp client initializing...", "whatsapp");
    } catch (error) {
      logger.error(
        `WhatsApp connection error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "whatsapp"
      );
      await this.updateIntegrationStatus("error");
      eventBus.emit("integration:status", {
        type: "whatsapp",
        status: "error",
      });
      this.isConnecting = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      logger.warn("WhatsApp not connected", "whatsapp");
      return;
    }

    try {
      await this.client.destroy();
      this.client = null;
      await this.updateIntegrationStatus("disconnected");
      eventBus.emit("integration:status", {
        type: "whatsapp",
        status: "disconnected",
      });
      logger.info("WhatsApp disconnected", "whatsapp");
    } catch (error) {
      logger.error(
        `WhatsApp disconnect error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "whatsapp"
      );
      throw error;
    }
  }

  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("WhatsApp not connected");
    }

    try {
      await this.client.sendMessage(to, content);
      logger.info(`WhatsApp message sent to ${to}`, "whatsapp");
    } catch (error) {
      logger.error(
        `Failed to send WhatsApp message: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "whatsapp"
      );
      throw error;
    }
  }

  getConnectionStatus(): "disconnected" | "connecting" | "connected" | "error" {
    if (!this.client) return "disconnected";
    if (this.isConnecting) return "connecting";
    return "connected";
  }

  private async updateIntegrationStatus(
    status: "disconnected" | "connecting" | "connected" | "error"
  ): Promise<void> {
    try {
      const updateData: any = { status, updatedAt: new Date() };
      if (status === "connected") {
        updateData.lastConnectedAt = new Date();
      }

      await db
        .update(schema.integrations)
        .set(updateData)
        .where(eq(schema.integrations.id, this.integrationId));
    } catch (error) {
      logger.error(
        `Failed to update integration status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "whatsapp"
      );
    }
  }
}

// Singleton instance
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
