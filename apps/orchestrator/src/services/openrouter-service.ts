import { db, schema } from "@agenthub/database";
import { encrypt, safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  architecture: { modality: string };
}

export async function fetchAvailableModels(apiKey: string): Promise<OpenRouterModelInfo[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "AgentHub",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data: OpenRouterModelInfo[] };
  return data.data ?? [];
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AgentHub",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getOpenRouterConfig(): Promise<{
  id: string;
  apiKey: string;
  enabledModels: { id: string; name: string; provider: string }[] | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const configs = await db.select().from(schema.openrouterConfig);
  return configs[0] ?? null;
}

// Module-level cache for decrypted API key with 5-min TTL
let cachedApiKey: { value: string; expiresAt: number } | null = null;
const API_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getDecryptedApiKey(): Promise<string | null> {
  // Check env first
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // Check cache
  if (cachedApiKey && Date.now() < cachedApiKey.expiresAt) {
    return cachedApiKey.value;
  }

  const config = await getOpenRouterConfig();
  if (!config?.apiKey) return null;
  const decrypted = safeDecrypt(config.apiKey);
  if (decrypted) {
    cachedApiKey = { value: decrypted, expiresAt: Date.now() + API_KEY_CACHE_TTL };
  }
  return decrypted;
}

export async function saveOpenRouterConfig(
  apiKey: string,
  enabledModels: { id: string; name: string; provider: string }[],
  userId: string,
) {
  const encryptedKey = encrypt(apiKey);
  cachedApiKey = null; // Invalidate cache on config change
  const existing = await getOpenRouterConfig();

  if (existing) {
    await db.update(schema.openrouterConfig).set({
      apiKey: encryptedKey,
      enabledModels,
      updatedAt: new Date(),
    }).where(eq(schema.openrouterConfig.id, existing.id));
    logger.info("OpenRouter config updated", "admin");
  } else {
    await db.insert(schema.openrouterConfig).values({
      id: nanoid(),
      apiKey: encryptedKey,
      enabledModels,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    logger.info("OpenRouter config created", "admin");
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 6) + "..." + key.slice(-4);
}
