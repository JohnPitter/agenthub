import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { getAgentPrompt } from "./agent-prompts.js";
import type { AgentRole } from "@agenthub/shared";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_HISTORY = 20;

export type TextBlock = { type: "text"; text: string };
export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
export type ContentBlock = TextBlock | ImageBlock;

interface ConversationEntry {
  role: "user" | "assistant";
  text: string;
}

export interface ReceptionistAction {
  action: string;
  [key: string]: unknown;
}

interface ReceptionistResponse {
  text: string;
  parsedAction: ReceptionistAction | null;
}

const conversations = new Map<string, ConversationEntry[]>();

function getHistory(contactId: string): ConversationEntry[] {
  if (!conversations.has(contactId)) conversations.set(contactId, []);
  return conversations.get(contactId)!;
}

function addToHistory(contactId: string, entry: ConversationEntry): void {
  const history = getHistory(contactId);
  history.push(entry);
  while (history.length > MAX_HISTORY) history.shift();
}

function parseAction(text: string): ReceptionistAction | null {
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1].trim();
  try {
    const parsed = JSON.parse(lastLine);
    if (parsed && typeof parsed.action === "string") {
      return parsed as ReceptionistAction;
    }
  } catch {
    /* not JSON — normal response */
  }
  return null;
}

function cleanResponseText(text: string): string {
  const lines = text.trim().split("\n");
  const lastLine = lines[lines.length - 1].trim();
  try {
    const parsed = JSON.parse(lastLine);
    if (parsed && typeof parsed.action === "string") {
      return lines.slice(0, -1).join("\n").trim();
    }
  } catch {
    /* not JSON */
  }
  return text;
}

/**
 * Convert multimodal content blocks to a text description for the Agent SDK.
 * The Agent SDK query() only accepts text prompts, so images become text descriptions.
 */
function contentToText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;

  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "image") return "[Usuário enviou uma imagem]";
      return "[Mídia recebida]";
    })
    .join("\n");
}

/**
 * Build a prompt that includes conversation history for context.
 */
function buildConversationPrompt(
  history: ConversationEntry[],
  currentMessage: string,
): string {
  const parts: string[] = [];

  // Include recent history for context (skip current message, it's the last)
  const priorHistory = history.slice(0, -1);
  if (priorHistory.length > 0) {
    parts.push("## Conversa anterior:");
    for (const entry of priorHistory) {
      const prefix = entry.role === "user" ? "Usuário" : "Você";
      parts.push(`${prefix}: ${entry.text}`);
    }
    parts.push("");
  }

  parts.push(`## Mensagem atual do usuário:\n${currentMessage}`);
  parts.push(
    "\nResponda diretamente à mensagem atual, considerando o contexto da conversa anterior.",
  );

  return parts.join("\n");
}

export async function handleReceptionistMessage(
  agentId: string,
  _projectId: string,
  contactId: string,
  content: string | ContentBlock[],
): Promise<ReceptionistResponse> {
  const agent = await db
    .select({
      systemPrompt: schema.agents.systemPrompt,
      role: schema.agents.role,
      soul: schema.agents.soul,
    })
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .get();

  // Use the base role prompt from agent-prompts.ts as source of truth.
  // DB systemPrompt is NOT appended — it may contain stale instructions.
  const systemPrompt = getAgentPrompt(
    (agent?.role as AgentRole) || "receptionist",
    undefined,
    agent?.soul,
  );

  const userText = contentToText(content);
  addToHistory(contactId, { role: "user", text: userText });
  const history = getHistory(contactId);

  const prompt = buildConversationPrompt(history, userText);

  try {
    let resultText = "";

    const conversation = query({
      prompt,
      options: {
        model: MODEL,
        systemPrompt,
        allowedTools: [],
        cwd: process.cwd(),
        permissionMode: "bypassPermissions",
        maxThinkingTokens: undefined,
      },
    });

    for await (const message of conversation) {
      if (message.type === "result") {
        if (message.subtype === "success" && message.result) {
          resultText = message.result;
        } else if (message.errors?.length) {
          throw new Error(message.errors.join("; "));
        }
      }
    }

    if (!resultText) {
      throw new Error("No result from agent query");
    }

    addToHistory(contactId, { role: "assistant", text: resultText });

    const parsedAction = parseAction(resultText);
    const cleanText = cleanResponseText(resultText);

    logger.info(
      `Receptionist [${contactId}]: ${cleanText.substring(0, 80)}... action=${parsedAction?.action ?? "none"}`,
      "receptionist",
    );

    return { text: cleanText, parsedAction };
  } catch (error) {
    logger.error(`Receptionist error: ${error}`, "receptionist");
    return {
      text: "Desculpe, tive um problema técnico. Pode repetir?",
      parsedAction: null,
    };
  }
}

export function clearConversation(contactId: string): void {
  conversations.delete(contactId);
}
