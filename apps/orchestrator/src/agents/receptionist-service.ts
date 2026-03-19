import OpenAI from "openai";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { getAgentPrompt } from "./agent-prompts.js";
import type { AgentRole } from "@agenthub/shared";

const FALLBACK_MODEL = "anthropic/claude-haiku-4.5";
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

const MAX_CONVERSATIONS = 1000;
const conversations = new Map<string, ConversationEntry[]>();

// Cached OpenAI client with TTL
let cachedClient: { client: OpenAI; expiresAt: number } | null = null;
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getHistory(contactId: string): ConversationEntry[] {
  if (!conversations.has(contactId)) {
    // LRU eviction: remove oldest entry if at capacity
    if (conversations.size >= MAX_CONVERSATIONS) {
      const oldestKey = conversations.keys().next().value;
      if (oldestKey) conversations.delete(oldestKey);
    }
    conversations.set(contactId, []);
  }
  return conversations.get(contactId)!;
}

function addToHistory(contactId: string, entry: ConversationEntry): void {
  const history = getHistory(contactId);
  history.push(entry);
  while (history.length > MAX_HISTORY) history.shift();
}

function parseAction(text: string): ReceptionistAction | null {
  // Try last line first (ideal format)
  const lines = text.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim().replace(/^```json?\s*/, "").replace(/```\s*$/, "");
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.action === "string") {
        return parsed as ReceptionistAction;
      }
    } catch { /* not valid JSON */ }
  }
  // Fallback: extract JSON object from anywhere in the text
  const jsonMatch = text.match(/\{"action"\s*:\s*"[^"]+?"[^}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed.action === "string") {
        return parsed as ReceptionistAction;
      }
    } catch { /* not valid JSON */ }
  }
  return null;
}

function cleanResponseText(text: string): string {
  // Remove JSON action blocks (single line, code block, or multi-line)
  return text
    .replace(/```json?\s*\n?[\s\S]*?\{"action"[\s\S]*?\}[\s\S]*?```/g, "")
    .replace(/\n?\s*\{"action"\s*:[\s\S]*?\}\s*$/m, "")
    .trim();
}

/**
 * Convert multimodal content blocks to a text description.
 */
function contentToText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;

  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "image") return "[User sent an image]";
      return "[Media received]";
    })
    .join("\n");
}

/**
 * Get or create a cached OpenAI client with the OpenRouter API key.
 */
async function getCachedClient(): Promise<OpenAI | null> {
  if (cachedClient && Date.now() < cachedClient.expiresAt) {
    return cachedClient.client;
  }

  let apiKey: string | null = null;
  if (process.env.OPENROUTER_API_KEY) {
    apiKey = process.env.OPENROUTER_API_KEY;
  } else {
    try {
      const configs = await db.select().from(schema.openrouterConfig);
      const config = configs[0];
      if (!config?.apiKey) return null;
      const { safeDecrypt } = await import("../lib/encryption.js");
      apiKey = safeDecrypt(config.apiKey);
    } catch {
      return null;
    }
  }

  if (!apiKey) return null;

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "AgentHub",
    },
  });

  cachedClient = { client, expiresAt: Date.now() + CLIENT_CACHE_TTL };
  return client;
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
      model: schema.agents.model,
      soul: schema.agents.soul,
    })
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .then(r => r[0]);

  const systemPrompt = getAgentPrompt(
    (agent?.role as AgentRole) || "receptionist",
    undefined,
    agent?.soul,
  );

  const userText = contentToText(content);
  addToHistory(contactId, { role: "user", text: userText });
  const history = getHistory(contactId);

  try {
    const client = await getCachedClient();
    if (!client) {
      throw new Error("OpenRouter API key not configured");
    }

    // Build messages from conversation history
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const entry of history) {
      messages.push({ role: entry.role, content: entry.text });
    }

    const response = await client.chat.completions.create({
      model: agent?.model || FALLBACK_MODEL,
      messages,
      max_tokens: 1024,
    });

    const resultText = response.choices[0]?.message?.content ?? "";

    if (!resultText) {
      throw new Error("No result from OpenRouter");
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
      text: "Sorry, I had a technical issue. Could you repeat that?",
      parsedAction: null,
    };
  }
}

export function clearConversation(contactId: string): void {
  conversations.delete(contactId);
}
