import type { Task } from "@agenthub/shared";

const PRIORITY_SCREEN: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#3B82F6",
  low: "#22C55E",
};

interface OfficeDeskProps {
  task: Task;
  onClick: (task: Task) => void;
}

export function OfficeDesk({ task, onClick }: OfficeDeskProps) {
  const screenColor = PRIORITY_SCREEN[task.priority] ?? PRIORITY_SCREEN.medium;

  return (
    <button
      onClick={() => onClick(task)}
      className="flex flex-col items-center cursor-pointer group transition-transform hover:scale-110"
      title={task.title}
      style={{ imageRendering: "pixelated" }}
    >
      {/* Monitor */}
      <div className="relative" style={{ width: 24, height: 15 }}>
        <div
          className="relative"
          style={{ width: 24, height: 12, background: "#1a1a1a", border: "2px solid #333", borderRadius: 1 }}
        >
          <div style={{ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, background: screenColor, opacity: 0.85 }} />
          <div style={{ position: "absolute", top: 2, left: 2, width: 4, height: 3, background: "rgba(255,255,255,0.25)" }} />
        </div>
        {/* Stand */}
        <div style={{ width: 4, height: 1, background: "#444", margin: "0 auto" }} />
        <div style={{ width: 10, height: 2, background: "#555", margin: "0 auto" }} />
      </div>

      {/* Desk surface — wider L-shape style */}
      <div className="relative" style={{ width: 38, height: 9, marginTop: -1 }}>
        <div style={{ width: 38, height: 7, background: "#D4D4D4", border: "2px solid #A3A3A3", borderRadius: 1 }} />
        {/* Keyboard hint */}
        <div style={{ position: "absolute", top: 2, left: 14, width: 10, height: 3, background: "#525252", borderRadius: 1 }} />
      </div>

      {/* Chair */}
      <div className="flex flex-col items-center" style={{ marginTop: 3 }}>
        <div style={{ width: 14, height: 5, background: "#374151", border: "1px solid #1F2937", borderRadius: "3px 3px 0 0" }} />
        <div style={{ width: 10, height: 2, background: "#4B5563" }} />
        {/* Chair legs */}
        <div className="flex justify-between" style={{ width: 10 }}>
          <div style={{ width: 2, height: 2, background: "#374151" }} />
          <div style={{ width: 2, height: 2, background: "#374151" }} />
        </div>
      </div>

      {/* Task label */}
      <span
        className="text-[7px] font-bold text-center leading-none mt-0.5 max-w-[48px] truncate opacity-50 group-hover:opacity-100"
        style={{ color: "#5C4033" }}
      >
        {task.title}
      </span>
    </button>
  );
}
