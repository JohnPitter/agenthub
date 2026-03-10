import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getAgentPrompt } from "./agent-prompts.js";
import { eventBus } from "../realtime/event-bus.js";
import { logTaskAction } from "../tasks/task-lifecycle.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { AgentRole } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import type { SessionConfig, SessionResult } from "./types.js";
import { execFile } from "child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { dirname, resolve, relative } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_TURNS = 50;

const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a shell command and return stdout/stderr. Use for running builds, tests, git operations, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
          timeout_ms: { type: "number", description: "Optional timeout in ms (default 120000)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given absolute path.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file" },
          offset: { type: "number", description: "Line number to start reading from (1-based)" },
          limit: { type: "number", description: "Maximum number of lines to read" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file, creating parent directories if needed.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "The content to write" },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace an exact string in a file with a new string. The old_string must be unique in the file.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file" },
          old_string: { type: "string", description: "The exact text to find and replace" },
          new_string: { type: "string", description: "The replacement text" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at the given path.",
      parameters: {
        type: "object",
        properties: {
          dir_path: { type: "string", description: "Absolute path to the directory" },
        },
        required: ["dir_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "Directory or file to search in" },
          include: { type: "string", description: "Glob pattern to filter files (e.g. '*.ts')" },
        },
        required: ["pattern", "path"],
      },
    },
  },
];

export class OpenRouterSession {
  private abortController: AbortController | null = null;
  private running = false;

  readonly agentId: string;
  readonly taskId: string;
  readonly sessionId: string;

  constructor(private config: SessionConfig) {
    this.agentId = config.agent.id;
    this.taskId = config.taskId;
    this.sessionId = `session_${Date.now()}_${config.agent.role}`;
  }

  async execute(): Promise<SessionResult> {
    const { agent, projectId, projectPath, taskId, prompt } = this.config;
    this.running = true;
    this.abortController = new AbortController();

    const startTime = Date.now();
    const errors: string[] = [];
    let resultText: string | undefined;
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCallCount = 0;
    const ESTIMATED_TOOL_CALLS = 20;

    const systemPrompt = getAgentPrompt(agent.role as AgentRole, agent.systemPrompt, agent.soul);

    // Inject memories
    let fullSystemPrompt = systemPrompt;
    try {
      const memoriesBlock = await agentMemory.retrieve(agent.id, projectId);
      if (memoriesBlock) {
        fullSystemPrompt = systemPrompt + memoriesBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve memories for agent ${agent.id}: ${err}`, "openrouter-session");
    }

    // Inject skills
    try {
      const assignedSkills = await db
        .select({
          name: schema.skills.name,
          instructions: schema.skills.instructions,
        })
        .from(schema.agentSkills)
        .innerJoin(schema.skills, eq(schema.agentSkills.skillId, schema.skills.id))
        .where(
          eq(schema.agentSkills.agentId, agent.id),
        );

      const activeSkills = assignedSkills.filter((s) => s.instructions);
      if (activeSkills.length > 0) {
        const skillsBlock =
          "\n\n# Skills\n\n" +
          activeSkills.map((s) => `## ${s.name}\n${s.instructions}`).join("\n\n");
        fullSystemPrompt += skillsBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve skills for agent ${agent.id}: ${err}`, "openrouter-session");
    }

    fullSystemPrompt += `\n\nYou are working in the directory: ${projectPath}\nUse absolute paths when calling tools.`;

    logger.info(
      `Starting OpenRouter session for ${agent.name} on task ${taskId}`,
      "openrouter-session",
      { model: agent.model, projectPath },
    );

    eventBus.emit("agent:status", {
      agentId: agent.id,
      projectId,
      status: "running",
      taskId,
    });

    try {
      // Get API key from openrouter_config table
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        throw new Error("OpenRouter API key not configured. Ask your admin to set it up in the Admin Panel.");
      }

      const client = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "AgentHub",
        },
      });

      // Build conversation messages
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: prompt },
      ];

      let turnCount = 0;

      while (this.running && turnCount < MAX_TURNS) {
        turnCount++;

        const response = await client.chat.completions.create({
          model: agent.model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          max_tokens: 16384,
        });

        const choice = response.choices[0];
        if (!choice) break;

        const assistantMessage = choice.message;

        // Track usage
        if (response.usage) {
          totalInputTokens += response.usage.prompt_tokens ?? 0;
          totalOutputTokens += response.usage.completion_tokens ?? 0;
        }

        // Add assistant message to conversation
        messages.push(assistantMessage);

        // Handle text content
        if (assistantMessage.content) {
          resultText = assistantMessage.content;

          eventBus.emit("agent:message", {
            agentId: agent.id,
            projectId,
            taskId,
            content: assistantMessage.content,
            contentType: "text",
            sessionId: this.sessionId,
          });

          db.insert(schema.messages).values({
            id: nanoid(),
            projectId,
            taskId,
            agentId: agent.id,
            source: "agent",
            content: assistantMessage.content,
            contentType: "text",
            metadata: JSON.stringify({ sessionId: this.sessionId }),
            parentMessageId: null,
            isThinking: false,
            createdAt: new Date(),
          }).catch((err: unknown) => logger.error(`Failed to persist message: ${err}`, "openrouter-session"));
        }

        // If no tool calls, we're done
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          break;
        }

        // Execute tool calls
        for (const rawToolCall of assistantMessage.tool_calls) {
          if (!this.running) break;
          if (rawToolCall.type !== "function") continue;
          const toolCall = rawToolCall;

          toolCallCount++;
          const estimatedProgress = Math.min(95, (toolCallCount / ESTIMATED_TOOL_CALLS) * 100);

          eventBus.emit("agent:tool_use", {
            agentId: agent.id,
            projectId,
            taskId,
            tool: toolCall.function.name,
            input: toolCall.function.arguments,
            response: null,
            sessionId: this.sessionId,
          });

          eventBus.emit("agent:status", {
            agentId: agent.id,
            projectId,
            status: "running",
            taskId,
            progress: estimatedProgress,
          });

          eventBus.emit("board:activity", {
            projectId,
            agentId: agent.id,
            action: "tool_use",
            detail: `${agent.name} using ${toolCall.function.name}`,
            timestamp: Date.now(),
          });

          logTaskAction(taskId, "tool_use", agent.id, `Tool: ${toolCall.function.name}`).catch(() => {});

          // Persist tool use to DB
          db.insert(schema.messages).values({
            id: nanoid(),
            projectId,
            taskId,
            agentId: agent.id,
            source: "agent",
            content: toolCall.function.name,
            contentType: "tool_use",
            metadata: JSON.stringify({
              sessionId: this.sessionId,
              tool: toolCall.function.name,
              input: toolCall.function.arguments,
            }),
            parentMessageId: null,
            isThinking: false,
            createdAt: new Date(),
          }).catch((err) => logger.error(`Failed to persist tool_use: ${err}`, "openrouter-session"));

          // Execute tool
          const result = await this.executeTool(
            toolCall.function.name,
            toolCall.function.arguments,
            projectPath,
            { agentId: agent.id, agentName: agent.name, projectId, taskId },
          );

          // Emit cursor position for file-related tools
          const toolInput = this.parseArgs(toolCall.function.arguments);
          const filePath = toolInput?.file_path as string | undefined;
          if (filePath && ["read_file", "write_file", "edit_file"].includes(toolCall.function.name)) {
            eventBus.emit("board:agent_cursor", {
              projectId,
              agentId: agent.id,
              filePath: this.resolvePath(filePath, projectPath),
              action: toolCall.function.name === "read_file" ? "Read" : toolCall.function.name === "write_file" ? "Write" : "Edit",
            });
          }

          // Add tool result to conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // Check finish reason
        if (choice.finish_reason === "stop") {
          break;
        }
      }

      if (turnCount >= MAX_TURNS) {
        errors.push(`Agent loop exceeded maximum of ${MAX_TURNS} turns`);
      }

      // Calculate cost from OpenRouter usage headers or response
      // OpenRouter includes cost in the x-openrouter-cost header or in usage
      // For now, estimate from token counts (OpenRouter pricing varies by model)
      // The actual cost tracking is best done via OpenRouter dashboard
      totalCost = 0; // Will be updated when we have pricing data

    } catch (err: unknown) {
      let errorMsg: string;
      if (err && typeof err === "object" && "status" in err && "error" in err) {
        const apiErr = err as { status: number; error: unknown; message: string };
        errorMsg = `API ${apiErr.status}: ${JSON.stringify(apiErr.error) ?? apiErr.message}`;
      } else {
        errorMsg = err instanceof Error ? err.message : "Unknown error";
      }
      errors.push(errorMsg);
      logger.error(`OpenRouter session failed: ${errorMsg}`, "openrouter-session", { agentId: agent.id, taskId });

      db.insert(schema.messages).values({
        id: nanoid(),
        projectId,
        taskId,
        agentId: agent.id,
        source: "agent",
        content: errorMsg,
        contentType: "error",
        metadata: JSON.stringify({ sessionId: this.sessionId }),
        parentMessageId: null,
        isThinking: false,
        createdAt: new Date(),
      }).catch(() => {});
    } finally {
      this.running = false;
      this.abortController = null;
    }

    const duration = Date.now() - startTime;
    const isError = errors.length > 0;

    // Store token usage for analytics
    const tokensUsed = totalInputTokens + totalOutputTokens;

    eventBus.emit("agent:result", {
      agentId: agent.id,
      projectId,
      taskId,
      result: resultText,
      cost: totalCost,
      duration,
      isError,
      errors: isError ? errors : undefined,
    });

    eventBus.emit("agent:status", {
      agentId: agent.id,
      projectId,
      status: isError ? "error" : "idle",
      taskId,
    });

    logger.info(
      `OpenRouter session completed for ${agent.name}: ${isError ? "ERROR" : "SUCCESS"} (${duration}ms, $${totalCost.toFixed(4)}, ${tokensUsed} tokens)`,
      "openrouter-session",
    );

    return { result: resultText, cost: totalCost, duration, isError, errors };
  }

  private parseArgs(argsJson: string): Record<string, unknown> | null {
    try {
      return JSON.parse(argsJson);
    } catch {
      return null;
    }
  }

  private async executeTool(
    toolName: string,
    argsJson: string,
    projectPath: string,
    ctx: { agentId: string; agentName: string; projectId: string; taskId: string },
  ): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson);
    } catch {
      return `Error: Invalid JSON arguments: ${argsJson}`;
    }

    try {
      switch (toolName) {
        case "bash":
          return await this.toolBash(args, projectPath);
        case "read_file":
          return await this.toolReadFile(args, projectPath);
        case "write_file":
          return await this.toolWriteFile(args, projectPath, ctx);
        case "edit_file":
          return await this.toolEditFile(args, projectPath, ctx);
        case "list_dir":
          return await this.toolListDir(args, projectPath);
        case "grep":
          return await this.toolGrep(args, projectPath);
        default:
          return `Error: Unknown tool "${toolName}"`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }

  private async toolBash(args: Record<string, unknown>, projectPath: string): Promise<string> {
    const command = args.command as string;
    const timeoutMs = (args.timeout_ms as number) || 120_000;

    try {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
      const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

      const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
        cwd: projectPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      });

      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      return output || "(no output)";
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; signal?: string; message?: string };
      const output = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
      if (output) return output;
      return `Command failed: ${e.message ?? "unknown error"}`;
    }
  }

  private async toolReadFile(args: Record<string, unknown>, projectPath: string): Promise<string> {
    const filePath = this.resolvePath(args.file_path as string, projectPath);
    const offset = (args.offset as number) || 0;
    const limit = (args.limit as number) || 0;

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const startLine = offset > 0 ? offset - 1 : 0;
    const endLine = limit > 0 ? startLine + limit : lines.length;
    const selectedLines = lines.slice(startLine, endLine);

    return selectedLines
      .map((line, i) => `${startLine + i + 1}\t${line}`)
      .join("\n");
  }

  private async toolWriteFile(
    args: Record<string, unknown>,
    projectPath: string,
    ctx: { agentId: string; projectId: string },
  ): Promise<string> {
    const filePath = this.resolvePath(args.file_path as string, projectPath);
    const content = args.content as string;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");

    eventBus.emit("board:agent_cursor", {
      projectId: ctx.projectId,
      agentId: ctx.agentId,
      filePath,
      action: "Write",
    });

    return `File written: ${filePath}`;
  }

  private async toolEditFile(
    args: Record<string, unknown>,
    projectPath: string,
    ctx: { agentId: string; projectId: string },
  ): Promise<string> {
    const filePath = this.resolvePath(args.file_path as string, projectPath);
    const oldString = args.old_string as string;
    const newString = args.new_string as string;

    const content = await readFile(filePath, "utf-8");

    const occurrences = content.split(oldString).length - 1;
    if (occurrences === 0) {
      return `Error: old_string not found in ${filePath}`;
    }
    if (occurrences > 1) {
      return `Error: old_string found ${occurrences} times in ${filePath}. Provide more context to make it unique.`;
    }

    const updated = content.replace(oldString, newString);
    await writeFile(filePath, updated, "utf-8");

    eventBus.emit("board:agent_cursor", {
      projectId: ctx.projectId,
      agentId: ctx.agentId,
      filePath,
      action: "Edit",
    });

    return `File edited: ${filePath}`;
  }

  private async toolListDir(args: Record<string, unknown>, projectPath: string): Promise<string> {
    const dirPath = this.resolvePath(args.dir_path as string, projectPath);
    const entries = await readdir(dirPath, { withFileTypes: true });

    return entries
      .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`)
      .join("\n");
  }

  private async toolGrep(args: Record<string, unknown>, projectPath: string): Promise<string> {
    const pattern = args.pattern as string;
    const searchPath = this.resolvePath(args.path as string, projectPath);
    const include = args.include as string | undefined;

    const rgArgs = ["-n", "--max-count=50", "--color=never"];
    if (include) rgArgs.push("--glob", include);
    rgArgs.push(pattern, searchPath);

    try {
      const { stdout } = await execFileAsync("rg", rgArgs, {
        cwd: projectPath,
        timeout: 30_000,
        maxBuffer: 512 * 1024,
      });
      return stdout.trim() || "(no matches)";
    } catch {
      try {
        const grepArgs = ["-rn", "--max-count=50", "--color=never"];
        if (include) grepArgs.push("--include", include);
        grepArgs.push(pattern, searchPath);

        const { stdout } = await execFileAsync("grep", grepArgs, {
          cwd: projectPath,
          timeout: 30_000,
          maxBuffer: 512 * 1024,
        });
        return stdout.trim() || "(no matches)";
      } catch {
        return "(no matches or search failed)";
      }
    }
  }

  private resolvePath(filePath: string, projectPath: string): string {
    const resolved = resolve(projectPath, filePath);
    const rel = relative(projectPath, resolved);
    if (rel.startsWith("..")) {
      logger.debug(`Path outside project: ${resolved}`, "openrouter-session");
    }
    return resolved;
  }

  private async getApiKey(): Promise<string | null> {
    try {
      // Check env var first
      if (process.env.OPENROUTER_API_KEY) {
        return process.env.OPENROUTER_API_KEY;
      }

      // Get from database
      const configs = await db.select().from(schema.openrouterConfig);
      const config = configs[0];
      if (!config?.apiKey) return null;

      const { safeDecrypt } = await import("../lib/encryption.js");
      return safeDecrypt(config.apiKey);
    } catch (err) {
      logger.error(`Failed to get OpenRouter API key: ${err}`, "openrouter-session");
      return null;
    }
  }

  cancel() {
    this.running = false;
    this.abortController?.abort();
    logger.info(`OpenRouter session cancelled for agent ${this.agentId}`, "openrouter-session");
  }

  get isRunning() {
    return this.running;
  }
}
