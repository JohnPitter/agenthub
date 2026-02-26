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
      className="flex flex-col items-center cursor-pointer group transition-transform hover:-translate-y-1 relative"
      title={task.title}
      style={{ imageRendering: "pixelated", filter: "drop-shadow(0 6px 0 rgba(0,0,0,0.15))" }}
    >
      {/* Floating Task Label Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
        <div className="bg-gray-900 border-2 border-gray-700 text-white text-[9px] font-bold px-2 py-1.5 rounded" style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.3)" }}>
          {task.title}
          {/* Tooltip Arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-t-gray-700 border-l-transparent border-r-transparent" />
        </div>
      </div>

      {/* Monitor Stand */}
      <div className="absolute z-0" style={{ bottom: 18, width: 6, height: 4, background: "#4B5563", border: "2px solid #1F2937" }} />

      {/* Monitor Display */}
      <div className="relative z-10" style={{ width: 24, height: 16, background: "#1F2937", border: "2px solid #030712", borderRadius: 2, marginBottom: -2 }}>
        <div style={{ position: "absolute", inset: 1, border: "1px solid #374151", background: screenColor, boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.2), inset -2px -2px 0 rgba(0,0,0,0.2)" }}>
          {/* Code lines pseudo */}
          <div style={{ width: "60%", height: 1, background: "rgba(255,255,255,0.5)", margin: "2px 0 1px 2px" }} />
          <div style={{ width: "40%", height: 1, background: "rgba(255,255,255,0.5)", margin: "1px 0 1px 2px" }} />
          <div style={{ width: "80%", height: 1, background: "rgba(255,255,255,0.5)", margin: "1px 0 1px 2px" }} />
        </div>
      </div>

      {/* Desk Top Edge (Depth) */}
      <div className="relative z-10" style={{ width: 44, height: 6, background: "#FDE047", border: "2px solid #713F12", borderBottom: "none", transform: "skewX(-10deg)", marginLeft: 2 }} />

      {/* Desk Front Face */}
      <div className="relative z-20 flex flex-col items-center" style={{ width: 44, height: 14, background: "#EAB308", border: "2px solid #713F12", borderRadius: "1px 1px 2px 2px", boxShadow: "inset -2px -2px 0 #CA8A04" }}>
        {/* Keyboard */}
        <div style={{ position: "absolute", top: -4, left: 10, width: 16, height: 4, background: "#E5E7EB", border: "1px solid #4B5563", borderRadius: 1 }} />
        {/* Mouse */}
        <div style={{ position: "absolute", top: -3, left: 28, width: 4, height: 3, background: "#E5E7EB", border: "1px solid #4B5563", borderRadius: "2px 2px 1px 1px" }} />

        {/* Desk Drawers */}
        <div style={{ position: "absolute", right: 2, top: 2, width: 10, height: 4, border: "1px solid #CA8A04", borderBottomColor: "#FDE047", borderRadius: 1 }} />
        <div style={{ position: "absolute", right: 2, top: 7, width: 10, height: 4, border: "1px solid #CA8A04", borderBottomColor: "#FDE047", borderRadius: 1 }} />
      </div>

      {/* Chair */}
      <div className="relative z-30 flex flex-col items-center" style={{ marginTop: -4 }}>
        {/* Backrest */}
        <div style={{ width: 14, height: 10, background: "#3B82F6", border: "2px solid #1E3A8A", borderRadius: "4px 4px 0 0", boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.2)" }} />
        {/* Seat */}
        <div style={{ width: 16, height: 4, background: "#2563EB", border: "2px solid #1E3A8A", borderRadius: 2, marginTop: -2, zIndex: 1, boxShadow: "inset 0 -2px 0 #1D4ED8" }} />
        {/* Base pole */}
        <div style={{ width: 4, height: 4, background: "#4B5563", borderLeft: "2px solid #1F2937", borderRight: "2px solid #1F2937" }} />
        {/* Legs */}
        <div className="flex justify-between" style={{ width: 16 }}>
          <div style={{ width: 6, height: 2, background: "#1F2937", transform: "rotate(15deg)", transformOrigin: "top right" }} />
          <div style={{ width: 6, height: 2, background: "#1F2937", transform: "rotate(-15deg)", transformOrigin: "top left" }} />
        </div>
      </div>
    </button>
  );
}
