import { spawnSync } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
const { join } = path;
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";

type DevServerStatus = "stopped" | "starting" | "running" | "error";

interface DevServerEntry {
  process: null;
  port: number | null;
  outputDir?: string;
  status: DevServerStatus;
  logs: string[];
  projectPath: string;
}

class DevServerManager {
  private servers = new Map<string, DevServerEntry>();

  async start(projectId: string, projectPath: string): Promise<{ ok: boolean; error?: string }> {
    // Already running?
    const existing = this.servers.get(projectId);
    if (existing && existing.status === "running") {
      return { ok: true };
    }

    // Clean up any previous entry
    if (existing) {
      this.stop(projectId);
    }

    const pkgPath = join(projectPath, "package.json");
    if (!existsSync(pkgPath)) {
      return { ok: false, error: "No package.json found" };
    }

    let pkg: { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch {
      return { ok: false, error: "Failed to parse package.json" };
    }

    const scripts = pkg.scripts ?? {};

    // 1. Install dependencies if needed
    this.installDepsIfNeeded(projectPath);

    // 2. Build the project
    const buildScript = scripts.build ? "build" : null;
    if (!buildScript) {
      return { ok: false, error: "No 'build' script found in package.json" };
    }

    eventBus.emit("devserver:status", { projectId, status: "starting" });
    eventBus.emit("devserver:output", { projectId, line: "Building project...", stream: "stdout", timestamp: Date.now() });

    const binPath = join(projectPath, "node_modules", ".bin");
    const buildCmd = scripts.build;

    logger.info(`Building project ${projectId}: "${buildCmd}"`, "devserver");

    const buildResult = spawnSync("sh", ["-c", `export PATH="${binPath}:$PATH" && ${buildCmd}`], {
      cwd: projectPath,
      timeout: 300000, // 5 minutes
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });

    if (buildResult.status !== 0) {
      const stderr = buildResult.stderr?.toString() || buildResult.stdout?.toString() || "Build failed";
      eventBus.emit("devserver:output", { projectId, line: stderr, stream: "stderr", timestamp: Date.now() });
      eventBus.emit("devserver:status", { projectId, status: "error", error: "Build failed" });
      logger.error(`Build failed for ${projectId}: ${stderr.slice(0, 200)}`, "devserver");
      return { ok: false, error: stderr.slice(0, 200) };
    }

    // Emit build stdout if any
    const stdout = buildResult.stdout?.toString();
    if (stdout) {
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        eventBus.emit("devserver:output", { projectId, line, stream: "stdout", timestamp: Date.now() });
      }
    }

    eventBus.emit("devserver:output", { projectId, line: "Build completed successfully", stream: "stdout", timestamp: Date.now() });

    // 3. Detect output directory
    const outputDir = this.detectOutputDir(projectPath, pkg);
    if (!outputDir) {
      eventBus.emit("devserver:status", { projectId, status: "error", error: "No build output found" });
      return { ok: false, error: "No build output directory found (dist/, build/, out/)" };
    }

    logger.info(`Detected output directory: ${outputDir}`, "devserver");

    // 4. Store the output dir — served via API route (no separate port needed)
    this.servers.set(projectId, {
      process: null,
      port: null,
      outputDir,
      status: "running",
      logs: [`Build output: ${outputDir}`],
      projectPath,
    });

    eventBus.emit("devserver:status", { projectId, status: "running" });
    eventBus.emit("devserver:output", { projectId, line: `Preview ready — serving from ${outputDir}`, stream: "stdout", timestamp: Date.now() });

    return { ok: true };
  }

  stop(projectId: string): { ok: boolean } {
    const entry = this.servers.get(projectId);
    if (!entry) return { ok: true };

    entry.status = "stopped";
    this.servers.delete(projectId);
    eventBus.emit("devserver:status", { projectId, status: "stopped" });

    logger.info(`Preview stopped for project ${projectId}`, "devserver");
    return { ok: true };
  }

  /** Get the build output directory for a project (used by preview route) */
  getOutputDir(projectId: string): string | null {
    return this.servers.get(projectId)?.outputDir ?? null;
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

  private installDepsIfNeeded(projectPath: string): void {
    const binCheck = join(projectPath, "node_modules", ".bin");
    const needsInstall = !existsSync(binCheck) || (() => { try { return readdirSync(binCheck).length === 0; } catch { return true; } })();
    if (!needsInstall) return;

    const pm = this.detectPackageManager(projectPath);
    logger.info(`Installing dependencies for ${projectPath} using ${pm}`, "devserver");
    const installArgs = pm === "yarn" ? [] : ["install"];
    const installResult = spawnSync(pm, installArgs, {
      cwd: projectPath,
      shell: true,
      timeout: 300000,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
    });

    if (installResult.error || installResult.status !== 0) {
      const stderr = installResult.stderr?.toString() ?? installResult.error?.message ?? "unknown error";
      logger.error(`Failed to install dependencies: ${stderr}`, "devserver");
    } else {
      logger.info(`Dependencies installed successfully for ${projectPath}`, "devserver");
    }
  }

  private detectOutputDir(projectPath: string, pkg: { name?: string }): string | null {
    const candidates: string[] = [];

    // Check angular.json for outputPath (highest priority)
    const angularJsonPath = join(projectPath, "angular.json");
    if (existsSync(angularJsonPath)) {
      try {
        const angularJson = JSON.parse(readFileSync(angularJsonPath, "utf-8"));
        const projects = angularJson.projects || {};
        for (const projName of Object.keys(projects)) {
          const outputPath = projects[projName]?.architect?.build?.options?.outputPath;
          if (outputPath) {
            candidates.push(`${outputPath}/browser`); // Angular 17+ browser subdir
            candidates.push(outputPath);
          }
        }
      } catch { /* ignore */ }
    }

    // Standard candidates
    candidates.push("dist", "build", "out", ".next/out", "public", "dist/browser");

    // Angular project-named output
    if (pkg.name) {
      candidates.push(`dist/${pkg.name}`);
      candidates.push(`dist/${pkg.name}/browser`);
    }

    // First pass: directory with index.html (best match)
    for (const candidate of candidates) {
      const fullPath = join(projectPath, candidate);
      if (existsSync(fullPath) && existsSync(join(fullPath, "index.html"))) {
        return fullPath;
      }
    }

    // Fallback: any existing directory from candidates
    for (const candidate of candidates) {
      const fullPath = join(projectPath, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
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
