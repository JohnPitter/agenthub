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

const BLDG = { x: 80, y: 64, w: 1120, h: 712 };
const WALL_THICKNESS = 16;

/* ═══ Room grid ═══ */

const ROOM_W = 340;
const ROOM_H = 200;
const CORRIDOR_X = 32;
const CORRIDOR_Y = 32;

// Offset inside building
const COL = [16, 16 + ROOM_W + CORRIDOR_X, 16 + (ROOM_W + CORRIDOR_X) * 2];
const ROW = [16, 16 + ROOM_H + CORRIDOR_Y, 16 + (ROOM_H + CORRIDOR_Y) * 2];

/* ═══ Zone definitions ═══ */

interface ZoneDef {
  status: TaskStatus;
  labelKey: string;
  floor: CSSProperties;
  wallTop: string;
  wallFront: string;
  accentColor: string;
  signBg: string;
  signText: string;
  rx: number;
  ry: number;
  furniture: { type: string; dx: number; dy: number }[];
}

const carpetTiles = (b: string, h: string) => ({
  background: `repeating-conic-gradient(${b} 0% 25%, ${h} 0% 50%)`,
  backgroundSize: "16px 16px",
});
const woodTiles = (c1: string, c2: string) => ({
  background: `repeating-linear-gradient(90deg, transparent 0, transparent 32px, rgba(0,0,0,0.1) 32px, rgba(0,0,0,0.1) 34px), repeating-linear-gradient(0deg, ${c1} 0px, ${c1} 14px, ${c2} 14px, ${c2} 16px)`,
});

const ZONES: ZoneDef[] = [
  /* Row 0 — pipeline */
  {
    status: "created", labelKey: "taskStatus.backlog",
    floor: woodTiles("#D97706", "#B45309"),
    wallTop: "#1F2937", wallFront: "#4B5563",
    accentColor: "#3B82F6", signBg: "#111827", signText: "#60A5FA",
    rx: COL[0], ry: ROW[0],
    furniture: [
      { type: "bookshelf", dx: 300, dy: 60 },
      { type: "plant", dx: 316, dy: 130 },
      { type: "wallart", dx: 312, dy: 60 },
    ],
  },
  {
    status: "assigned", labelKey: "taskStatus.assigned",
    floor: carpetTiles("#818CF8", "#6366F1"),
    wallTop: "#1F2937", wallFront: "#60A5FA",
    accentColor: "#6366F1", signBg: "#1E3A8A", signText: "#BFDBFE",
    rx: COL[1], ry: ROW[0],
    furniture: [
      { type: "whiteboard", dx: 290, dy: 40 },
      { type: "plant2", dx: 316, dy: 150 },
    ],
  },
  {
    status: "in_progress", labelKey: "taskStatus.in_progress",
    floor: woodTiles("#84CC16", "#65A30D"),
    wallTop: "#1F2937", wallFront: "#84CC16",
    accentColor: "#F59E0B", signBg: "#713F12", signText: "#FDE047",
    rx: COL[2], ry: ROW[0],
    furniture: [
      { type: "plant", dx: 300, dy: 50 },
      { type: "coffee", dx: 310, dy: 140 },
      { type: "plant2", dx: 316, dy: 175 },
    ],
  },
  /* Row 1 — review/block */
  {
    status: "blocked", labelKey: "pixelOffice.blocked",
    floor: carpetTiles("#9CA3AF", "#6B7280"),
    wallTop: "#111827", wallFront: "#374151",
    accentColor: "#6B7280", signBg: "#1F2937", signText: "#D1D5DB",
    rx: COL[0], ry: ROW[1],
    furniture: [
      { type: "cooler", dx: 310, dy: 60 },
    ],
  },
  {
    status: "review", labelKey: "taskStatus.review",
    floor: carpetTiles("#C084FC", "#A855F7"),
    wallTop: "#1F2937", wallFront: "#A855F7",
    accentColor: "#8B5CF6", signBg: "#581C87", signText: "#E9D5FF",
    rx: COL[1], ry: ROW[1],
    furniture: [
      { type: "bookshelf", dx: 300, dy: 50 },
      { type: "wallart2", dx: 312, dy: 60 },
    ],
  },
  {
    status: "changes_requested", labelKey: "actions.changes_requested",
    floor: woodTiles("#F59E0B", "#D97706"),
    wallTop: "#1F2937", wallFront: "#F59E0B",
    accentColor: "#F97316", signBg: "#7C2D12", signText: "#FDBA74",
    rx: COL[2], ry: ROW[1],
    furniture: [
      { type: "whiteboard", dx: 290, dy: 40 },
      { type: "plant2", dx: 310, dy: 150 },
    ],
  },
  /* Row 2 — finished */
  {
    status: "done", labelKey: "taskStatus.done",
    floor: carpetTiles("#A7F3D0", "#34D399"),
    wallTop: "#1F2937", wallFront: "#34D399",
    accentColor: "#22C55E", signBg: "#064E3B", signText: "#A7F3D0",
    rx: COL[0], ry: ROW[2],
    furniture: [
      { type: "sofa", dx: 280, dy: 40 },
      { type: "plant", dx: 310, dy: 90 },
      { type: "bookshelf", dx: 300, dy: 130 },
    ],
  },
  {
    status: "cancelled", labelKey: "taskStatus.cancelled",
    floor: woodTiles("#A3A3A3", "#737373"),
    wallTop: "#171717", wallFront: "#525252",
    accentColor: "#737373", signBg: "#262626", signText: "#D4D4D4",
    rx: COL[1], ry: ROW[2],
    furniture: [
      { type: "plant2", dx: 310, dy: 100 },
    ],
  },
  {
    status: "failed", labelKey: "taskStatus.failed",
    floor: carpetTiles("#FDA4AF", "#FB7185"),
    wallTop: "#1F2937", wallFront: "#FB7185",
    accentColor: "#EF4444", signBg: "#7F1D1D", signText: "#FECDD3",
    rx: COL[2], ry: ROW[2],
    furniture: [
      { type: "plant", dx: 310, dy: 90 },
    ],
  },
];

const ZONE_MAP = new Map(ZONES.map((z) => [z.status, z]));

/* ═══ Slot grid (positions inside each zone, relative to zone top-left) ═══ */

const SLOTS = [
  { dx: 20, dy: 30 },
  { dx: 110, dy: 30 },
  { dx: 200, dy: 30 },
  { dx: 20, dy: 110 },
  { dx: 110, dy: 110 },
  { dx: 200, dy: 110 },
];

function getPosition(status: TaskStatus, slotIdx: number): { x: number; y: number } {
  const zone = ZONE_MAP.get(status);
  if (!zone) return { x: 0, y: 0 };
  const slot = SLOTS[Math.min(slotIdx, SLOTS.length - 1)];
  return { x: zone.rx + slot.dx, y: zone.ry + 32 + slot.dy }; // offset by wall top
}

/* ═══ Outdoor trees ═══ */

const TREES: { id: string; x: number; y: number; v: number }[] = [
  { id: "t1", x: 8, y: 10, v: 0 },
  { id: "t2", x: 12, y: 180, v: 1 },
  { id: "t3", x: 6, y: 350, v: 0 },
  { id: "t4", x: 10, y: 520, v: 1 },
  { id: "t5", x: 8, y: 700, v: 0 },
  { id: "t6", x: 1210, y: 30, v: 1 },
  { id: "t7", x: 1216, y: 220, v: 0 },
  { id: "t8", x: 1204, y: 410, v: 1 },
  { id: "t9", x: 1220, y: 600, v: 0 },
  { id: "t10", x: 1210, y: 760, v: 1 },
];

/* ═══ Corridor decorations (relative to building inner) ═══ */

const CORRIDOR_DECO: { id: string; type: string; dx: number; dy: number }[] = [
  { id: "cd1", type: "plant", dx: 366, dy: 50 },
  { id: "cd2", type: "cooler", dx: 368, dy: 290 },
  { id: "cd3", type: "plant2", dx: 366, dy: 520 },
  { id: "cd4", type: "plant2", dx: 738, dy: 60 },
  { id: "cd5", type: "coffee", dx: 740, dy: 320 },
  { id: "cd6", type: "plant", dx: 738, dy: 540 },
  { id: "cd7", type: "sofa", dx: 150, dy: 226 },
  { id: "cd8", type: "plant", dx: 500, dy: 226 },
  { id: "cd9", type: "plant2", dx: 860, dy: 226 },
  { id: "cd10", type: "plant", dx: 170, dy: 460 },
  { id: "cd11", type: "plant2", dx: 580, dy: 460 },
  { id: "cd12", type: "sofa2", dx: 880, dy: 460 },
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
    case "sofa": return wrap(<PixelSofa color="#D97706" />);
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
    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#111827]">
      <div
        className="relative shadow-2xl overflow-hidden"
        style={{
          width: MAP_W,
          height: MAP_H,
          imageRendering: "pixelated",
          /* Grass background Gather Town style */
          background: "repeating-conic-gradient(#22C55E 0% 25%, #16A34A 0% 50%)",
          backgroundSize: "32px 32px",
          border: "8px solid #064E3B",
          borderRadius: 4,
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.8)",
        }}
      >
        {/* ─── Grass path / sidewalk around building ─── */}
        <div
          className="absolute"
          style={{
            left: BLDG.x - 16,
            top: BLDG.y - 16,
            width: BLDG.w + 32,
            height: BLDG.h + 32,
            background: "repeating-conic-gradient(#A1A1AA 0% 25%, #71717A 0% 50%)",
            backgroundSize: "16px 16px",
            border: "2px solid #3F3F46",
            borderRadius: 8,
          }}
        />

        {/* ─── Outdoor trees ─── */}
        {TREES.map((tr) => (
          <div key={tr.id} className="absolute" style={{ left: tr.x, top: tr.y, zIndex: 10 }}>
            <PixelTree variant={tr.v} />
          </div>
        ))}

        {/* ─── Main Building Shell ─── */}
        <div
          className="absolute"
          style={{
            left: BLDG.x,
            top: BLDG.y,
            width: BLDG.w,
            height: BLDG.h,
            /* Main Corridor Floor */
            background: "repeating-linear-gradient(90deg, transparent 0, transparent 32px, rgba(0,0,0,0.05) 32px, rgba(0,0,0,0.05) 34px), repeating-linear-gradient(0deg, #D4D4D8 0px, #D4D4D8 14px, #A1A1AA 14px, #A1A1AA 16px)",
            border: `${WALL_THICKNESS}px solid #1F2937`,
            borderTopWidth: WALL_THICKNESS + 8, // Thicker top wall for top-down illusion
            boxShadow: "inset 0 4px 10px rgba(0,0,0,0.3), 0 8px 0 rgba(0,0,0,0.3)",
          }}
        >
          {/* Building Top Wall Front Face (Inner lip) */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-[#4B5563] border-b-4 border-[#111827] shadow-[0_4px_0_rgba(0,0,0,0.1)]" />

          {/* ─── Building name plate ─── */}
          <div
            className="absolute flex items-center justify-center -top-[36px]"
            style={{
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1F2937",
              border: "2px solid #030712",
              padding: "4px 20px",
              borderRadius: 2,
              boxShadow: "0 4px 0 rgba(0,0,0,0.4)",
              zIndex: 60,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 900, color: "#FBBF24", letterSpacing: "0.2em", textTransform: "uppercase", textShadow: "1px 1px 0 #000" }}>
              {t("pixelOffice.title")}
            </span>
          </div>

          {/* ─── Zone rooms ─── */}
          {ZONES.map((zone) => {
            const count = filteredTasks.filter((tk) => tk.status === zone.status).length;
            return (
              <div
                key={zone.status}
                className="absolute shadow-[0_8px_0_rgba(0,0,0,0.15)] bg-black"
                style={{
                  left: zone.rx,
                  top: zone.ry,
                  width: ROOM_W,
                  height: ROOM_H,
                  border: "4px solid #111827",
                  borderRadius: 2,
                }}
              >
                {/* Wall TOP Face */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, background: zone.wallTop, borderBottom: "4px solid #030712", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 border border-black" style={{ background: zone.accentColor }} />
                    <span className="text-[10px] font-black uppercase text-white tracking-widest" style={{ textShadow: "1px 1px 0 #000" }}>
                      {t(zone.labelKey)}
                    </span>
                  </div>
                  <div className="px-1.5 py-0.5 border border-black" style={{ background: zone.signBg }}>
                    <span className="text-[8px] font-black" style={{ color: zone.signText }}>{count}</span>
                  </div>
                </div>

                {/* Wall FRONT Face */}
                <div style={{ position: "absolute", top: 16, left: 0, right: 0, height: 16, background: zone.wallFront, borderBottom: "4px solid #111827" }} />

                {/* Room Floor Content */}
                <div style={{ position: "absolute", top: 32, left: 0, right: 0, bottom: 0, ...zone.floor, boxShadow: "inset 4px 4px 0 rgba(0,0,0,0.1)" }}>
                  {/* Room furniture */}
                  {zone.furniture.map((f, i) => (
                    <Deco key={i} type={f.type} style={{ left: f.dx, top: f.dy }} />
                  ))}

                  {/* Overflow indicator */}
                  {count > SLOTS.length && (
                    <div
                      className="absolute bottom-2 right-2 border-2 border-black z-30 animate-pulse"
                      style={{
                        background: zone.signBg,
                        color: zone.signText,
                        fontSize: 10,
                        fontWeight: 900,
                        padding: "2px 6px",
                        boxShadow: "0 2px 0 rgba(0,0,0,0.3)",
                      }}
                    >
                      +{count - SLOTS.length} MAIS
                    </div>
                  )}
                </div>
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
                    transition: `left ${WALK_DURATION}ms ease-out, top ${WALK_DURATION}ms ease-out`,
                    zIndex: isWalking ? 50 : 20,
                  }}
                >
                  <div className="flex items-end gap-2">
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
