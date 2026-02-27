import { logger } from "../lib/logger.js";

interface ProviderCredentials {
  clientId: string;
  clientSecret?: string;
}

const cache = new Map<string, ProviderCredentials>();

// Hardcoded fallbacks (last resort if GitHub fetch fails and no env vars)
const FALLBACKS: Record<string, ProviderCredentials> = {
  openai: { clientId: "app_EMoamEEZ73f0CkXaXp7hrann" },
  gemini: { clientId: "", clientSecret: "" },
  claude: { clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e" },
};

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverOpenAI(): Promise<ProviderCredentials> {
  // Priority: env var → GitHub source → hardcoded fallback
  const envId = process.env.OPENAI_OAUTH_CLIENT_ID;
  if (envId) return { clientId: envId };

  try {
    const source = await fetchWithTimeout(
      "https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/auth.rs",
    );
    const match = source.match(/CLIENT_ID:\s*&str\s*=\s*"([^"]+)"/);
    if (match?.[1]) {
      logger.info(`Discovered OpenAI OAuth client ID from GitHub: ${match[1].slice(0, 12)}...`, "oauth-discovery");
      return { clientId: match[1] };
    }
  } catch (err) {
    logger.debug(`Failed to fetch OpenAI credentials from GitHub: ${err instanceof Error ? err.message : "Unknown"}`, "oauth-discovery");
  }

  return FALLBACKS.openai;
}

async function discoverGemini(): Promise<ProviderCredentials> {
  // Priority: env vars → GitHub source → hardcoded fallback
  const envId = process.env.GEMINI_OAUTH_CLIENT_ID;
  const envSecret = process.env.GEMINI_OAUTH_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  try {
    const source = await fetchWithTimeout(
      "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/packages/core/src/code_assist/oauth2.ts",
    );
    const idMatch = source.match(/OAUTH_CLIENT_ID\s*=\s*'([^']+)'/);
    const secretMatch = source.match(/OAUTH_CLIENT_SECRET\s*=\s*'([^']+)'/);
    if (idMatch?.[1] && secretMatch?.[1]) {
      logger.info(`Discovered Gemini OAuth credentials from GitHub`, "oauth-discovery");
      return { clientId: idMatch[1], clientSecret: secretMatch[1] };
    }
  } catch (err) {
    logger.debug(`Failed to fetch Gemini credentials from GitHub: ${err instanceof Error ? err.message : "Unknown"}`, "oauth-discovery");
  }

  return FALLBACKS.gemini;
}

function discoverClaude(): ProviderCredentials {
  // Claude client ID is hardcoded — no public repo to scrape
  return FALLBACKS.claude;
}

export async function discoverCredentials(provider: "openai" | "gemini" | "claude"): Promise<ProviderCredentials> {
  const cached = cache.get(provider);
  if (cached) return cached;

  let creds: ProviderCredentials;
  switch (provider) {
    case "openai":
      creds = await discoverOpenAI();
      break;
    case "gemini":
      creds = await discoverGemini();
      break;
    case "claude":
      creds = discoverClaude();
      break;
  }

  cache.set(provider, creds);
  return creds;
}

export async function initDiscovery(): Promise<void> {
  const providers = ["openai", "gemini", "claude"] as const;
  const results = await Promise.allSettled(providers.map((p) => discoverCredentials(p)));

  const discovered: string[] = [];
  for (let i = 0; i < providers.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value.clientId) {
      discovered.push(providers[i]);
    }
  }

  if (discovered.length > 0) {
    logger.info(`OAuth credentials discovered for: ${discovered.join(", ")}`, "oauth-discovery");
  }
}
