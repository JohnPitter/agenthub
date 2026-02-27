import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { Task, Agent } from '@agenthub/shared';
import { OfficeState } from './canvas/office-state';
import { startGameLoop } from './canvas/game-loop';
import { renderFrame } from './canvas/renderer';
import { TILE_SIZE } from './canvas/types';
import { preloadAllAssets } from './canvas/sprites';

interface PixelOfficeCanvasProps {
  tasks: Task[];
  projectFilter: string;
  agentMap: Map<string, Agent>;
  agentActivity: Map<string, {
    status: string;
    taskId?: string;
    currentTask?: string;
    currentFile?: string;
    lastActivity: number;
    progress: number;
  }>;
  onTaskClick: (task: Task) => void;
}

export function PixelOfficeCanvas({
  tasks,
  projectFilter,
  agentMap,
  agentActivity,
  onTaskClick,
}: PixelOfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const zoomRef = useRef(1);
  const hoveredRef = useRef<string | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Load assets on mount
  useEffect(() => {
    preloadAllAssets().then(() => setAssetsLoaded(true));
  }, []);

  // Filter tasks
  const filteredTasks = useMemo(
    () => tasks.filter((task) => !projectFilter || task.projectId === projectFilter),
    [tasks, projectFilter],
  );

  // Initialize office state once
  if (!stateRef.current) {
    stateRef.current = new OfficeState();
  }

  // Sync props to imperative game state
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    const currentIds = new Set<string>();

    for (const task of filteredTasks) {
      const agent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
      const activity = task.assignedAgentId ? agentActivity.get(task.assignedAgentId) : null;
      const isActive = !!(activity && activity.status !== 'idle' && activity.taskId === task.id);
      const charId = task.id;
      const agentName = agent?.name ?? task.title.slice(0, 12);
      const agentColor = agent?.name ?? task.id;

      currentIds.add(charId);

      const existing = state.characters.get(charId);
      if (!existing) {
        state.addCharacter(charId, task.id, task.status, agentName, agentColor, isActive);
      } else {
        if (existing.roomId !== task.status) {
          state.moveToRoom(charId, task.status);
        }
        state.setActive(charId, isActive);
        existing.agentName = agentName;
      }
    }

    for (const [id] of state.characters) {
      if (!currentIds.has(id)) {
        state.removeCharacter(id);
      }
    }
  }, [filteredTasks, agentMap, agentActivity]);

  // Resize canvas + compute zoom to fill container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const state = stateRef.current;
    if (!canvas || !container || !state) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = false;
    }

    // Scale to fill the entire container
    const worldW = state.gridCols * TILE_SIZE;
    const worldH = state.gridRows * TILE_SIZE;
    zoomRef.current = Math.min(rect.width / worldW, rect.height / worldH);
  }, []);

  // Game loop
  useEffect(() => {
    if (!assetsLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    resizeCanvas();

    const cleanup = startGameLoop(canvas, {
      update: (dt) => {
        stateRef.current?.update(dt);
      },
      render: (ctx) => {
        const state = stateRef.current;
        if (!state) return;
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const worldW = state.gridCols * TILE_SIZE;
        const worldH = state.gridRows * TILE_SIZE;
        const zoom = zoomRef.current;

        // Center in container
        const ox = (rect.width - worldW * zoom) / 2;
        const oy = (rect.height - worldH * zoom) / 2;

        renderFrame(ctx, state, zoom, rect.width, rect.height, ox, oy, hoveredRef.current);
      },
    });

    return cleanup;
  }, [resizeCanvas, assetsLoaded]);

  // ResizeObserver
  useEffect(() => {
    if (!assetsLoaded) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeCanvas, assetsLoaded]);

  // Screen-to-world coordinate conversion
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };

    const cRect = container.getBoundingClientRect();
    const worldW = state.gridCols * TILE_SIZE;
    const worldH = state.gridRows * TILE_SIZE;
    const zoom = zoomRef.current;
    const ox = (cRect.width - worldW * zoom) / 2;
    const oy = (cRect.height - worldH * zoom) / 2;

    return {
      x: (clientX - rect.left - ox) / zoom,
      y: (clientY - rect.top - oy) / zoom,
    };
  }, []);

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent) => {
    const state = stateRef.current;
    if (!state) return;

    const world = screenToWorld(e.clientX, e.clientY);
    const ch = state.getCharacterAt(world.x, world.y);
    if (ch) {
      const task = filteredTasks.find(t => t.id === ch.taskId);
      if (task) onTaskClick(task);
    }
  }, [filteredTasks, onTaskClick, screenToWorld]);

  // Mouse move for hover
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const state = stateRef.current;
    if (!state) return;

    const world = screenToWorld(e.clientX, e.clientY);
    const ch = state.getCharacterAt(world.x, world.y);
    hoveredRef.current = ch ? ch.id : null;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = ch ? 'pointer' : 'default';
    }
  }, [screenToWorld]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden relative ${assetsLoaded ? 'bg-[#111827]' : 'bg-gray-900 flex items-center justify-center'}`}
      style={{ imageRendering: 'pixelated' }}
    >
      {!assetsLoaded ? (
        <div className="flex flex-col items-center justify-center text-gray-400 space-y-4">
          <div className="w-8 h-8 rounded-full border-4 border-t-white border-white/20 animate-spin"></div>
          <p className="font-mono text-sm tracking-widest uppercase">Loading Office...</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}
