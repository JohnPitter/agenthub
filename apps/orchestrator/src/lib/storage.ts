import { homedir } from "os";
import { join } from "path";

/**
 * Base directory for persistent storage (cloned repos, uploads, etc.).
 * Uses STORAGE_PATH env var (set by LuxView Cloud) or falls back to ~/.agenthub.
 */
export const STORAGE_BASE = process.env.STORAGE_PATH || join(homedir(), ".agenthub");

/** Directory where cloned repositories are stored. */
export const REPOS_DIR = join(STORAGE_BASE, "repos");
