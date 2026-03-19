import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, X, Send, ExternalLink, Loader2 } from "lucide-react";
import { TaskRejectDialog } from "./task-reject-dialog";
import { api } from "../../lib/utils";
import type { Task } from "@agenthub/shared";

interface TaskReviewActionsProps {
  task: Task;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string, feedback: string) => void;
}

export function TaskReviewActions({ task, onApprove, onReject }: TaskReviewActionsProps) {
  const { t } = useTranslation();
  const [showReject, setShowReject] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setSending(true);
    try {
      await api("/messages", {
        method: "POST",
        body: JSON.stringify({
          projectId: task.projectId,
          taskId: task.id,
          content: feedback,
          source: "user",
          contentType: "text",
        }),
      });
      setFeedback("");
    } catch {
      // Silently fail — user can retry
    }
    setSending(false);
  };

  const handleOpenPreview = () => {
    window.open(`/project/${task.projectId}/preview`, "_blank");
  };

  return (
    <>
      {/* Feedback textarea */}
      <div className="mt-3 mb-2">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t("tasks.sendFeedbackPlaceholder", "Envie uma mensagem para o Tech Lead...")}
          className="w-full rounded-lg border border-stroke bg-neutral-bg2 px-3 py-2 text-[12px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20 min-h-[64px] resize-none"
          rows={2}
        />
        <div className="flex items-center justify-between mt-1.5">
          <button
            onClick={handleOpenPreview}
            className="flex items-center gap-1 text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {t("tasks.viewPreview", "Ver Preview")}
          </button>
          <button
            onClick={handleSendFeedback}
            disabled={!feedback.trim() || sending}
            className="flex items-center gap-1 rounded-md bg-neutral-bg3 px-2.5 py-1 text-[11px] font-semibold text-neutral-fg2 transition-all hover:bg-neutral-bg-hover disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {t("tasks.sendFeedback", "Enviar")}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApprove(task.id);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success-light px-3 py-1.5 text-[11px] font-semibold text-success transition-all hover:bg-success hover:text-white"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("tasks.approve")}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReject(true);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-light px-3 py-1.5 text-[11px] font-semibold text-danger transition-all hover:bg-danger hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          {t("tasks.reject")}
        </button>
      </div>

      {showReject && (
        <TaskRejectDialog
          task={task}
          onReject={(rejectFeedback) => {
            onReject(task.id, rejectFeedback);
            setShowReject(false);
          }}
          onClose={() => setShowReject(false)}
        />
      )}
    </>
  );
}
