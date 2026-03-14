import { homedir } from "os";
import { join, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { platform } from "os";
import { stat } from "fs/promises";

const execFileAsync = promisify(execFile);

/**
 * Base directory for persistent storage (cloned repos, uploads, etc.).
 * Uses STORAGE_PATH env var (set by LuxView Cloud) or falls back to ~/.agenthub.
 */
export const STORAGE_BASE = process.env.STORAGE_PATH || join(homedir(), ".agenthub");

/** Directory where cloned repositories are stored. */
export const REPOS_DIR = join(STORAGE_BASE, "repos");

/** Get user-scoped repos directory: REPOS_DIR/<userId>/ */
export function userReposDir(userId: string): string {
  // Path traversal protection
  const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!sanitized) throw new Error("Invalid userId for directory");
  return join(REPOS_DIR, sanitized);
}

/** Validate that a path is within the allowed REPOS_DIR */
export function isPathWithinRepos(targetPath: string): boolean {
  const resolved = resolve(targetPath);
  const reposResolved = resolve(REPOS_DIR);
  return resolved.startsWith(reposResolved);
}

/** Calculate directory size in MB. */
export async function getDirectorySizeMb(dirPath: string): Promise<number> {
  try {
    // Check path exists first
    await stat(dirPath);

    if (platform() === "win32") {
      const { stdout } = await execFileAsync("powershell", [
        "-NoProfile", "-Command",
        `(Get-ChildItem -Path '${dirPath.replace(/'/g, "''")}' -Recurse -File | Measure-Object -Property Length -Sum).Sum`,
      ], { timeout: 30000 });
      const bytes = parseInt(stdout.trim()) || 0;
      return Math.round((bytes / (1024 * 1024)) * 100) / 100;
    } else {
      const { stdout } = await execFileAsync("du", ["-sb", dirPath], { timeout: 30000 });
      const bytes = parseInt(stdout.split("\t")[0] ?? "0") || 0;
      return Math.round((bytes / (1024 * 1024)) * 100) / 100;
    }
  } catch {
    return 0;
  }
}
