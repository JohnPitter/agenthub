import { db, schema } from "@agenthub/database";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TASK_TRANSITIONS } from "@agenthub/shared";
import type { TaskStatus } from "@agenthub/shared";
import { transitionTask } from "../tasks/task-lifecycle.js";
import { agentManager } from "../agents/agent-manager.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";

const MAX_MSG_LENGTH = 4000;

const STATUS_EMOJI: Record<string, string> = {
  created: "\u{1F4CB}",       // clipboard
  assigned: "\u{1F4CC}",      // pushpin
  in_progress: "\u{1F504}",   // arrows
  review: "\u{1F440}",        // eyes
  changes_requested: "\u{1F4DD}", // memo
  done: "\u{2705}",           // check mark
  cancelled: "\u{274C}",      // cross mark
  blocked: "\u{1F6A7}",       // construction
  failed: "\u{1F4A5}",        // collision
};

const PRIORITY_EMOJI: Record<string, string> = {
  urgent: "\u{1F534}", // red circle
  high: "\u{1F7E0}",   // orange circle
  medium: "\u{1F7E1}", // yellow circle
  low: "\u{26AA}",     // white circle
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function truncateMessage(msg: string): string {
  if (msg.length <= MAX_MSG_LENGTH) return msg;
  return msg.slice(0, MAX_MSG_LENGTH - 60) + "\n\n_... (truncado, veja o painel web)_";
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "N/A";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ─── Public Functions ────────────────────────────────────────────────

/**
 * Lista projetos disponíveis.
 */
export async function listProjects(): Promise<string> {
  try {
    const projects = await db.select({
      id: schema.projects.id,
      name: schema.projects.name,
      description: schema.projects.description,
    }).from(schema.projects).all();

    if (projects.length === 0) {
      return "\u{1F4C1} Nenhum projeto encontrado.";
    }

    let msg = `\u{1F4C1} *Projetos disponíveis* (${projects.length})\n\n`;
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      msg += `*${i + 1}.* ${p.name}\n`;
      msg += `   ID: \`${p.id}\`\n`;
      if (p.description) msg += `   _${truncate(p.description, 80)}_\n`;
      msg += "\n";
    }
    msg += "Para criar uma task, me diga o número ou nome do projeto.";

    return truncateMessage(msg);
  } catch (error) {
    logger.error(`whatsapp-ops listProjects error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao listar projetos. Tente novamente.";
  }
}

/**
 * Lista tasks de um projeto, agrupadas por status.
 */
export async function listTasks(projectId: string, statusFilter?: string): Promise<string> {
  try {
    const project = await db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();

    const conditions = [eq(schema.tasks.projectId, projectId)];
    if (statusFilter) {
      // Cast is safe — invalid status will simply match zero rows
      conditions.push(eq(schema.tasks.status, statusFilter as "created"));
    }

    const allTasks = await db.select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      status: schema.tasks.status,
      priority: schema.tasks.priority,
      assignedAgentId: schema.tasks.assignedAgentId,
    }).from(schema.tasks)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(schema.tasks.updatedAt))
      .all();

    if (allTasks.length === 0) {
      const filter = statusFilter ? ` com status *${statusFilter}*` : "";
      return `\u{1F4CB} *${project?.name || "Projeto"}*\n\nNenhuma task encontrada${filter}.`;
    }

    // Build agent name map using Set for O(1) lookups
    const agentIds = new Set(
      allTasks.map((t) => t.assignedAgentId).filter(Boolean) as string[],
    );
    const agentsMap = new Map<string, string>();
    if (agentIds.size > 0) {
      const agentRows = await db
        .select({ id: schema.agents.id, name: schema.agents.name })
        .from(schema.agents)
        .all();
      for (const a of agentRows) {
        if (agentIds.has(a.id)) agentsMap.set(a.id, a.name);
      }
    }

    // Group tasks by status
    const grouped = new Map<string, typeof allTasks>();
    for (const task of allTasks) {
      const list = grouped.get(task.status) ?? [];
      list.push(task);
      grouped.set(task.status, list);
    }

    // Render order
    const statusOrder = [
      "in_progress", "review", "changes_requested", "assigned",
      "created", "blocked", "failed", "done", "cancelled",
    ];

    let msg = `\u{1F4CA} *${project?.name || "Projeto"}* \u{2014} Tasks (${allTasks.length})\n`;

    for (const status of statusOrder) {
      const tasks = grouped.get(status);
      if (!tasks || tasks.length === 0) continue;

      const emoji = STATUS_EMOJI[status] || "\u{25AA}";
      msg += `\n${emoji} *${status}* (${tasks.length}):\n`;

      for (const t of tasks.slice(0, 10)) {
        const pEmoji = PRIORITY_EMOJI[t.priority] || "";
        const agent = t.assignedAgentId ? agentsMap.get(t.assignedAgentId) : null;
        const agentSuffix = agent ? ` \u{2192} _${agent}_` : "";
        msg += `${pEmoji} \u{2022} ${truncate(t.title, 60)}${agentSuffix}\n`;
        msg += `  \`${t.id.slice(0, 8)}\`\n`;
      }

      if (tasks.length > 10) {
        msg += `  _... e mais ${tasks.length - 10}_\n`;
      }
    }

    return truncateMessage(msg);
  } catch (error) {
    logger.error(`whatsapp-ops listTasks error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao listar tasks. Tente novamente.";
  }
}

/**
 * Detalhe de uma task por ID.
 */
export async function getTaskDetail(taskId: string): Promise<string> {
  try {
    const task = await db.select().from(schema.tasks)
      .where(eq(schema.tasks.id, taskId)).get();

    if (!task) {
      return `\u{274C} Task \`${taskId}\` nao encontrada.`;
    }

    let agentName = "Nenhum";
    if (task.assignedAgentId) {
      const agent = await db.select({ name: schema.agents.name })
        .from(schema.agents)
        .where(eq(schema.agents.id, task.assignedAgentId))
        .get();
      if (agent) agentName = agent.name;
    }

    const emoji = STATUS_EMOJI[task.status] || "\u{25AA}";
    const pEmoji = PRIORITY_EMOJI[task.priority] || "";

    let msg = `\u{1F4C4} *Task:* ${task.title}\n\n`;
    msg += `\u{1F194} *ID:* \`${task.id}\`\n`;
    msg += `${emoji} *Status:* ${task.status}\n`;
    msg += `${pEmoji} *Prioridade:* ${task.priority}\n`;
    msg += `\u{1F916} *Agente:* ${agentName}\n`;

    if (task.category) {
      msg += `\u{1F3F7} *Categoria:* ${task.category}\n`;
    }
    if (task.branch) {
      msg += `\u{1F33F} *Branch:* \`${task.branch}\`\n`;
    }

    if (task.description) {
      msg += `\n\u{1F4DD} *Descricao:*\n${truncate(task.description, 500)}\n`;
    }

    if (task.result) {
      msg += `\n\u{1F4AC} *Resultado:*\n${truncate(task.result, 800)}\n`;
    }

    msg += `\n\u{1F552} *Criada:* ${formatDate(task.createdAt)}\n`;
    msg += `\u{1F504} *Atualizada:* ${formatDate(task.updatedAt)}\n`;
    if (task.completedAt) {
      msg += `\u{2705} *Concluida:* ${formatDate(task.completedAt)}\n`;
    }

    if (task.costUsd) {
      msg += `\u{1F4B0} *Custo:* $${task.costUsd}\n`;
    }

    return truncateMessage(msg);
  } catch (error) {
    logger.error(`whatsapp-ops getTaskDetail error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao buscar detalhes da task. Tente novamente.";
  }
}

/**
 * Cria uma nova task.
 */
export async function createTask(
  projectId: string,
  title: string,
  description?: string,
  priority?: string,
): Promise<string> {
  try {
    // Validate project exists
    const project = await db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();

    if (!project) {
      return `\u{274C} Projeto \`${projectId}\` nao encontrado.`;
    }

    const validPriorities = ["low", "medium", "high", "urgent"] as const;
    type ValidPriority = (typeof validPriorities)[number];
    const taskPriority: ValidPriority =
      priority && (validPriorities as readonly string[]).includes(priority)
        ? (priority as ValidPriority)
        : "medium";

    const taskId = nanoid();
    const now = new Date();

    await db.insert(schema.tasks).values({
      id: taskId,
      projectId,
      title,
      description: description ?? null,
      priority: taskPriority,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    eventBus.emit("task:created", {
      task: { id: taskId, projectId, title, status: "created", priority: taskPriority },
    });

    logger.info(`Task created via WhatsApp ops: ${taskId}`, "whatsapp-ops");

    const pEmoji = PRIORITY_EMOJI[taskPriority] || "";
    return (
      `\u{2705} *Task criada com sucesso!*\n\n` +
      `\u{1F4CB} *Titulo:* ${title}\n` +
      `\u{1F194} *ID:* \`${taskId}\`\n` +
      `${pEmoji} *Prioridade:* ${taskPriority}\n` +
      `\u{1F4CA} *Status:* created\n` +
      (description ? `\u{1F4DD} *Descricao:* ${truncate(description, 200)}\n` : "")
    );
  } catch (error) {
    logger.error(`whatsapp-ops createTask error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao criar task. Tente novamente.";
  }
}

/**
 * Avanca status de uma task.
 */
export async function advanceTaskStatus(taskId: string, newStatus: string): Promise<string> {
  try {
    const task = await db.select().from(schema.tasks)
      .where(eq(schema.tasks.id, taskId)).get();

    if (!task) {
      return `\u{274C} Task \`${taskId}\` nao encontrada.`;
    }

    const currentStatus = task.status as TaskStatus;
    const targetStatus = newStatus as TaskStatus;

    // Validate the target status is known
    const allowedTransitions = TASK_TRANSITIONS[currentStatus];
    if (!allowedTransitions) {
      return `\u{274C} Status atual \`${currentStatus}\` nao reconhecido.`;
    }

    if (!allowedTransitions.includes(targetStatus)) {
      const options = allowedTransitions.length > 0
        ? allowedTransitions.map((s) => `\`${s}\``).join(", ")
        : "nenhuma (status terminal)";
      return (
        `\u{26A0} Transicao invalida: *${currentStatus}* \u{2192} *${newStatus}*\n\n` +
        `Transicoes permitidas de *${currentStatus}*:\n${options}`
      );
    }

    const success = await transitionTask(taskId, targetStatus, undefined, "Via WhatsApp ops");

    if (success) {
      const fromEmoji = STATUS_EMOJI[currentStatus] || "";
      const toEmoji = STATUS_EMOJI[targetStatus] || "";
      return (
        `\u{2705} *Task atualizada!*\n\n` +
        `\u{1F4CB} ${truncate(task.title, 60)}\n` +
        `${fromEmoji} ${currentStatus} \u{2192} ${toEmoji} ${targetStatus}`
      );
    }

    return `\u{274C} Falha ao atualizar status da task. Verifique os logs.`;
  } catch (error) {
    logger.error(`whatsapp-ops advanceTaskStatus error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao atualizar status. Tente novamente.";
  }
}

/**
 * Lista agentes e seus status (idle/running).
 */
export async function listAgents(): Promise<string> {
  try {
    const agents = await db.select().from(schema.agents)
      .where(eq(schema.agents.isActive, true))
      .all();

    if (agents.length === 0) {
      return "\u{1F916} Nenhum agente ativo encontrado.";
    }

    let msg = `\u{1F916} *Agentes Ativos* (${agents.length})\n\n`;

    for (const agent of agents) {
      const status = agentManager.getAgentStatus(agent.id);
      const statusIcon = status === "running" ? "\u{1F7E2}" : "\u{26AA}"; // green circle : white circle
      const activeTask = agentManager.getActiveTaskForAgent(agent.id);
      const queueLen = agentManager.getQueueLength(agent.id);

      msg += `${statusIcon} *${agent.name}*\n`;
      msg += `   _${agent.role}_ | ${agent.model}\n`;
      msg += `   Status: *${status}*`;
      if (activeTask) {
        msg += ` | Task: \`${activeTask.slice(0, 8)}\``;
      }
      if (queueLen > 0) {
        msg += ` | Fila: ${queueLen}`;
      }
      msg += "\n\n";
    }

    return truncateMessage(msg);
  } catch (error) {
    logger.error(`whatsapp-ops listAgents error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao listar agentes. Tente novamente.";
  }
}

/**
 * Overview do projeto (nome, stats, tasks por status).
 */
export async function getProjectOverview(projectId: string): Promise<string> {
  try {
    const project = await db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();

    if (!project) {
      return `\u{274C} Projeto \`${projectId}\` nao encontrado.`;
    }

    const allTasks = await db.select({
      status: schema.tasks.status,
      priority: schema.tasks.priority,
    }).from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .all();

    // Count by status using Map for O(n)
    const statusCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();
    for (const t of allTasks) {
      statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1);
      priorityCounts.set(t.priority, (priorityCounts.get(t.priority) ?? 0) + 1);
    }

    let msg = `\u{1F4CA} *${project.name}*\n`;
    if (project.description) {
      msg += `_${truncate(project.description, 100)}_\n`;
    }
    msg += `\n\u{1F4C1} *Path:* \`${project.path}\`\n`;
    msg += `\u{1F4C8} *Total de tasks:* ${allTasks.length}\n\n`;

    // Status breakdown
    const statusOrder = [
      "in_progress", "review", "changes_requested", "assigned",
      "created", "blocked", "failed", "done", "cancelled",
    ];

    msg += `*Tasks por status:*\n`;
    for (const status of statusOrder) {
      const count = statusCounts.get(status);
      if (!count) continue;
      const emoji = STATUS_EMOJI[status] || "\u{25AA}";
      msg += `${emoji} ${status}: *${count}*\n`;
    }

    // Priority breakdown
    if (allTasks.length > 0) {
      msg += `\n*Tasks por prioridade:*\n`;
      for (const p of ["urgent", "high", "medium", "low"]) {
        const count = priorityCounts.get(p);
        if (!count) continue;
        const emoji = PRIORITY_EMOJI[p] || "";
        msg += `${emoji} ${p}: *${count}*\n`;
      }
    }

    // Active agents on this project
    const activeSessions = agentManager.getActiveSessions()
      .filter((s) => s.projectId === projectId);

    if (activeSessions.length > 0) {
      msg += `\n\u{1F916} *Agentes trabalhando:* ${activeSessions.length}\n`;
      for (const s of activeSessions) {
        const agent = await db.select({ name: schema.agents.name })
          .from(schema.agents)
          .where(eq(schema.agents.id, s.agentId))
          .get();
        if (agent) {
          msg += `  \u{1F7E2} ${agent.name} \u{2192} \`${s.taskId.slice(0, 8)}\`\n`;
        }
      }
    }

    return truncateMessage(msg);
  } catch (error) {
    logger.error(`whatsapp-ops getProjectOverview error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao buscar overview do projeto. Tente novamente.";
  }
}

/**
 * Atribui uma task a um agente (dispara o workflow).
 */
export async function assignTaskToAgent(taskId: string, agentName?: string): Promise<string> {
  try {
    const task = await db.select().from(schema.tasks)
      .where(eq(schema.tasks.id, taskId)).get();

    if (!task) {
      return `\u{274C} Task \`${taskId}\` nao encontrada.`;
    }

    // If no agent name given, auto-assign
    if (!agentName) {
      await agentManager.autoAssignTask(taskId);
      return (
        `\u{2705} *Task atribuida automaticamente!*\n\n` +
        `\u{1F4CB} ${truncate(task.title, 60)}\n` +
        `O sistema escolheu o melhor agente disponivel.`
      );
    }

    // Find agent by name (case-insensitive)
    const agents = await db.select().from(schema.agents)
      .where(eq(schema.agents.isActive, true))
      .all();

    const lowerName = agentName.toLowerCase();
    const agent = agents.find((a) => a.name.toLowerCase() === lowerName);

    if (!agent) {
      const available = agents.map((a) => `\u{2022} ${a.name} (_${a.role}_)`).join("\n");
      return (
        `\u{274C} Agente *${agentName}* nao encontrado.\n\n` +
        `*Agentes disponiveis:*\n${available}`
      );
    }

    const isBusy = agentManager.isAgentBusy(agent.id);

    await agentManager.assignTask(taskId, agent.id);

    let msg =
      `\u{2705} *Task atribuida!*\n\n` +
      `\u{1F4CB} ${truncate(task.title, 60)}\n` +
      `\u{1F916} *Agente:* ${agent.name} (_${agent.role}_)\n`;

    if (isBusy) {
      const queueLen = agentManager.getQueueLength(agent.id);
      msg += `\n\u{26A0} ${agent.name} esta ocupado. Task adicionada a fila (posicao ${queueLen}).`;
    }

    return msg;
  } catch (error) {
    logger.error(`whatsapp-ops assignTaskToAgent error: ${error}`, "whatsapp-ops");
    return "\u{274C} Erro ao atribuir task. Tente novamente.";
  }
}
