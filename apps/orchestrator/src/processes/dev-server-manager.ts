import { spawn, type ChildProcess } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";

type DevServerStatus = "stopped" | "starting" | "running" | "error";

interface DevServerEntry {
  process: ChildProcess;
  port: number | null;
  status: DevServerStatus;
  logs: string[];
  projectPath: string;
}

const MAX_LOG_LINES = 500;
const PORT_DETECT_REGEX = /https?:\/\/localhost:(\d+)/;
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

// Framework default ports
const FRAMEWORK_PORTS: Record<string, number> = {
  next: 3000,
  vite: 5173,
  "react-scripts": 3000,
  nuxt: 3000,
  astro: 4321,
  remix: 5173,
  svelte: 5173,
  angular: 4200,
  gatsby: 8000,
};

class DevServerManager {
  private servers = new Map<string, DevServerEntry>();

  start(projectId: string, projectPath: string): { ok: boolean; error?: string } {
    // Already running?
    const existing = this.servers.get(projectId);
    if (existing && existing.status !== "stopped" && existing.status !== "error") {
      return { ok: true };
    }

    // Clean up any previous entry
    if (existing) {
      this.cleanup(projectId);
    }

    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) {
      return { ok: false, error: "package.json not found in project path" };
    }

    let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch {
      return { ok: false, error: "Failed to parse package.json" };
    }

    // Detect which script to run
    const scripts = pkg.scripts ?? {};
    let scriptName: string | null = null;
    if (scripts.dev) scriptName = "dev";
    else if (scripts.start) scriptName = "start";

    if (!scriptName) {
      return { ok: false, error: "No 'dev' or 'start' script found in package.json" };
    }

    // Detect port
    const port = this.detectPort(scripts[scriptName]!, projectPath, pkg);

    // Detect package manager
    const pm = this.detectPackageManager(projectPath);

    const entry: DevServerEntry = {
      process: null!,
      port,
      status: "starting",
      logs: [],
      projectPath,
    };

    // Emit starting status
    eventBus.emit("devserver:status", { projectId, status: "starting", port: port ?? undefined });

    // Spawn process
    const isWindows = process.platform === "win32";
    const child = spawn(pm, ["run", scriptName], {
      cwd: projectPath,
      shell: isWindows,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    entry.process = child;
    this.servers.set(projectId, entry);

    const handleOutput = (stream: "stdout" | "stderr") => (data: Buffer) => {
      const text = data.toString();
      const lines = text.split(/\r?\n/).filter(Boolean);

      for (const line of lines) {
        // Buffer log line
        entry.logs.push(line);
        if (entry.logs.length > MAX_LOG_LINES) {
          entry.logs.shift();
        }

        // Emit to clients
        eventBus.emit("devserver:output", {
          projectId,
          line,
          stream,
          timestamp: Date.now(),
        });

        // Detect port from output (e.g., "http://localhost:3000")
        // Strip ANSI escape codes before matching — tools like Vite embed colors in URLs
        if (entry.status === "starting") {
          const match = stripAnsi(line).match(PORT_DETECT_REGEX);
          if (match) {
            const detectedPort = parseInt(match[1], 10);
            entry.port = detectedPort;
            entry.status = "running";
            eventBus.emit("devserver:status", {
              projectId,
              status: "running",
              port: detectedPort,
            });
            logger.info(`Dev server for project ${projectId} running on port ${detectedPort}`, "devserver");
          }
        }
      }
    };

    child.stdout?.on("data", handleOutput("stdout"));
    child.stderr?.on("data", handleOutput("stderr"));

    child.on("error", (err) => {
      entry.status = "error";
      eventBus.emit("devserver:status", {
        projectId,
        status: "error",
        error: err.message,
      });
      logger.error(`Dev server error for project ${projectId}: ${err.message}`, "devserver");
    });

    child.on("exit", (code) => {
      // Only set stopped if not already in error state from explicit stop
      if (entry.status !== "stopped") {
        entry.status = code === 0 ? "stopped" : "error";
        eventBus.emit("devserver:status", {
          projectId,
          status: entry.status,
          error: code !== 0 ? `Process exited with code ${code}` : undefined,
        });
      }
      logger.info(`Dev server for project ${projectId} exited with code ${code}`, "devserver");
    });

    logger.info(`Dev server starting for project ${projectId}: ${pm} run ${scriptName}`, "devserver");
    return { ok: true };
  }

  stop(projectId: string): { ok: boolean } {
    const entry = this.servers.get(projectId);
    if (!entry) return { ok: true };

    entry.status = "stopped";
    eventBus.emit("devserver:status", { projectId, status: "stopped" });

    this.killProcess(entry.process);
    this.servers.delete(projectId);

    logger.info(`Dev server stopped for project ${projectId}`, "devserver");
    return { ok: true };
  }

  getStatus(projectId: string): {
    status: DevServerStatus;
    port: number | null;
    logs: string[];
  } {
    const entry = this.servers.get(projectId);
    if (!entry) {
      return { status: "stopped", port: null, logs: [] };
    }
    return {
      status: entry.status,
      port: entry.port,
      logs: [...entry.logs],
    };
  }

  stopAll(): void {
    for (const [projectId] of this.servers) {
      this.stop(projectId);
    }
  }

  private cleanup(projectId: string): void {
    const entry = this.servers.get(projectId);
    if (entry) {
      this.killProcess(entry.process);
      this.servers.delete(projectId);
    }
  }

  private killProcess(child: ChildProcess): void {
    if (!child || child.killed) return;

    // Try SIGTERM first
    child.kill("SIGTERM");

    // Force kill after 5 seconds
    const forceKill = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 5000);

    child.on("exit", () => clearTimeout(forceKill));
  }

  private detectPort(script: string, projectPath: string, pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): number | null {
    // 1. Parse script for --port or -p flags
    const portFlag = script.match(/(?:--port|-p)\s+(\d+)/);
    if (portFlag) return parseInt(portFlag[1], 10);

    // 2. Check .env files for PORT=
    for (const envFile of [".env.local", ".env"]) {
      const envPath = join(projectPath, envFile);
      if (existsSync(envPath)) {
        try {
          const envContent = readFileSync(envPath, "utf-8");
          const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
          if (portMatch) return parseInt(portMatch[1], 10);
        } catch { /* ignore */ }
      }
    }

    // 3. Detect framework from dependencies
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [framework, port] of Object.entries(FRAMEWORK_PORTS)) {
      if (allDeps[framework]) return port;
    }

    return null;
  }

  private detectPackageManager(projectPath: string): string {
    if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
    if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
    return "npm";
  }
}

export const devServerManager = new DevServerManager();
