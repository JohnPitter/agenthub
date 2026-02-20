import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  error?: Error;
}

/**
 * Safely execute a command using execFile (prevents shell injection)
 * @param command Command to execute (e.g., "git")
 * @param args Array of arguments (e.g., ["status", "--porcelain"])
 * @param options Optional cwd and timeout
 * @returns Promise with stdout, stderr, and optional error
 */
export async function execFileNoThrow(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 5000,
      maxBuffer: 1024 * 1024, // 1MB
      env: options?.env,
    });
    return { stdout, stderr };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
