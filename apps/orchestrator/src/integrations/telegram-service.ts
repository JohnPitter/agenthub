import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { nanoid } from "nanoid";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { eventBus } from "../realtime/event-bus.js";
import { encrypt } from "../lib/encryption.js";

interface TelegramServiceConfig {
  projectId: string;
  linkedAgentId?: string; // Tech Lead agent ID
  botToken: string;
}

export class TelegramService {
  private bot: Telegraf | null = null;
  private config: TelegramServiceConfig;
  private integrationId: string;
  private isRunning = false;

  constructor(config: TelegramServiceConfig, integrationId: string) {
    this.config = config;
    this.integrationId = integrationId;
  }

  async start(): Promise<void> {
    if (this.isRunning || this.bot) {
      logger.warn("Telegram bot already running", "telegram");
      return;
    }

    try {
      // Update integration status
      await this.updateIntegrationStatus("connecting");

      // Create bot instance
      this.bot = new Telegraf(this.config.botToken);

      // Handle incoming text messages
      this.bot.on(message("text"), async (ctx: Context) => {
        try {
          const messageText = "text" in (ctx.message ?? {}) ? (ctx.message as { text?: string })?.text : undefined;
          if (!messageText) return;

          const from = ctx.from;
          const chatId = ctx.chat?.id;
          if (!chatId) return;
          const username = from?.username || from?.first_name || "Unknown";
          const userId = from?.id || 0;

          logger.info(
            `Telegram message from ${username} (${userId}): ${messageText}`,
            "telegram"
          );

          // Save message to database
          const messageId = nanoid();
          await db.insert(schema.messages).values({
            id: messageId,
            projectId: this.config.projectId,
            agentId: this.config.linkedAgentId || null,
            source: "telegram",
            content: messageText,
            contentType: "text",
            metadata: JSON.stringify({
              chatId,
              userId,
              username,
              messageId: ctx.message.message_id,
              timestamp: ctx.message.date,
            }),
          });

          // Emit to client
          eventBus.emit("integration:message", {
            type: "telegram",
            from: username,
            content: messageText,
          });

          logger.info(`Saved Telegram message to database: ${messageId}`, "telegram");

          // Optional: Send acknowledgment
          // await ctx.reply("Message received!");
        } catch (error) {
          logger.error(
            `Failed to process Telegram message: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            "telegram"
          );
        }
      });

      // Handle bot errors
      this.bot.catch((err: unknown, _ctx: Context) => {
        logger.error(
          `Telegram bot error: ${err instanceof Error ? err.message : String(err)}`,
          "telegram"
        );
      });

      // Launch the bot
      await this.bot.launch();
      this.isRunning = true;

      logger.info("Telegram bot started successfully", "telegram");
      await this.updateIntegrationStatus("connected");
      eventBus.emit("integration:status", {
        type: "telegram",
        status: "connected",
      });

      // Enable graceful stop
      process.once("SIGINT", () => this.stop());
      process.once("SIGTERM", () => this.stop());
    } catch (error) {
      logger.error(
        `Telegram bot start error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "telegram"
      );
      await this.updateIntegrationStatus("error");
      eventBus.emit("integration:status", {
        type: "telegram",
        status: "error",
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.bot || !this.isRunning) {
      logger.warn("Telegram bot not running", "telegram");
      return;
    }

    try {
      this.bot.stop();
      this.bot = null;
      this.isRunning = false;

      await this.updateIntegrationStatus("disconnected");
      eventBus.emit("integration:status", {
        type: "telegram",
        status: "disconnected",
      });

      logger.info("Telegram bot stopped", "telegram");
    } catch (error) {
      logger.error(
        `Telegram bot stop error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "telegram"
      );
      throw error;
    }
  }

  async sendMessage(chatId: number | string, content: string): Promise<void> {
    if (!this.bot || !this.isRunning) {
      throw new Error("Telegram bot not running");
    }

    try {
      await this.bot.telegram.sendMessage(chatId, content);
      logger.info(`Telegram message sent to ${chatId}`, "telegram");
    } catch (error) {
      logger.error(
        `Failed to send Telegram message: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "telegram"
      );
      throw error;
    }
  }

  getConnectionStatus(): "disconnected" | "connecting" | "connected" | "error" {
    if (!this.bot) return "disconnected";
    if (!this.isRunning) return "connecting";
    return "connected";
  }

  private async updateIntegrationStatus(
    status: "disconnected" | "connecting" | "connected" | "error"
  ): Promise<void> {
    try {
      const updateData: { status: "disconnected" | "connecting" | "connected" | "error"; updatedAt: Date; lastConnectedAt?: Date } = { status, updatedAt: new Date() };
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
        "telegram"
      );
    }
  }
}

// Singleton instance
let telegramServiceInstance: TelegramService | null = null;

export function getTelegramService(
  config?: TelegramServiceConfig,
  integrationId?: string
): TelegramService {
  if (!telegramServiceInstance && config && integrationId) {
    telegramServiceInstance = new TelegramService(config, integrationId);
  }
  if (!telegramServiceInstance) {
    throw new Error("Telegram service not initialized");
  }
  return telegramServiceInstance;
}

export function resetTelegramService(): void {
  telegramServiceInstance = null;
}
