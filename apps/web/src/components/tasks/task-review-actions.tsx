import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { TaskRejectDialog } from "./task-reject-dialog";
import type { Task } from "@agenthub/shared";

interface TaskReviewActionsProps {
  task: Task;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string, feedback: string) => void;
}

export function TaskReviewActions({ task, onApprove, onReject }: TaskReviewActionsProps) {
  const [showReject, setShowReject] = useState(false);

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApprove(task.id);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success-light px-3 py-1.5 text-[11px] font-semibold text-success transition-all hover:bg-success hover:text-white"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprovar
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReject(true);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-light px-3 py-1.5 text-[11px] font-semibold text-danger transition-all hover:bg-danger hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          Rejeitar
        </button>
      </div>

      {showReject && (
        <TaskRejectDialog
          task={task}
          onReject={(feedback) => {
            onReject(task.id, feedback);
            setShowReject(false);
          }}
          onClose={() => setShowReject(false)}
        />
      )}
    </>
  );
}
