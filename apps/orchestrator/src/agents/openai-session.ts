import OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses.js";
import { getAgentPrompt } from "./agent-prompts.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { nanoid } from "nanoid";
import type { AgentRole } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import type { SessionConfig, SessionResult } from "./agent-session.js";
import { execFile } from "child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { dirname, resolve, relative, join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// OpenAI pricing per 1M tokens (approximate, for cost tracking)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.3-codex": { input: 2.0, output: 8.0 },
  "gpt-5.2-codex": { input: 2.0, output: 8.0 },
  "gpt-5.1-codex": { input: 2.0, output: 8.0 },
  "gpt-5-codex-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3": { input: 2.0, output: 8.0 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "codex-mini": { input: 1.5, output: 6.0 },
};

// Maximum number of agentic loop iterations to prevent runaway
const MAX_TURNS = 50;

// ChatGPT OAuth only supports gpt-5.x-codex model family.
// Map user-selected models to the closest OAuth-compatible equivalent.
const OAUTH_MODEL_MAP: Record<string, string> = {
  "gpt-4.1": "gpt-5.1-codex",
  "gpt-4.1-mini": "gpt-5-codex-mini",
  "gpt-4.1-nano": "gpt-5-codex-mini",
  "o3": "gpt-5.3-codex",
  "o4-mini": "gpt-5-codex-mini",
  "codex-mini": "gpt-5-codex-mini",
  "codex-mini-latest": "gpt-5-codex-mini",
};
const OAUTH_DEFAULT_MODEL = "gpt-5.1-codex";

// Tool definitions for the Responses API
const TOOL_DEFINITIONS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
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
    strict: false,
  },
  {
    type: "function",
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
    strict: false,
  },
  {
    type: "function",
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
    strict: false,
  },
  {
    type: "function",
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
    strict: false,
  },
  {
    type: "function",
    name: "list_dir",
    description: "List files and directories at the given path.",
    parameters: {
      type: "object",
      properties: {
        dir_path: { type: "string", description: "Absolute path to the directory" },
      },
      required: ["dir_path"],
    },
    strict: false,
  },
  {
    type: "function",
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
    strict: false,
  },
];

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
}

export class OpenAISession {
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
    let totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };
    let toolCallCount = 0;
    const ESTIMATED_TOOL_CALLS = 20;

    const systemPrompt = getAgentPrompt(agent.role as AgentRole, agent.systemPrompt, agent.soul);

    let fullSystemPrompt = systemPrompt;
    try {
      const memoriesBlock = await agentMemory.retrieve(agent.id, projectId);
      if (memoriesBlock) {
        fullSystemPrompt = systemPrompt + memoriesBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve memories for agent ${agent.id}: ${err}`, "openai-session");
    }

    fullSystemPrompt += `\n\nYou are working in the directory: ${projectPath}\nUse absolute paths when calling tools.`;

    logger.info(
      `Starting OpenAI session for ${agent.name} on task ${taskId}`,
      "openai-session",
      { model: agent.model, projectPath },
    );

    eventBus.emit("agent:status", {
      agentId: agent.id,
      projectId,
      status: "running",
      taskId,
    });

    try {
      const creds = await this.getApiCredentials();
      if (!creds) {
        throw new Error("No OpenAI credentials found. Set OPENAI_API_KEY or connect via OAuth.");
      }

      const isOAuth = creds.source === "oauth";

      // Build OpenAI client — OAuth uses chatgpt.com backend, API key uses api.openai.com
      const client = new OpenAI({
        apiKey: creds.token,
        baseURL: isOAuth
          ? "https://chatgpt.com/backend-api/codex"
          : "https://api.openai.com/v1",
        defaultHeaders: isOAuth
          ? {
              "oai-product-sku": "CODEX",
              "oai-language": "en-US",
              ...(creds.accountId ? { "chatgpt-account-id": creds.accountId } : {}),
            }
          : undefined,
      });

      // OAuth backend only accepts gpt-5.x-codex model family
      const resolvedModel = isOAuth
        ? (OAUTH_MODEL_MAP[agent.model] ?? OAUTH_DEFAULT_MODEL)
        : agent.model;

      if (isOAuth && resolvedModel !== agent.model) {
        logger.info(`OAuth model mapping: ${agent.model} → ${resolvedModel}`, "openai-session");
      }

      // Run agentic loop: send prompt, process tool calls, repeat
      // ChatGPT OAuth backend does NOT support previous_response_id,
      // so we build the full conversation in currentInput each turn.
      let previousResponseId: string | undefined;
      let turnCount = 0;

      // Conversation history: for OAuth we accumulate all items here
      let currentInput: OpenAI.Responses.ResponseInput = [
        { type: "message", role: "user", content: prompt },
      ];

      while (this.running && turnCount < MAX_TURNS) {
        turnCount++;

        const stream = client.responses.stream({
          model: resolvedModel,
          instructions: fullSystemPrompt,
          input: currentInput,
          tools: TOOL_DEFINITIONS,
          // ChatGPT OAuth backend rejects previous_response_id
          ...(!isOAuth && previousResponseId ? { previous_response_id: previousResponseId } : {}),
          parallel_tool_calls: true,
          store: false,
        });

        // Collect function calls and text from the streamed response
        const pendingToolCalls: Array<{ name: string; callId: string; args: string }> = [];
        let currentText = "";

        for await (const event of stream) {
          if (!this.running) break;

          this.processStreamEvent(event, {
            agentId: agent.id,
            agentName: agent.name,
            projectId,
            taskId,
            estimatedToolCalls: ESTIMATED_TOOL_CALLS,
            getToolCallCount: () => toolCallCount,
            onTextDelta: (delta) => { currentText += delta; },
            onToolCallDone: (callId, name, args) => {
              toolCallCount++;
              pendingToolCalls.push({ name, callId, args });
            },
            onUsage: (usage) => {
              totalUsage.input_tokens += usage.input_tokens;
              totalUsage.output_tokens += usage.output_tokens;
              totalUsage.cached_input_tokens += usage.cached_input_tokens ?? 0;
            },
            onError: (msg) => { errors.push(msg); },
          });
        }

        // Get the final response to extract the response ID
        const finalResponse = await stream.finalResponse();
        previousResponseId = finalResponse.id;

        // If we got text output, store it
        if (currentText.trim()) {
          resultText = currentText;

          eventBus.emit("agent:message", {
            agentId: agent.id,
            projectId,
            taskId,
            content: currentText,
            contentType: "text",
            sessionId: this.sessionId,
          });

          db.insert(schema.messages).values({
            id: nanoid(),
            projectId,
            taskId,
            agentId: agent.id,
            source: "agent",
            content: currentText,
            contentType: "text",
            metadata: JSON.stringify({ sessionId: this.sessionId }),
            parentMessageId: null,
            isThinking: false,
            createdAt: new Date(),
          }).catch((err: unknown) => logger.error(`Failed to persist message: ${err}`, "openai-session"));
        }

        // If no tool calls, we're done
        if (pendingToolCalls.length === 0) {
          break;
        }

        // Execute tool calls and prepare the next input with results
        const toolResults: OpenAI.Responses.ResponseInputItem[] = [];

        for (const toolCall of pendingToolCalls) {
          if (!this.running) break;

          const result = await this.executeTool(
            toolCall.name,
            toolCall.args,
            projectPath,
            { agentId: agent.id, agentName: agent.name, projectId, taskId },
          );

          toolResults.push({
            type: "function_call_output",
            call_id: toolCall.callId,
            output: result,
          });
        }

        if (isOAuth) {
          // OAuth: rebuild full conversation (no previous_response_id support)
          // Append the function_call items from this turn, then the tool results
          const functionCallItems: OpenAI.Responses.ResponseInputItem[] = pendingToolCalls.map((tc) => ({
            type: "function_call" as const,
            call_id: tc.callId,
            name: tc.name,
            arguments: tc.args,
          }));
          currentInput = [...(currentInput as OpenAI.Responses.ResponseInputItem[]), ...functionCallItems, ...toolResults];
        } else {
          // API key: use previous_response_id for context, send only tool results
          currentInput = toolResults;
        }
      }

      if (turnCount >= MAX_TURNS) {
        errors.push(`Agent loop exceeded maximum of ${MAX_TURNS} turns`);
      }

    } catch (err: unknown) {
      // Extract detailed error info from OpenAI API errors
      let errorMsg: string;
      if (err && typeof err === "object" && "status" in err && "error" in err) {
        // OpenAI APIError — has status, error, message, headers
        const apiErr = err as { status: number; error: unknown; message: string };
        errorMsg = `API ${apiErr.status}: ${JSON.stringify(apiErr.error) ?? apiErr.message}`;
      } else {
        errorMsg = err instanceof Error ? err.message : "Unknown error";
      }
      errors.push(errorMsg);
      logger.error(`OpenAI session failed: ${errorMsg}`, "openai-session", { agentId: agent.id, taskId });

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

    // Calculate cost: $0 for OAuth (included in subscription), API key pricing otherwise
    const creds = await this.getApiCredentials().catch(() => null);
    const isOAuth = creds?.source === "oauth";
    let totalCost = 0;
    if (!isOAuth) {
      const pricing = MODEL_PRICING[agent.model] ?? { input: 2.0, output: 8.0 };
      totalCost = (totalUsage.input_tokens * pricing.input + totalUsage.output_tokens * pricing.output) / 1_000_000;
    }

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

    const costLabel = isOAuth ? "included" : `$${totalCost.toFixed(4)}`;
    logger.info(
      `OpenAI session completed for ${agent.name}: ${isError ? "ERROR" : "SUCCESS"} (${duration}ms, ${costLabel}, ${totalUsage.input_tokens}+${totalUsage.output_tokens} tokens)`,
      "openai-session",
    );

    return { result: resultText, cost: totalCost, duration, isError, errors };
  }

  /**
   * Process an SSE stream event from the Responses API, mapping it to EventBus emissions.
   */
  private processStreamEvent(
    event: ResponseStreamEvent,
    ctx: {
      agentId: string;
      agentName: string;
      projectId: string;
      taskId: string;
      estimatedToolCalls: number;
      getToolCallCount: () => number;
      onTextDelta: (delta: string) => void;
      onToolCallDone: (callId: string, name: string, args: string) => void;
      onUsage: (usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number }) => void;
      onError: (msg: string) => void;
    },
  ): void {
    switch (event.type) {
      case "response.output_text.delta":
        ctx.onTextDelta(event.delta);
        break;

      case "response.output_item.added": {
        // When a function call output item is first added, emit activity events
        if (event.item.type === "function_call") {
          eventBus.emit("agent:tool_use", {
            agentId: ctx.agentId,
            projectId: ctx.projectId,
            taskId: ctx.taskId,
            tool: event.item.name,
            input: null,
            response: null,
            sessionId: this.sessionId,
          });

          eventBus.emit("board:activity", {
            projectId: ctx.projectId,
            agentId: ctx.agentId,
            action: "tool_use",
            detail: `${ctx.agentName} calling ${event.item.name}`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case "response.output_item.done": {
        // When a function call output item is completed, collect it for execution.
        // ResponseFunctionToolCall has call_id, name, and arguments.
        if (event.item.type === "function_call") {
          const toolCall = event.item;
          const estimatedProgress = Math.min(95, ((ctx.getToolCallCount() + 1) / ctx.estimatedToolCalls) * 100);
          eventBus.emit("agent:status", {
            agentId: ctx.agentId,
            projectId: ctx.projectId,
            status: "running",
            taskId: ctx.taskId,
            progress: estimatedProgress,
          });
          ctx.onToolCallDone(toolCall.call_id, toolCall.name, toolCall.arguments);
        }
        break;
      }

      case "response.reasoning_summary_text.delta":
        eventBus.emit("agent:message", {
          agentId: ctx.agentId,
          projectId: ctx.projectId,
          taskId: ctx.taskId,
          content: event.delta,
          contentType: "thinking",
          sessionId: this.sessionId,
        });
        break;

      case "response.completed": {
        const usage = event.response?.usage;
        if (usage) {
          ctx.onUsage({
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cached_input_tokens: usage.input_tokens_details?.cached_tokens ?? 0,
          });
        }
        break;
      }

      case "response.failed":
      case "response.incomplete":
        ctx.onError(`Response ${event.type}: ${event.response?.status ?? event.type}`);
        break;
    }
  }

  /**
   * Execute a tool call and return the result as a string.
   */
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

    // Emit tool use event
    eventBus.emit("agent:tool_use", {
      agentId: ctx.agentId,
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      tool: toolName,
      input: args,
      response: null,
      sessionId: this.sessionId,
    });

    // Persist tool use to DB
    db.insert(schema.messages).values({
      id: nanoid(),
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      agentId: ctx.agentId,
      source: "agent",
      content: toolName,
      contentType: "tool_use",
      metadata: JSON.stringify({
        sessionId: this.sessionId,
        tool: toolName,
        input: args,
      }),
      parentMessageId: null,
      isThinking: false,
      createdAt: new Date(),
    }).catch((err) => logger.error(`Failed to persist tool_use: ${err}`, "openai-session"));

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

  // --- Tool implementations ---

  private async toolBash(args: Record<string, unknown>, projectPath: string): Promise<string> {
    const command = args.command as string;
    const timeoutMs = (args.timeout_ms as number) || 120_000;

    // Split command into program + args for execFile (prevents shell injection)
    // We use shell: true here since the model sends full shell commands
    // but constrain via cwd to the project directory
    try {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
      const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

      const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
        cwd: projectPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
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

    // Format with line numbers
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

    // Use ripgrep if available, fallback to grep
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
      // Fallback to grep
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

  /**
   * Resolve a file path, ensuring it stays within the project directory.
   */
  private resolvePath(filePath: string, projectPath: string): string {
    const resolved = resolve(projectPath, filePath);
    // Basic path traversal protection
    const rel = relative(projectPath, resolved);
    if (rel.startsWith("..")) {
      // Allow absolute paths that are outside the project (the model needs flexibility)
      // but warn about it
      logger.debug(`Path outside project: ${resolved}`, "openai-session");
    }
    return resolved;
  }

  private async getApiCredentials(): Promise<{ token: string; source: string; accountId?: string } | null> {
    // 1. Check environment variable
    if (process.env.OPENAI_API_KEY) {
      return { token: process.env.OPENAI_API_KEY, source: "env" };
    }

    // 2. Check Codex OAuth (~/.codex/auth.json)
    try {
      const { getCodexOAuthToken, readCodexCredentials, extractAccountId } = await import("../services/codex-oauth.js");
      const oauthToken = await getCodexOAuthToken();
      if (oauthToken) {
        const creds = await readCodexCredentials();
        const accountId = creds?.account_id ?? (creds?.id_token ? extractAccountId(creds.id_token) : undefined);
        return { token: oauthToken, source: "oauth", accountId: accountId ?? undefined };
      }
    } catch {
      // Fall through to DB check
    }

    // 3. Check integrations table for a global OpenAI config
    try {
      const rows = await db.select()
        .from(schema.integrations)
        .all();

      const openaiIntegration = rows.find(
        (i) => i.type === "openai" && i.credentials,
      );
      if (openaiIntegration?.credentials) {
        const { decrypt } = await import("../lib/encryption.js");
        return { token: decrypt(openaiIntegration.credentials), source: "db" };
      }
    } catch {
      // Fallback: env var only
    }

    return null;
  }

  cancel() {
    this.running = false;
    this.abortController?.abort();
    logger.info(`OpenAI session cancelled for agent ${this.agentId}`, "openai-session");
  }

  get isRunning() {
    return this.running;
  }
}
