import { query } from "@anthropic-ai/claude-agent-sdk";
import { getAgentPrompt } from "./agent-prompts";
import { eventBus } from "../realtime/event-bus";
import { logTaskAction } from "../tasks/task-lifecycle";
import { logger } from "../lib/logger";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Agent, AgentRole } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";

export interface SessionConfig {
  agent: Agent;
  projectId: string;
  projectPath: string;
  taskId: string;
  prompt: string;
}

export interface SessionResult {
  result?: string;
  cost: number;
  duration: number;
  isError: boolean;
  errors: string[];
}

export class AgentSession {
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
    let toolCallCount = 0;
    const ESTIMATED_TOOL_CALLS = 20; // Rough estimate for progress calculation

    const parsedTools: string[] = typeof agent.allowedTools === "string"
      ? JSON.parse(agent.allowedTools)
      : agent.allowedTools ?? [];

    const systemPrompt = getAgentPrompt(agent.role as AgentRole, agent.systemPrompt, agent.soul);

    // Inject agent memories into system prompt
    let fullSystemPrompt = systemPrompt;
    try {
      const memoriesBlock = await agentMemory.retrieve(agent.id, projectId);
      if (memoriesBlock) {
        fullSystemPrompt = systemPrompt + memoriesBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve memories for agent ${agent.id}: ${err}`, "agent-session");
    }

    // Inject agent skills into system prompt
    try {
      const assignedSkills = await db
        .select({
          name: schema.skills.name,
          instructions: schema.skills.instructions,
        })
        .from(schema.agentSkills)
        .innerJoin(schema.skills, eq(schema.agentSkills.skillId, schema.skills.id))
        .where(
          and(
            eq(schema.agentSkills.agentId, agent.id),
            eq(schema.skills.isActive, true),
          ),
        );

      if (assignedSkills.length > 0) {
        const skillsBlock =
          "\n\n# Skills\n\n" +
          assignedSkills.map((s) => `## ${s.name}\n${s.instructions}`).join("\n\n");
        fullSystemPrompt += skillsBlock;
      }
    } catch (err) {
      logger.warn(`Failed to retrieve skills for agent ${agent.id}: ${err}`, "agent-session");
    }

    logger.info(
      `Starting session for ${agent.name} on task ${taskId}`,
      "agent-session",
      { model: agent.model, projectPath },
    );

    eventBus.emit("agent:status", {
      agentId: agent.id,
      projectId,
      status: "running",
      taskId,
    });

    try {
      const conversation = query({
        prompt,
        options: {
          model: agent.model,
          systemPrompt: fullSystemPrompt,
          allowedTools: parsedTools,
          cwd: projectPath,
          permissionMode: agent.permissionMode === "bypassPermissions" ? "bypassPermissions" : "acceptEdits",
          maxThinkingTokens: agent.maxThinkingTokens ?? undefined,
          abortController: this.abortController,
        },
      });

      for await (const message of conversation) {
        if (!this.running) break;

        // Stream events to the frontend
        eventBus.emit("agent:stream", {
          agentId: agent.id,
          projectId,
          event: message,
          sessionId: this.sessionId,
        });

        if (message.type === "assistant") {
          const textContent = message.message?.content
            ?.filter((block) => block.type === "text")
            .map((block) => "text" in block ? block.text : "")
            .join("\n");

          if (textContent) {
            eventBus.emit("agent:message", {
              agentId: agent.id,
              projectId,
              taskId,
              content: textContent,
              contentType: "text",
              sessionId: this.sessionId,
            });

            // Persist to database
            db.insert(schema.messages).values({
              id: nanoid(),
              projectId,
              taskId,
              agentId: agent.id,
              source: "agent",
              content: textContent,
              contentType: "text",
              metadata: JSON.stringify({ sessionId: this.sessionId }),
              parentMessageId: null,
              isThinking: false,
              createdAt: new Date(),
            }).catch((err) => logger.error(`Failed to persist message: ${err}`, "agent-session"));
          }

          // Check for tool use
          const toolBlocks = message.message?.content?.filter(
            (block: { type: string }) => block.type === "tool_use",
          );
          if (toolBlocks?.length) {
            for (const tool of toolBlocks) {
              toolCallCount++;
              const estimatedProgress = Math.min(95, (toolCallCount / ESTIMATED_TOOL_CALLS) * 100);

              eventBus.emit("agent:tool_use", {
                agentId: agent.id,
                projectId,
                taskId,
                tool: (tool as { name: string }).name,
                input: (tool as { input: unknown }).input,
                response: null,
                sessionId: this.sessionId,
              });

              // Emit progress update
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
                detail: `${agent.name} using ${(tool as { name: string }).name}`,
                timestamp: Date.now(),
              });

              // Emit cursor position for file-related tools
              const toolName = (tool as { name: string }).name;
              const toolInput = (tool as { input: unknown }).input as Record<string, unknown>;
              const filePath = toolInput?.file_path as string | undefined;
              if (filePath && ["Read", "Write", "Edit", "NotebookEdit"].includes(toolName)) {
                eventBus.emit("board:agent_cursor", {
                  projectId,
                  agentId: agent.id,
                  filePath,
                  action: toolName,
                });
              }

              // Log tool_use to task_logs for activity feed
              logTaskAction(taskId, "tool_use", agent.id, `Tool: ${toolName}`).catch(() => {});

              // Persist tool use to database
              db.insert(schema.messages).values({
                id: nanoid(),
                projectId,
                taskId,
                agentId: agent.id,
                source: "agent",
                content: `${(tool as { name: string }).name}`,
                contentType: "tool_use",
                metadata: JSON.stringify({
                  sessionId: this.sessionId,
                  tool: (tool as { name: string }).name,
                  input: (tool as { input: unknown }).input,
                }),
                parentMessageId: null,
                isThinking: false,
                createdAt: new Date(),
              }).catch((err) => logger.error(`Failed to persist tool_use: ${err}`, "agent-session"));
            }
          }
        }

        if (message.type === "result") {
          totalCost = message.total_cost_usd ?? 0;

          if (message.subtype === "success") {
            resultText = message.result;
          } else {
            errors.push(...(message.errors ?? ["Unknown error"]));
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      errors.push(errorMsg);
      logger.error(`Agent session failed: ${errorMsg}`, "agent-session", { agentId: agent.id, taskId });

      // Persist error to database
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
      `Session completed for ${agent.name}: ${isError ? "ERROR" : "SUCCESS"} (${duration}ms, $${totalCost.toFixed(4)})`,
      "agent-session",
    );

    return { result: resultText, cost: totalCost, duration, isError, errors };
  }

  cancel() {
    this.running = false;
    this.abortController?.abort();
    logger.info(`Session cancelled for agent ${this.agentId}`, "agent-session");
  }

  get isRunning() {
    return this.running;
  }
}
