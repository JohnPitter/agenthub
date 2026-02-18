import { readFile, readdir } from "fs/promises";
import { join, basename, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { db, schema } from "@agenthub/database";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { ApiEndpoint } from "@agenthub/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROUTES_DIR = resolve(__dirname, "..", "routes");

/**
 * DocGenerator — static analysis of route files + task change summaries.
 * No AI involved; pure regex parsing and DB queries.
 */
class DocGenerator {
  /**
   * Returns the list of route .ts files in orchestrator/src/routes/
   */
  async getRouteFiles(): Promise<string[]> {
    try {
      const entries = await readdir(ROUTES_DIR);
      return entries
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(ROUTES_DIR, f));
    } catch (err) {
      logger.error(`Failed to read routes directory: ${err}`, "doc-generator");
      return [];
    }
  }

  /**
   * Parse Express route files to extract endpoint definitions via regex.
   * Looks for patterns like:
   *   // GET /api/path — description
   *   router.get("/path", ...)
   */
  async generateApiDocs(routeFiles: string[]): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];

    for (const filePath of routeFiles) {
      try {
        const content = await readFile(filePath, "utf-8");
        const group = this.groupFromFilename(basename(filePath, ".ts"));
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Match router.get/post/patch/delete/put patterns
          const routeMatch = line.match(
            /(?:router|Router\(\)|\w+Router)\.(get|post|patch|delete|put)\s*\(\s*["'`]([^"'`]+)["'`]/
          );

          if (!routeMatch) continue;

          const method = routeMatch[1].toUpperCase();
          const routePath = routeMatch[2];

          // Look for a comment description above this line
          const description = this.extractDescription(lines, i);

          // Extract path params from the route pattern
          const pathParams = this.extractPathParams(routePath);

          // Extract query/body params from nearby code
          const queryParams = this.extractQueryParams(lines, i);
          const bodyParams = this.extractBodyParams(lines, i);

          const params = [...pathParams, ...queryParams, ...bodyParams];

          endpoints.push({
            method,
            path: routePath,
            description,
            group,
            params: params.length > 0 ? params : undefined,
          });
        }
      } catch (err) {
        logger.warn(`Failed to parse route file ${filePath}: ${err}`, "doc-generator");
      }
    }

    return endpoints;
  }

  /**
   * Generate a markdown summary of what happened during a task's lifecycle.
   */
  async generateChangeSummary(taskId: string): Promise<string> {
    const task = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get();

    if (!task) {
      return `Task ${taskId} not found.`;
    }

    const logs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, taskId))
      .orderBy(desc(schema.taskLogs.createdAt))
      .all();

    const lines: string[] = [
      `# Task Summary: ${task.title}`,
      "",
      `**ID:** ${task.id}`,
      `**Status:** ${task.status}`,
      `**Priority:** ${task.priority}`,
      `**Category:** ${task.category ?? "N/A"}`,
      `**Branch:** ${task.branch ?? "N/A"}`,
      `**Created:** ${task.createdAt ? new Date(task.createdAt).toISOString() : "N/A"}`,
      `**Completed:** ${task.completedAt ? new Date(task.completedAt).toISOString() : "N/A"}`,
      "",
    ];

    if (task.description) {
      lines.push("## Description", "", task.description, "");
    }

    if (task.result) {
      lines.push("## Result", "", task.result, "");
    }

    if (logs.length > 0) {
      lines.push("## Activity Log", "");
      lines.push("| Time | Agent | Action | Detail |");
      lines.push("|------|-------|--------|--------|");

      for (const log of logs) {
        const time = log.createdAt ? new Date(log.createdAt).toLocaleString() : "—";
        const agent = log.agentId ?? "—";
        const action = log.action ?? "—";
        const detail = (log.detail ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
        lines.push(`| ${time} | ${agent} | ${action} | ${detail} |`);
      }

      lines.push("");

      // Collect unique files mentioned in logs
      const files = new Set<string>();
      for (const log of logs) {
        if (log.filePath) files.add(log.filePath);
      }

      if (files.size > 0) {
        lines.push("## Files Changed", "");
        for (const f of files) {
          lines.push(`- \`${f}\``);
        }
        lines.push("");
      }

      // Status transitions
      const transitions = logs
        .filter((l) => l.fromStatus && l.toStatus)
        .map((l) => `${l.fromStatus} → ${l.toStatus}`);

      if (transitions.length > 0) {
        lines.push("## Status Transitions", "");
        for (const t of transitions) {
          lines.push(`- ${t}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  // --- Private helpers ---

  private groupFromFilename(name: string): string {
    // Convert kebab-case filename to Title Case group name
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private extractDescription(lines: string[], routeLineIndex: number): string {
    // Search upward for a comment line (// or /** ... */)
    for (let j = routeLineIndex - 1; j >= Math.max(0, routeLineIndex - 5); j--) {
      const trimmed = lines[j].trim();

      // Single-line comment: // GET /api/path — description
      // or // description text
      if (trimmed.startsWith("//")) {
        const commentText = trimmed.replace(/^\/\/\s*/, "");
        // If it matches "METHOD /path — desc", extract the desc part
        const dashMatch = commentText.match(/(?:GET|POST|PATCH|PUT|DELETE)\s+\S+\s*[—–-]\s*(.+)/i);
        if (dashMatch) return dashMatch[1].trim();
        // Otherwise use the whole comment
        return commentText;
      }

      // JSDoc single-line: /** description */
      if (trimmed.startsWith("/**") && trimmed.endsWith("*/")) {
        return trimmed.replace(/^\/\*\*\s*/, "").replace(/\s*\*\/$/, "").trim();
      }

      // JSDoc multi-line: * description line
      if (trimmed.startsWith("*") && !trimmed.startsWith("*/")) {
        const text = trimmed.replace(/^\*\s*/, "").trim();
        if (text && !text.startsWith("@")) return text;
      }

      // Skip empty lines
      if (trimmed === "") continue;

      // Hit non-comment code — stop searching
      break;
    }

    return "";
  }

  private extractPathParams(routePath: string): NonNullable<ApiEndpoint["params"]> {
    const params: NonNullable<ApiEndpoint["params"]> = [];
    const pathParamRegex = /:(\w+)/g;
    let match;
    while ((match = pathParamRegex.exec(routePath)) !== null) {
      params.push({
        name: match[1],
        in: "path",
        type: "string",
        required: true,
      });
    }
    return params;
  }

  private extractQueryParams(lines: string[], routeLineIndex: number): NonNullable<ApiEndpoint["params"]> {
    const params: NonNullable<ApiEndpoint["params"]> = [];
    // Search the next 15 lines for req.query destructuring or usage
    const searchEnd = Math.min(lines.length, routeLineIndex + 15);

    for (let j = routeLineIndex; j < searchEnd; j++) {
      const line = lines[j];

      // Pattern: const { x, y, z } = req.query
      const destructureMatch = line.match(/\{\s*([^}]+)\}\s*=\s*req\.query/);
      if (destructureMatch) {
        const names = destructureMatch[1].split(",").map((s) => s.trim().split(":")[0].split("=")[0].trim()).filter(Boolean);
        for (const name of names) {
          if (!params.some((p) => p.name === name)) {
            params.push({ name, in: "query", type: "string", required: false });
          }
        }
      }

      // Pattern: req.query.x or req.query.x as ...
      const dotMatch = line.match(/req\.query\.(\w+)/g);
      if (dotMatch) {
        for (const m of dotMatch) {
          const name = m.replace("req.query.", "");
          if (!params.some((p) => p.name === name)) {
            params.push({ name, in: "query", type: "string", required: false });
          }
        }
      }
    }

    return params;
  }

  private extractBodyParams(lines: string[], routeLineIndex: number): NonNullable<ApiEndpoint["params"]> {
    const params: NonNullable<ApiEndpoint["params"]> = [];
    // Search the next 15 lines for req.body destructuring
    const searchEnd = Math.min(lines.length, routeLineIndex + 15);

    for (let j = routeLineIndex; j < searchEnd; j++) {
      const line = lines[j];

      // Pattern: const { x, y, z } = req.body
      const destructureMatch = line.match(/\{\s*([^}]+)\}\s*=\s*req\.body/);
      if (destructureMatch) {
        const names = destructureMatch[1].split(",").map((s) => s.trim().split(":")[0].split("=")[0].trim()).filter(Boolean);
        for (const name of names) {
          if (!params.some((p) => p.name === name)) {
            params.push({ name, in: "body", type: "string", required: false });
          }
        }
        break;
      }
    }

    return params;
  }
}

export const docGenerator = new DocGenerator();
