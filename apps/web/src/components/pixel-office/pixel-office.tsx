import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { OfficeAgent } from "./office-agent";
import { OfficeDesk } from "./office-desk";
import {
  PixelPlant, PixelBookshelf, PixelWaterCooler, PixelWhiteboard,
  PixelTree, PixelSofa, PixelWallArt, PixelCoffeeMachine,
} from "./office-furniture";
import type { Task, TaskStatus, Agent } from "@agenthub/shared";
import type { CSSProperties } from "react";

/* ═══ Map dimensions ═══ */

const MAP_W = 1280;
const MAP_H = 840;

/* ═══ Building ═══ */

const BLDG = { x: 66, y: 46, w: 1148, h: 748 };
const WALL = 6;

/* ═══ Room grid ═══ */

const ROOM_W = 348;
const ROOM_H = 216;
const CORRIDOR = 24;
const WALL_HEADER = 14;

const COL = [22, 22 + ROOM_W + CORRIDOR, 22 + (ROOM_W + CORRIDOR) * 2];
const ROW = [20, 20 + ROOM_H + CORRIDOR, 20 + (ROOM_H + CORRIDOR) * 2];

/* ═══ Zone definitions ═══ */

interface ZoneDef {
  status: TaskStatus;
  labelKey: string;
  floor: CSSProperties;
  wallColor: string;
  wallDark: string;
  accentColor: string;
  signBg: string;
  signText: string;
  rx: number;
  ry: number;
  furniture: { type: string; dx: number; dy: number }[];
}

const ZONES: ZoneDef[] = [
  /* Row 0 — pipeline */
  {
    status: "created", labelKey: "taskStatus.backlog",
    floor: { background: "repeating-linear-gradient(0deg,#E8D5B8 0px,#E8D5B8 7px,#DCC9A3 7px,#DCC9A3 8px)" },
    wallColor: "#C9B896", wallDark: "#A89570",
    accentColor: "#3B82F6", signBg: "#1E3A5F", signText: "#93C5FD",
    rx: COL[0], ry: ROW[0],
    furniture: [
      { type: "bookshelf", dx: 308, dy: 42 },
      { type: "plant", dx: 316, dy: 130 },
      { type: "wallart", dx: 310, dy: 80 },
    ],
  },
  {
    status: "assigned", labelKey: "taskStatus.assigned",
    floor: { background: "repeating-conic-gradient(#D8D8E8 0% 25%,#CECED8 0% 50%)", backgroundSize: "12px 12px" },
    wallColor: "#B0A0D0", wallDark: "#8B78B0",
    accentColor: "#6366F1", signBg: "#312E81", signText: "#A5B4FC",
    rx: COL[1], ry: ROW[0],
    furniture: [
      { type: "whiteboard", dx: 300, dy: 50 },
      { type: "plant2", dx: 316, dy: 150 },
    ],
  },
  {
    status: "in_progress", labelKey: "taskStatus.in_progress",
    floor: { backgroundColor: "#C8D8E8", backgroundImage: "repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%,transparent 0% 50%)", backgroundSize: "10px 10px" },
    wallColor: "#8BA8D0", wallDark: "#6888B0",
    accentColor: "#F59E0B", signBg: "#78350F", signText: "#FCD34D",
    rx: COL[2], ry: ROW[0],
    furniture: [
      { type: "plant", dx: 316, dy: 55 },
      { type: "coffee", dx: 310, dy: 140 },
      { type: "plant2", dx: 316, dy: 175 },
    ],
  },
  /* Row 1 — review/block */
  {
    status: "blocked", labelKey: "pixelOffice.blocked",
    floor: { background: "repeating-conic-gradient(#CCCCCC 0% 25%,#C0C0C0 0% 50%)", backgroundSize: "12px 12px" },
    wallColor: "#888888", wallDark: "#666666",
    accentColor: "#6B7280", signBg: "#1F2937", signText: "#9CA3AF",
    rx: COL[0], ry: ROW[1],
    furniture: [
      { type: "cooler", dx: 318, dy: 80 },
    ],
  },
  {
    status: "review", labelKey: "taskStatus.review",
    floor: { backgroundColor: "#D8D0E8", backgroundImage: "repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%,transparent 0% 50%)", backgroundSize: "10px 10px" },
    wallColor: "#A890C8", wallDark: "#8870A8",
    accentColor: "#8B5CF6", signBg: "#4C1D95", signText: "#C4B5FD",
    rx: COL[1], ry: ROW[1],
    furniture: [
      { type: "bookshelf", dx: 308, dy: 48 },
      { type: "plant", dx: 316, dy: 140 },
      { type: "wallart2", dx: 310, dy: 85 },
    ],
  },
  {
    status: "changes_requested", labelKey: "actions.changes_requested",
    floor: { background: "repeating-linear-gradient(0deg,#DCC9A3 0px,#DCC9A3 7px,#D0BD96 7px,#D0BD96 8px)" },
    wallColor: "#D0A870", wallDark: "#B08850",
    accentColor: "#F59E0B", signBg: "#78350F", signText: "#FCD34D",
    rx: COL[2], ry: ROW[1],
    furniture: [
      { type: "whiteboard", dx: 298, dy: 52 },
      { type: "plant2", dx: 318, dy: 155 },
    ],
  },
  /* Row 2 — finished */
  {
    status: "done", labelKey: "taskStatus.done",
    floor: { backgroundColor: "#C0D8C8", backgroundImage: "repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%,transparent 0% 50%)", backgroundSize: "10px 10px" },
    wallColor: "#80B898", wallDark: "#609878",
    accentColor: "#22C55E", signBg: "#14532D", signText: "#86EFAC",
    rx: COL[0], ry: ROW[2],
    furniture: [
      { type: "sofa", dx: 288, dy: 55 },
      { type: "plant", dx: 318, dy: 26 },
      { type: "bookshelf", dx: 308, dy: 138 },
    ],
  },
  {
    status: "cancelled", labelKey: "taskStatus.cancelled",
    floor: { background: "repeating-conic-gradient(#C8C8C8 0% 25%,#BFBFBF 0% 50%)", backgroundSize: "12px 12px" },
    wallColor: "#9CA3AF", wallDark: "#7C8390",
    accentColor: "#6B7280", signBg: "#1C1917", signText: "#9CA3AF",
    rx: COL[1], ry: ROW[2],
    furniture: [
      { type: "plant2", dx: 318, dy: 100 },
    ],
  },
  {
    status: "failed", labelKey: "taskStatus.failed",
    floor: { background: "repeating-conic-gradient(#E0C0C0 0% 25%,#D8B8B8 0% 50%)", backgroundSize: "12px 12px" },
    wallColor: "#C08080", wallDark: "#A06060",
    accentColor: "#EF4444", signBg: "#7F1D1D", signText: "#FCA5A5",
    rx: COL[2], ry: ROW[2],
    furniture: [
      { type: "plant", dx: 318, dy: 90 },
    ],
  },
];

const ZONE_MAP = new Map(ZONES.map((z) => [z.status, z]));

/* ═══ Slot grid (positions inside each zone, relative to zone top-left) ═══ */

const SLOTS = [
  { dx: 16, dy: 30 },
  { dx: 120, dy: 30 },
  { dx: 224, dy: 30 },
  { dx: 16, dy: 120 },
  { dx: 120, dy: 120 },
  { dx: 224, dy: 120 },
];

function getPosition(status: TaskStatus, slotIdx: number): { x: number; y: number } {
  const zone = ZONE_MAP.get(status);
  if (!zone) return { x: 0, y: 0 };
  const slot = SLOTS[Math.min(slotIdx, SLOTS.length - 1)];
  return { x: zone.rx + slot.dx, y: zone.ry + WALL_HEADER + slot.dy };
}

/* ═══ Outdoor trees ═══ */

const TREES: { id: string; x: number; y: number; v: number }[] = [
  { id: "t1", x: 8, y: 30, v: 0 },
  { id: "t2", x: 12, y: 200, v: 1 },
  { id: "t3", x: 6, y: 370, v: 0 },
  { id: "t4", x: 10, y: 540, v: 1 },
  { id: "t5", x: 8, y: 710, v: 0 },
  { id: "t6", x: 1228, y: 60, v: 1 },
  { id: "t7", x: 1232, y: 250, v: 0 },
  { id: "t8", x: 1228, y: 440, v: 1 },
  { id: "t9", x: 1232, y: 630, v: 0 },
  { id: "t10", x: 1228, y: 780, v: 1 },
];

/* ═══ Corridor decorations (relative to building inner) ═══ */

const CORRIDOR_DECO: { id: string; type: string; dx: number; dy: number }[] = [
  /* Vertical corridor col 0–1 */
  { id: "cd1", type: "plant", dx: 376, dy: 60 },
  { id: "cd2", type: "cooler", dx: 378, dy: 300 },
  { id: "cd3", type: "plant2", dx: 376, dy: 540 },
  /* Vertical corridor col 1–2 */
  { id: "cd4", type: "plant2", dx: 752, dy: 80 },
  { id: "cd5", type: "coffee", dx: 754, dy: 340 },
  { id: "cd6", type: "plant", dx: 752, dy: 560 },
  /* Horizontal corridor row 0–1 */
  { id: "cd7", type: "sofa", dx: 160, dy: 240 },
  { id: "cd8", type: "plant", dx: 520, dy: 242 },
  { id: "cd9", type: "plant2", dx: 880, dy: 242 },
  /* Horizontal corridor row 1–2 */
  { id: "cd10", type: "plant", dx: 180, dy: 482 },
  { id: "cd11", type: "plant2", dx: 600, dy: 484 },
  { id: "cd12", type: "sofa2", dx: 900, dy: 482 },
];

/* ═══ Walking animation duration (ms) ═══ */
const WALK_DURATION = 1500;

/* ═══ Decoration renderer ═══ */

function Deco({ type, style }: { type: string; style?: React.CSSProperties }) {
  const wrap = (children: React.ReactNode) => (
    <div className="absolute" style={{ ...style, zIndex: 12 }}>{children}</div>
  );
  switch (type) {
    case "plant": return wrap(<PixelPlant variant={0} />);
    case "plant2": return wrap(<PixelPlant variant={1} />);
    case "plant3": return wrap(<PixelPlant variant={2} />);
    case "bookshelf": return wrap(<PixelBookshelf />);
    case "cooler": return wrap(<PixelWaterCooler />);
    case "whiteboard": return wrap(<PixelWhiteboard />);
    case "sofa": return wrap(<PixelSofa color="#F97316" />);
    case "sofa2": return wrap(<PixelSofa color="#6366F1" />);
    case "wallart": return wrap(<PixelWallArt variant={0} />);
    case "wallart2": return wrap(<PixelWallArt variant={1} />);
    case "coffee": return wrap(<PixelCoffeeMachine />);
    default: return null;
  }
}

/* ═══ Component ═══ */

interface PixelOfficeProps {
  tasks: Task[];
  projectFilter: string;
  agentMap: Map<string, Agent>;
  agentActivity: Map<string, { status: string; taskId?: string; currentTask?: string; currentFile?: string; lastActivity: number; progress: number }>;
  onTaskClick: (task: Task) => void;
}

export function PixelOffice({ tasks, projectFilter, agentMap, agentActivity, onTaskClick }: PixelOfficeProps) {
  const { t } = useTranslation();

  const filteredTasks = useMemo(
    () => tasks.filter((task) => !projectFilter || task.projectId === projectFilter),
    [tasks, projectFilter],
  );

  /* ─── Walking detection ─── */
  const prevStatusRef = useRef<Map<string, TaskStatus>>(new Map());
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [walkingTasks, setWalkingTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newWalking = new Set<string>();
    for (const task of filteredTasks) {
      const prev = prevStatusRef.current.get(task.id);
      if (prev !== undefined && prev !== task.status) newWalking.add(task.id);
    }
    const next = new Map<string, TaskStatus>();
    for (const task of filteredTasks) next.set(task.id, task.status);
    prevStatusRef.current = next;

    if (newWalking.size > 0) {
      setWalkingTasks(newWalking);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      walkTimerRef.current = setTimeout(() => setWalkingTasks(new Set()), WALK_DURATION);
    }
  }, [filteredTasks]);

  /* ─── Assign slot indices per zone ─── */
  const taskSlots = useMemo(() => {
    const counts = new Map<TaskStatus, number>();
    return filteredTasks.map((task) => {
      const idx = counts.get(task.status) ?? 0;
      counts.set(task.status, idx + 1);
      return { task, slotIdx: idx, pos: getPosition(task.status, idx) };
    });
  }, [filteredTasks]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div
        className="relative mx-auto"
        style={{
          width: MAP_W,
          height: MAP_H,
          imageRendering: "pixelated",
          /* Grass background */
          background: "repeating-conic-gradient(#7EC850 0% 25%, #72B848 0% 50%)",
          backgroundSize: "16px 16px",
          border: "4px solid #5A9A3A",
          boxShadow: "6px 6px 0 rgba(0,0,0,0.25)",
        }}
      >
        {/* ─── Grass path / sidewalk around building ─── */}
        <div
          className="absolute"
          style={{
            left: BLDG.x - 8,
            top: BLDG.y - 8,
            width: BLDG.w + 16,
            height: BLDG.h + 16,
            background: "#A8C090",
            border: "2px solid #8BA870",
          }}
        />

        {/* ─── Outdoor trees ─── */}
        {TREES.map((tr) => (
          <div key={tr.id} className="absolute" style={{ left: tr.x, top: tr.y, zIndex: 5 }}>
            <PixelTree variant={tr.v} />
          </div>
        ))}

        {/* ─── Building ─── */}
        <div
          className="absolute"
          style={{
            left: BLDG.x,
            top: BLDG.y,
            width: BLDG.w,
            height: BLDG.h,
            /* Corridor floor */
            background: "repeating-linear-gradient(0deg,#C8B090 0px,#C8B090 7px,#BCA880 7px,#BCA880 8px)",
            border: `${WALL}px solid #6B5540`,
            boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.08), 3px 3px 0 rgba(0,0,0,0.15)",
          }}
        >
          {/* ─── Building name plate ─── */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: -28,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.92)",
              padding: "3px 16px",
              borderRadius: 10,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              zIndex: 60,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: "#4A3728", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              {t("pixelOffice.title")}
            </span>
          </div>

          {/* ─── Zone rooms ─── */}
          {ZONES.map((zone) => {
            const count = filteredTasks.filter((tk) => tk.status === zone.status).length;
            return (
              <div
                key={zone.status}
                className="absolute"
                style={{
                  left: zone.rx,
                  top: zone.ry,
                  width: ROOM_W,
                  height: ROOM_H,
                  ...zone.floor,
                  border: `3px solid ${zone.wallColor}`,
                  boxShadow: `inset 0 0 0 1px ${zone.wallDark}30`,
                }}
              >
                {/* Wall header band */}
                <div
                  className="flex items-center justify-between px-2"
                  style={{
                    height: WALL_HEADER,
                    background: zone.wallColor,
                    borderBottom: `2px solid ${zone.wallDark}`,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: zone.accentColor }} />
                    <span style={{ color: zone.wallDark, fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {t(zone.labelKey)}
                    </span>
                  </div>
                  <span
                    style={{
                      background: zone.signBg,
                      color: zone.signText,
                      fontSize: 8,
                      fontWeight: 800,
                      padding: "0 4px",
                      lineHeight: "12px",
                    }}
                  >
                    {count}
                  </span>
                </div>

                {/* Room furniture */}
                {zone.furniture.map((f, i) => (
                  <Deco key={i} type={f.type} style={{ left: f.dx, top: f.dy }} />
                ))}

                {/* Overflow indicator */}
                {count > SLOTS.length && (
                  <div
                    className="absolute"
                    style={{
                      right: 4,
                      bottom: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: zone.signText,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 6px",
                      zIndex: 25,
                    }}
                  >
                    +{count - SLOTS.length}
                  </div>
                )}
              </div>
            );
          })}

          {/* ─── Corridor decorations ─── */}
          {CORRIDOR_DECO.map((d) => (
            <Deco key={d.id} type={d.type} style={{ left: d.dx, top: d.dy }} />
          ))}

          {/* ─── Task + Agent sprites ─── */}
          {taskSlots
            .filter((ts) => ts.slotIdx < SLOTS.length)
            .map(({ task, pos }) => {
              const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
              const activity = task.assignedAgentId ? agentActivity.get(task.assignedAgentId) : null;
              const isWorking = !!(activity && activity.status !== "idle" && activity.taskId === task.id);
              const isWalking = walkingTasks.has(task.id);

              return (
                <div
                  key={task.id}
                  className="absolute"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    transition: `left ${WALK_DURATION}ms ease-in-out, top ${WALK_DURATION}ms ease-in-out`,
                    zIndex: isWalking ? 40 : 20,
                  }}
                >
                  <div className="flex items-end gap-1">
                    {agent && (
                      <OfficeAgent
                        agent={agent}
                        isWorking={isWorking}
                        isWalking={isWalking}
                        currentTask={activity?.currentTask}
                      />
                    )}
                    <OfficeDesk task={task} onClick={onTaskClick} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
