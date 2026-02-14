import { useState } from "react";
import { CheckCircle2, FileCode, Check, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { TaskRejectDialog } from "../tasks/task-reject-dialog";
import type { Agent, Task } from "@agenthub/shared";

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
  custom: "Custom",
};

interface AgentActivity {
  status: string;
  currentTask?: string;
  currentFile?: string;
  progress?: number;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  idle: { color: "text-text-tertiary", bg: "bg-page", label: "Ocioso" },
  running: { color: "text-green", bg: "bg-green-light", label: "Executando" },
  paused: { color: "text-yellow", bg: "bg-yellow-light", label: "Pausado" },
  error: { color: "text-red", bg: "bg-red-light", label: "Erro" },
};

interface AgentStatusCardProps {
  agent: Agent;
  activity?: AgentActivity;
  task?: Task;
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string, feedback: string) => void;
  onCancel?: (taskId: string) => void;
}

export function AgentStatusCard({ agent, activity, task, onApprove, onReject, onCancel }: AgentStatusCardProps) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const status = activity?.status ?? "idle";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const progress = activity?.progress ?? 0;

  const handleReject = (feedback: string) => {
    if (task && onReject) {
      onReject(task.id, feedback);
      setShowRejectDialog(false);
    }
  };

  return (
    <>
      <div className="rounded-xl bg-white p-5 shadow-card">
        <div className="mb-3 flex items-start justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold text-white"
            style={{ backgroundColor: agent.color ?? "#0866FF" }}
          >
            {agent.name.charAt(0)}
          </div>
          <div className={cn("flex items-center gap-1.5 rounded-md px-2 py-0.5", config.bg)}>
            {status === "running" && (
              <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
            )}
            <span className={cn("text-[11px] font-semibold", config.color)}>
              {config.label}
            </span>
          </div>
        </div>

        <h3 className="text-[13px] font-semibold text-text-primary">{agent.name}</h3>
        <p className="mb-3 text-[11px] text-text-tertiary">
          {ROLE_LABELS[agent.role] ?? agent.role}
        </p>

        {/* Task info */}
        {task && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-page p-2">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[11px] text-text-secondary">
                {task.title}
              </p>
              {status === "running" && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-edge-light">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review actions */}
        {task?.status === "review" && onApprove && onReject && (
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(task.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              Aprovar
            </button>
            <button
              onClick={() => setShowRejectDialog(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
            >
              <X className="h-3.5 w-3.5" />
              Rejeitar
            </button>
          </div>
        )}

        {/* Current file */}
        {activity?.currentFile && (
          <div className="mt-2 flex items-center gap-2">
            <FileCode className="h-3 w-3 text-text-placeholder" />
            <p className="truncate text-[10px] text-text-placeholder">
              {activity.currentFile}
            </p>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && task && (
        <TaskRejectDialog
          task={task}
          onReject={handleReject}
          onClose={() => setShowRejectDialog(false)}
        />
      )}
    </>
  );
}
