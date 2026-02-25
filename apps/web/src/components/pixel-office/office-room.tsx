import { useTranslation } from "react-i18next";
import { OfficeDesk } from "./office-desk";
import { OfficeAgent } from "./office-agent";
import { PixelPlant, PixelBookshelf, PixelWaterCooler, PixelWhiteboard } from "./office-furniture";
import type { Task, TaskStatus, Agent } from "@agenthub/shared";
import type { CSSProperties } from "react";

/* ═══ Floor patterns ═══ */

const FLOOR_WOOD_LIGHT: CSSProperties = {
  background: "repeating-linear-gradient(0deg, #C4A882 0px, #C4A882 7px, #B89B71 7px, #B89B71 8px)",
};

const FLOOR_WOOD_MEDIUM: CSSProperties = {
  background: "repeating-linear-gradient(0deg, #B89B71 0px, #B89B71 7px, #A68960 7px, #A68960 8px)",
};

const FLOOR_WOOD_DARK: CSSProperties = {
  background: "repeating-linear-gradient(0deg, #8B7355 0px, #8B7355 7px, #7A6548 7px, #7A6548 8px)",
};

const FLOOR_CARPET_BLUE: CSSProperties = {
  backgroundColor: "#2E3A59",
  backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%)",
  backgroundSize: "8px 8px",
};

const FLOOR_CARPET_PURPLE: CSSProperties = {
  backgroundColor: "#3B2A5C",
  backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%)",
  backgroundSize: "8px 8px",
};

const FLOOR_CARPET_GREEN: CSSProperties = {
  backgroundColor: "#1A3D2E",
  backgroundImage: "repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%)",
  backgroundSize: "8px 8px",
};

const FLOOR_TILE_GRAY: CSSProperties = {
  background: "repeating-conic-gradient(#2D2D2D 0% 25%, #252525 0% 50%)",
  backgroundSize: "14px 14px",
};

const FLOOR_TILE_RED: CSSProperties = {
  background: "repeating-conic-gradient(#3D2020 0% 25%, #301818 0% 50%)",
  backgroundSize: "14px 14px",
};

/* ═══ Room config ═══ */

interface RoomConfig {
  status: TaskStatus;
  labelKey: string;
  floor: CSSProperties;
  accentColor: string;
  signBg: string;
  signText: string;
  decorations: ("plant" | "plant2" | "bookshelf" | "cooler" | "whiteboard")[];
}

export const OFFICE_ROOMS: RoomConfig[] = [
  {
    status: "created",
    labelKey: "taskStatus.backlog",
    floor: FLOOR_WOOD_LIGHT,
    accentColor: "#3B82F6",
    signBg: "#1E3A5F",
    signText: "#93C5FD",
    decorations: ["plant", "bookshelf"],
  },
  {
    status: "assigned",
    labelKey: "taskStatus.assigned",
    floor: FLOOR_WOOD_MEDIUM,
    accentColor: "#6366F1",
    signBg: "#312E81",
    signText: "#A5B4FC",
    decorations: ["plant", "whiteboard"],
  },
  {
    status: "in_progress",
    labelKey: "taskStatus.in_progress",
    floor: FLOOR_CARPET_BLUE,
    accentColor: "#F59E0B",
    signBg: "#78350F",
    signText: "#FCD34D",
    decorations: ["plant", "plant2"],
  },
  {
    status: "blocked",
    labelKey: "pixelOffice.blocked",
    floor: FLOOR_TILE_GRAY,
    accentColor: "#6B7280",
    signBg: "#1F2937",
    signText: "#9CA3AF",
    decorations: ["cooler"],
  },
  {
    status: "review",
    labelKey: "taskStatus.review",
    floor: FLOOR_CARPET_PURPLE,
    accentColor: "#8B5CF6",
    signBg: "#4C1D95",
    signText: "#C4B5FD",
    decorations: ["bookshelf", "plant"],
  },
  {
    status: "changes_requested",
    labelKey: "actions.changes_requested",
    floor: FLOOR_WOOD_DARK,
    accentColor: "#F59E0B",
    signBg: "#78350F",
    signText: "#FCD34D",
    decorations: ["whiteboard"],
  },
  {
    status: "done",
    labelKey: "taskStatus.done",
    floor: FLOOR_CARPET_GREEN,
    accentColor: "#22C55E",
    signBg: "#14532D",
    signText: "#86EFAC",
    decorations: ["plant", "bookshelf", "plant2"],
  },
  {
    status: "cancelled",
    labelKey: "taskStatus.cancelled",
    floor: FLOOR_TILE_GRAY,
    accentColor: "#6B7280",
    signBg: "#1C1917",
    signText: "#9CA3AF",
    decorations: [],
  },
  {
    status: "failed",
    labelKey: "taskStatus.failed",
    floor: FLOOR_TILE_RED,
    accentColor: "#EF4444",
    signBg: "#7F1D1D",
    signText: "#FCA5A5",
    decorations: ["plant"],
  },
];

/* ═══ Component ═══ */

interface OfficeRoomProps {
  config: RoomConfig;
  tasks: Task[];
  agentMap: Map<string, Agent>;
  agentActivity: Map<string, { status: string; taskId?: string; currentTask?: string }>;
  onTaskClick: (task: Task) => void;
}

export function OfficeRoom({ config, tasks, agentMap, agentActivity, onTaskClick }: OfficeRoomProps) {
  const { t } = useTranslation();

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{ ...config.floor, minHeight: 190, imageRendering: "pixelated" }}
    >
      {/* Room sign — pixel door plate */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ background: "rgba(0,0,0,0.55)", borderBottom: "2px solid rgba(0,0,0,0.35)" }}
      >
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
          style={{ background: config.signBg, color: config.signText, border: `1px solid ${config.accentColor}50` }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: config.accentColor }}
          />
          {t(config.labelKey)}
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center text-[9px] font-extrabold"
          style={{ background: config.signBg, color: config.signText }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Room interior */}
      <div className="flex-1 p-2.5 relative">
        {/* Decorative furniture — corners */}
        {config.decorations.length > 0 && (
          <div className="absolute top-2.5 right-2.5 flex flex-col gap-2 items-end">
            {config.decorations.includes("plant") && <PixelPlant variant={0} />}
            {config.decorations.includes("bookshelf") && <PixelBookshelf />}
            {config.decorations.includes("cooler") && <PixelWaterCooler />}
          </div>
        )}
        {config.decorations.includes("plant2") && (
          <div className="absolute bottom-2.5 left-2.5">
            <PixelPlant variant={1} />
          </div>
        )}
        {config.decorations.includes("whiteboard") && (
          <div className="absolute bottom-2.5 right-2.5">
            <PixelWhiteboard />
          </div>
        )}

        {/* Workstations (task desks + agent sprites) */}
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span
              className="text-[9px] font-bold uppercase tracking-wider"
              style={{ color: config.signText, opacity: 0.3 }}
            >
              {t("common.empty")}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 content-start">
            {tasks.slice(0, 6).map((task) => {
              const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
              const activity = task.assignedAgentId ? agentActivity.get(task.assignedAgentId) : null;
              const isWorking = !!(activity && activity.status !== "idle" && activity.taskId === task.id);

              return (
                <div key={task.id} className="flex items-end gap-1.5">
                  {agent && (
                    <OfficeAgent
                      agent={agent}
                      isWorking={isWorking}
                      currentTask={activity?.currentTask}
                    />
                  )}
                  <OfficeDesk task={task} onClick={onTaskClick} />
                </div>
              );
            })}
            {tasks.length > 6 && (
              <span
                className="flex items-center self-center px-2 py-1 text-[9px] font-extrabold"
                style={{ background: "rgba(0,0,0,0.6)", color: config.signText, borderRadius: 2 }}
              >
                +{tasks.length - 6}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
