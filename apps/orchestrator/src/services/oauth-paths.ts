import { homedir } from "os";
import { join } from "path";

/**
 * Per-user OAuth credentials path.
 * Structure: ~/.agenthub/users/<userId>/oauth/<provider>.json
 *
 * Legacy paths are ONLY used by agent sessions (no userId) to read CLI-installed tokens:
 * - OpenAI: ~/.codex/auth.json
 * - Gemini: ~/.gemini/oauth_creds.json
 * - Claude: ~/.claude/.credentials.json
 *
 * When userId is provided, credentials are isolated — no fallback to legacy/CLI paths.
 */
export function getUserOAuthPath(userId: string, provider: "openai" | "gemini" | "claude"): string {
  const filename = `${provider}.json`;
  return join(homedir(), ".agenthub", "users", userId, "oauth", filename);
}

export function getLegacyOAuthPath(provider: "openai" | "gemini" | "claude"): string {
  switch (provider) {
    case "openai":
      return join(homedir(), ".codex", "auth.json");
    case "gemini":
      return join(homedir(), ".gemini", "oauth_creds.json");
    case "claude":
      return join(homedir(), ".claude", ".credentials.json");
  }
}
