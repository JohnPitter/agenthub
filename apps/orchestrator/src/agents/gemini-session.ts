import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { getAgentPrompt } from "./agent-prompts.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { nanoid } from "nanoid";
import type { AgentRole } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import type { SessionConfig, SessionResult } from "./agent-session.js";
import { execFile } from "child_process";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { dirname, resolve, relative } from "path";
import { promisify } from "util";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

// Gemini pricing per 1M tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3.1-pro-preview": { input: 2.0, output: 12.0 },
  "gemini-3-pro-preview": { input: 2.0, output: 12.0 },
  "gemini-3-flash-preview": { input: 0.50, output: 3.0 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
};

const MAX_TURNS = 50;

// Code Assist API (used for Gemini CLI OAuth — same proxy as the Gemini CLI)
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1internal";

/** Lightweight types for Code Assist API request/response */
interface CAContent {
  role: string;
  parts: CAPart[];
}

interface CAPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: unknown } };
}

interface CAGenerateContentRequest {
  model: string;
  project: string;
  user_prompt_id: string;
  request: {
    contents: CAContent[];
    systemInstruction?: CAContent;
    tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
    generationConfig?: Record<string, unknown>;
  };
}

interface CACandidate {
  content?: { parts?: CAPart[] };
  finishReason?: string;
}

interface CAGenerateContentResponse {
  response?: {
    candidates?: CACandidate[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  // Some responses have candidates at root level
  candidates?: CACandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

// Tool declarations in Gemini format
const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "bash",
    description: "Execute a shell command and return stdout/stderr. Use for running builds, tests, git operations, etc.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: "The shell command to execute" },
        timeout_ms: { type: Type.NUMBER, description: "Optional timeout in ms (default 120000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file at the given absolute path.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        file_path: { type: Type.STRING, description: "Absolute path to the file" },
        offset: { type: Type.NUMBER, description: "Line number to start reading from (1-based)" },
        limit: { type: Type.NUMBER, description: "Maximum number of lines to read" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file, creating parent directories if needed.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        file_path: { type: Type.STRING, description: "Absolute path to the file" },
        content: { type: Type.STRING, description: "The content to write" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace an exact string in a file with a new string. The old_string must be unique in the file.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        file_path: { type: Type.STRING, description: "Absolute path to the file" },
        old_string: { type: Type.STRING, description: "The exact text to find and replace" },
        new_string: { type: Type.STRING, description: "The replacement text" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "list_dir",
    description: "List files and directories at the given path.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dir_path: { type: Type.STRING, description: "Absolute path to the directory" },
      },
      required: ["dir_path"],
    },
  },
  {
    name: "grep",
    description: "Search for a pattern in files. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: { type: Type.STRING, description: "Regex pattern to search for" },
        path: { type: Type.STRING, description: "Directory or file to search in" },
        include: { type: Type.STRING, description: "Glob pattern to filter files (e.g. '*.ts')" },
      },
      required: ["pattern", "path"],
    },
  },
];

interface TokenUsage {
  input: number;
  output: number;
}

export class GeminiSession {
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
    const totalUsage: TokenUsage = { input: 0, output: 0 };

    const systemPrompt = getAgentPrompt(agent.role as AgentRole, agent.systemPrompt, agent.soul);

    let fullSystemPrompt = systemPrompt;
    try {
      const memoriesBlock = await agentMemory.retrieve(agent.id, projectId);
      if (memoriesBlock) {
        fullSystemPrompt = systemPrompt + memoriesBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve memories for agent ${agent.id}: ${err}`, "gemini-session");
    }

    fullSystemPrompt += `\n\nYou are working in the directory: ${projectPath}\nUse absolute paths when calling tools.`;

    logger.info(
      `Starting Gemini session for ${agent.name} on task ${taskId}`,
      "gemini-session",
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
        throw new Error("No Gemini credentials found. Set GEMINI_API_KEY, authenticate via Gemini CLI, or connect via Settings.");
      }

      // Route to the appropriate execution path
      logger.info(
        `Gemini auth: source=${creds.source} (${creds.source === "oauth" ? "Code Assist API — rate limited" : "SDK direct — no rate limit"})`,
        "gemini-session",
      );

      if (creds.source === "oauth") {
        // OAuth: use Code Assist API directly (same proxy as Gemini CLI)
        // WARNING: Free tier has ~1 RPM rate limit — agents will be slow
        const result = await this.executeViaCodeAssist(
          creds.token,
          agent,
          fullSystemPrompt,
          prompt,
          projectId,
          projectPath,
          taskId,
          totalUsage,
          errors,
        );
        resultText = result.resultText;
      } else {
        // API key: use @google/genai SDK directly
        const result = await this.executeViaSdk(
          creds.token,
          agent,
          fullSystemPrompt,
          prompt,
          projectId,
          projectPath,
          taskId,
          totalUsage,
          errors,
        );
        resultText = result.resultText;
      }

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      errors.push(errorMsg);
      logger.error(`Gemini session failed: ${errorMsg}`, "gemini-session", { agentId: agent.id, taskId });

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

    // Calculate cost
    const pricing = MODEL_PRICING[agent.model] ?? { input: 1.25, output: 10.0 };
    const totalCost = (totalUsage.input * pricing.input + totalUsage.output * pricing.output) / 1_000_000;

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
      `Gemini session completed for ${agent.name}: ${isError ? "ERROR" : "SUCCESS"} (${duration}ms, $${totalCost.toFixed(4)}, ${totalUsage.input}+${totalUsage.output} tokens)`,
      "gemini-session",
    );

    return { result: resultText, cost: totalCost, duration, isError, errors };
  }

  // --- Code Assist API execution (OAuth mode — same proxy as Gemini CLI) ---

  private async executeViaCodeAssist(
    accessToken: string,
    agent: SessionConfig["agent"],
    systemPrompt: string,
    prompt: string,
    projectId: string,
    projectPath: string,
    taskId: string,
    totalUsage: TokenUsage,
    errors: string[],
  ): Promise<{ resultText?: string; toolCallCount: number }> {
    // Discover the Code Assist project (cached after first call)
    const { fetchGeminiUsage } = await import("../services/gemini-usage.js");
    const usage = await fetchGeminiUsage();
    const caProject = usage.project;
    if (!caProject) {
      throw new Error("Could not discover Code Assist project. Ensure Gemini CLI is authenticated.");
    }

    logger.info(`Code Assist API: project=${caProject}, model=${agent.model}`, "gemini-session");

    const contents: CAContent[] = [
      { role: "user", parts: [{ text: prompt }] },
    ];

    let resultText: string | undefined;
    let toolCallCount = 0;
    let turnCount = 0;

    while (this.running && turnCount < MAX_TURNS) {
      turnCount++;

      const reqBody: CAGenerateContentRequest = {
        model: agent.model,
        project: caProject,
        user_prompt_id: crypto.randomUUID(),
        request: {
          contents,
          systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          generationConfig: {
            maxOutputTokens: 8192,
          },
        },
      };

      const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:generateContent`;

      // Retry with exponential backoff for rate limits (429)
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(120_000),
        });

        if (res.status !== 429) break;

        const waitSec = Math.min(60, (attempt + 1) * 20); // 20s, 40s, 60s
        logger.warn(`Code Assist rate limited (429), retrying in ${waitSec}s (attempt ${attempt + 1}/3)`, "gemini-session");
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }

      if (!res!.ok) {
        const body = await res!.text().catch(() => "");
        throw new Error(`Code Assist generateContent failed (${res!.status}): ${body.slice(0, 500)}`);
      }

      const data = await res!.json() as CAGenerateContentResponse;

      // Usage metadata — may be at root or nested under response
      const usageMeta = data.response?.usageMetadata ?? data.usageMetadata;
      if (usageMeta) {
        totalUsage.input += usageMeta.promptTokenCount ?? 0;
        totalUsage.output += usageMeta.candidatesTokenCount ?? 0;
      }

      // Candidates — may be at root or nested under response
      const candidates = data.response?.candidates ?? data.candidates ?? [];
      const responseParts = candidates[0]?.content?.parts ?? [];

      const textParts = responseParts.filter((p: CAPart) => !!p.text);
      const functionCalls = responseParts.filter((p: CAPart) => !!p.functionCall);

      // Process text output
      if (textParts.length > 0) {
        const text = textParts.map((p: CAPart) => p.text!).join("");
        resultText = text;

        eventBus.emit("agent:message", {
          agentId: agent.id,
          projectId,
          taskId,
          content: text,
          contentType: "text",
          sessionId: this.sessionId,
        });

        db.insert(schema.messages).values({
          id: nanoid(),
          projectId,
          taskId,
          agentId: agent.id,
          source: "agent",
          content: text,
          contentType: "text",
          metadata: JSON.stringify({ sessionId: this.sessionId }),
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        }).catch((err: unknown) => logger.error(`Failed to persist message: ${err}`, "gemini-session"));
      }

      // If no function calls, we're done
      if (functionCalls.length === 0) break;

      // Add model response to history
      contents.push({ role: "model", parts: responseParts });

      // Execute tools and build function responses
      const functionResponseParts: CAPart[] = [];

      for (const callPart of functionCalls) {
        if (!this.running) break;
        const call = callPart.functionCall!;

        toolCallCount++;

        eventBus.emit("agent:tool_use", {
          agentId: agent.id,
          projectId,
          taskId,
          tool: call.name,
          input: call.args,
          response: null,
          sessionId: this.sessionId,
        });

        eventBus.emit("board:activity", {
          projectId,
          agentId: agent.id,
          action: "tool_use",
          detail: `${agent.name} calling ${call.name}`,
          timestamp: Date.now(),
        });

        db.insert(schema.messages).values({
          id: nanoid(),
          projectId,
          taskId,
          agentId: agent.id,
          source: "agent",
          content: call.name,
          contentType: "tool_use",
          metadata: JSON.stringify({
            sessionId: this.sessionId,
            tool: call.name,
            input: call.args,
          }),
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        }).catch((err: unknown) => logger.error(`Failed to persist tool_use: ${err}`, "gemini-session"));

        const result = await this.executeTool(
          call.name,
          call.args,
          projectPath,
          { agentId: agent.id, agentName: agent.name, projectId, taskId },
        );

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { result },
          },
        });

        const estimatedProgress = Math.min(95, (toolCallCount / 20) * 100);
        eventBus.emit("agent:status", {
          agentId: agent.id,
          projectId,
          status: "running",
          taskId,
          progress: estimatedProgress,
        });
      }

      // Add function responses to conversation
      contents.push({ role: "user", parts: functionResponseParts });
    }

    if (turnCount >= MAX_TURNS) {
      errors.push(`Agent loop exceeded maximum of ${MAX_TURNS} turns`);
    }

    return { resultText, toolCallCount };
  }

  // --- SDK execution (API key mode) ---

  private async executeViaSdk(
    apiKey: string,
    agent: SessionConfig["agent"],
    systemPrompt: string,
    prompt: string,
    projectId: string,
    projectPath: string,
    taskId: string,
    totalUsage: TokenUsage,
    errors: string[],
  ): Promise<{ resultText?: string; toolCallCount: number }> {
    const ai = new GoogleGenAI({ apiKey });

    const contents: Content[] = [
      { role: "user", parts: [{ text: prompt }] },
    ];

    let resultText: string | undefined;
    let toolCallCount = 0;
    let turnCount = 0;

    while (this.running && turnCount < MAX_TURNS) {
      turnCount++;

      const response = await ai.models.generateContent({
        model: agent.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });

      if (response.usageMetadata) {
        totalUsage.input += response.usageMetadata.promptTokenCount ?? 0;
        totalUsage.output += response.usageMetadata.candidatesTokenCount ?? 0;
      }

      const responseParts = response.candidates?.[0]?.content?.parts ?? [];
      const textParts = responseParts.filter((p: Part): p is Part & { text: string } => !!p.text);
      const functionCalls = response.functionCalls;

      if (textParts.length > 0) {
        const text = textParts.map((p: Part & { text: string }) => p.text).join("");
        resultText = text;

        eventBus.emit("agent:message", {
          agentId: agent.id,
          projectId,
          taskId,
          content: text,
          contentType: "text",
          sessionId: this.sessionId,
        });

        db.insert(schema.messages).values({
          id: nanoid(),
          projectId,
          taskId,
          agentId: agent.id,
          source: "agent",
          content: text,
          contentType: "text",
          metadata: JSON.stringify({ sessionId: this.sessionId }),
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        }).catch((err: unknown) => logger.error(`Failed to persist message: ${err}`, "gemini-session"));
      }

      if (!functionCalls?.length) break;

      contents.push({ role: "model", parts: responseParts });

      const functionResponseParts: Part[] = [];

      for (const call of functionCalls) {
        if (!this.running) break;

        toolCallCount++;

        eventBus.emit("agent:tool_use", {
          agentId: agent.id,
          projectId,
          taskId,
          tool: call.name!,
          input: call.args,
          response: null,
          sessionId: this.sessionId,
        });

        eventBus.emit("board:activity", {
          projectId,
          agentId: agent.id,
          action: "tool_use",
          detail: `${agent.name} calling ${call.name}`,
          timestamp: Date.now(),
        });

        db.insert(schema.messages).values({
          id: nanoid(),
          projectId,
          taskId,
          agentId: agent.id,
          source: "agent",
          content: call.name!,
          contentType: "tool_use",
          metadata: JSON.stringify({
            sessionId: this.sessionId,
            tool: call.name,
            input: call.args,
          }),
          parentMessageId: null,
          isThinking: false,
          createdAt: new Date(),
        }).catch((err: unknown) => logger.error(`Failed to persist tool_use: ${err}`, "gemini-session"));

        const result = await this.executeTool(
          call.name!,
          call.args as Record<string, unknown>,
          projectPath,
          { agentId: agent.id, agentName: agent.name, projectId, taskId },
        );

        functionResponseParts.push({
          functionResponse: {
            name: call.name!,
            response: { result },
          },
        });

        const estimatedProgress = Math.min(95, (toolCallCount / 20) * 100);
        eventBus.emit("agent:status", {
          agentId: agent.id,
          projectId,
          status: "running",
          taskId,
          progress: estimatedProgress,
        });
      }

      contents.push({ role: "user", parts: functionResponseParts });
    }

    if (turnCount >= MAX_TURNS) {
      errors.push(`Agent loop exceeded maximum of ${MAX_TURNS} turns`);
    }

    return { resultText, toolCallCount };
  }

  // --- Tool execution ---

  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    projectPath: string,
    ctx: { agentId: string; agentName: string; projectId: string; taskId: string },
  ): Promise<string> {
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
      const e = err as { stdout?: string; stderr?: string; message?: string };
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
      logger.debug(`Path outside project: ${resolved}`, "gemini-session");
    }
    return resolved;
  }

  private async getApiCredentials(): Promise<{
    token: string;
    source: "env" | "oauth" | "db";
  } | null> {
    // 1. Check environment variable (API key — best: no rate limit issues)
    if (process.env.GEMINI_API_KEY) {
      return { token: process.env.GEMINI_API_KEY, source: "env" };
    }

    // 2. Check integrations table for a saved API key (same as env — direct SDK access)
    try {
      const rows = await db.select()
        .from(schema.integrations)
        .all();

      const geminiIntegration = rows.find(
        (i) => i.type === "gemini" && i.credentials,
      );
      if (geminiIntegration?.credentials) {
        const { safeDecrypt } = await import("../lib/encryption.js");
        return { token: safeDecrypt(geminiIntegration.credentials), source: "db" };
      }
    } catch {
      // Fall through
    }

    // 3. Gemini CLI OAuth (~/.gemini/oauth_creds.json) — fallback with rate limits
    try {
      const { getGeminiOAuthToken } = await import("../services/gemini-oauth.js");
      const oauthToken = await getGeminiOAuthToken();
      if (oauthToken) {
        return { token: oauthToken, source: "oauth" };
      }
    } catch {
      // Fall through
    }

    return null;
  }

  cancel() {
    this.running = false;
    this.abortController?.abort();
    logger.info(`Gemini session cancelled for agent ${this.agentId}`, "gemini-session");
  }

  get isRunning() {
    return this.running;
  }
}
