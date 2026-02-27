import type { TaskStatus } from '@agenthub/shared';
import type { Character, Seat, FurnitureInstance, RoomDef, TileType as TileTypeVal } from './types';
import { CharacterState, TILE_SIZE } from './types';
import { createCharacter, updateCharacter } from './characters';
import { getWalkableTiles, findPath, isWalkable } from './tile-map';
import { matrixEffectSeeds } from './matrix-effect';
import {
  createOfficeLayout,
  getSeatInRoom,
  getRoomForStatus,
  getSpawnPointInRoom,
} from './office-layout';
import {
  PALETTE_COUNT,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  MATRIX_EFFECT_DURATION_SEC,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
} from './constants';

/** Deterministic palette index from agent color string */
function agentColorToPalette(color: string): { palette: number; hueShift: number } {
  let hash = 0;
  for (let i = 0; i < color.length; i++) {
    hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0;
  }
  const palette = ((hash & 0x7fffffff) % PALETTE_COUNT);
  const hueShift = HUE_SHIFT_MIN_DEG + ((hash >>> 8) & 0xff) / 255 * HUE_SHIFT_RANGE_DEG;
  return { palette, hueShift };
}

export class OfficeState {
  tileMap: TileTypeVal[][];
  rooms: RoomDef[];
  seats: Map<string, Seat>;
  furniture: FurnitureInstance[];
  blockedTiles: Set<string>;
  walkableTiles: Array<{ col: number; row: number }>;
  characters: Map<string, Character>;
  gridCols: number;
  gridRows: number;

  /** Per-room walkable tiles so agents don't leave their room */
  private roomWalkableTiles: Map<TaskStatus, Array<{ col: number; row: number }>> = new Map();

  /** Characters pending removal after despawn animation */
  private pendingRemoval: Set<string> = new Set();

  constructor() {
    const layout = createOfficeLayout();
    this.tileMap = layout.tileMap;
    this.rooms = layout.rooms;
    this.seats = layout.seats;
    this.furniture = layout.furniture;
    this.blockedTiles = layout.blockedTiles;
    this.gridCols = layout.gridCols;
    this.gridRows = layout.gridRows;
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    this.characters = new Map();

    // Pre-compute walkable tiles per room
    for (const room of this.rooms) {
      const tiles: Array<{ col: number; row: number }> = [];
      for (let r = room.row; r < room.row + room.h; r++) {
        for (let c = room.col; c < room.col + room.w; c++) {
          if (isWalkable(c, r, this.tileMap, this.blockedTiles)) {
            tiles.push({ col: c, row: r });
          }
        }
      }
      this.roomWalkableTiles.set(room.status, tiles);
    }
  }

  /** Get walkable tiles for a specific room */
  getWalkableTilesForRoom(status: TaskStatus): Array<{ col: number; row: number }> {
    return this.roomWalkableTiles.get(status) ?? this.walkableTiles;
  }

  /** Add a new character (agent) to the office */
  addCharacter(
    agentId: string,
    taskId: string,
    status: TaskStatus,
    name: string,
    color: string,
    isActive: boolean,
  ): void {
    if (this.characters.has(agentId)) return;

    const { palette, hueShift } = agentColorToPalette(color);
    const seat = getSeatInRoom(this.seats, status);
    const seatId = seat ? seat.uid : null;

    if (seat) {
      seat.assigned = true;
    }

    const ch = createCharacter(
      agentId,
      palette,
      seatId,
      seat,
      hueShift,
      taskId,
      status,
      name,
      color,
    );

    ch.isActive = isActive;

    // If no seat was found, place at spawn point
    if (!seat) {
      const room = getRoomForStatus(this.rooms, status);
      if (room) {
        const spawn = getSpawnPointInRoom(room);
        ch.tileCol = spawn.col;
        ch.tileRow = spawn.row;
        ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
        ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      }
    }

    // Matrix spawn effect
    ch.matrixEffect = 'spawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();

    this.characters.set(agentId, ch);
  }

  /** Remove a character with despawn animation */
  removeCharacter(id: string): void {
    const ch = this.characters.get(id);
    if (!ch) return;

    // Free the seat
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }

    // Start despawn effect
    ch.matrixEffect = 'despawn';
    ch.matrixEffectTimer = 0;
    ch.matrixEffectSeeds = matrixEffectSeeds();
    this.pendingRemoval.add(id);
  }

  /** Move a character to a different room (status change) */
  moveToRoom(id: string, newStatus: TaskStatus): void {
    const ch = this.characters.get(id);
    if (!ch || ch.roomId === newStatus) return;

    // Free old seat
    if (ch.seatId) {
      const oldSeat = this.seats.get(ch.seatId);
      if (oldSeat) oldSeat.assigned = false;
    }

    ch.roomId = newStatus;

    // Try to get a seat in the new room
    const newSeat = getSeatInRoom(this.seats, newStatus);
    if (newSeat) {
      newSeat.assigned = true;
      ch.seatId = newSeat.uid;

      // Pathfind to the new seat
      const path = findPath(ch.tileCol, ch.tileRow, newSeat.seatCol, newSeat.seatRow, this.tileMap, this.blockedTiles);
      if (path.length > 0) {
        ch.path = path;
        ch.moveProgress = 0;
        ch.state = CharacterState.WALK;
        ch.frame = 0;
        ch.frameTimer = 0;
      } else {
        // Can't pathfind — teleport
        ch.tileCol = newSeat.seatCol;
        ch.tileRow = newSeat.seatRow;
        ch.x = newSeat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = newSeat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        ch.dir = newSeat.facingDir;
        ch.state = ch.isActive ? CharacterState.TYPE : CharacterState.IDLE;
      }
    } else {
      // No seat available — go to spawn point
      ch.seatId = null;
      const room = getRoomForStatus(this.rooms, newStatus);
      if (room) {
        const spawn = getSpawnPointInRoom(room);
        const path = findPath(ch.tileCol, ch.tileRow, spawn.col, spawn.row, this.tileMap, this.blockedTiles);
        if (path.length > 0) {
          ch.path = path;
          ch.moveProgress = 0;
          ch.state = CharacterState.WALK;
          ch.frame = 0;
          ch.frameTimer = 0;
        } else {
          ch.tileCol = spawn.col;
          ch.tileRow = spawn.row;
          ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
          ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
        }
      }
    }
  }

  /** Update activity state (typing at desk vs idle wandering) */
  setActive(id: string, isActive: boolean): void {
    const ch = this.characters.get(id);
    if (!ch || ch.isActive === isActive) return;
    ch.isActive = isActive;
  }

  /** Update all characters */
  update(dt: number): void {
    for (const [id, ch] of this.characters) {
      // Update matrix effect timer
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt;
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION_SEC) {
          ch.matrixEffect = null;
          ch.matrixEffectTimer = 0;

          // Remove characters that finished despawning
          if (this.pendingRemoval.has(id)) {
            this.pendingRemoval.delete(id);
            this.characters.delete(id);
            continue;
          }
        }
      }

      const roomTiles = this.getWalkableTilesForRoom(ch.roomId);
      updateCharacter(ch, dt, roomTiles, this.seats, this.tileMap, this.blockedTiles);
    }
  }

  /** Hit-test: find character at world coordinates */
  getCharacterAt(worldX: number, worldY: number): Character | null {
    for (const ch of this.characters.values()) {
      const dx = Math.abs(worldX - ch.x);
      const dy = worldY - (ch.y - CHARACTER_HIT_HEIGHT / 2);
      if (dx <= CHARACTER_HIT_HALF_WIDTH && dy >= 0 && dy <= CHARACTER_HIT_HEIGHT) {
        return ch;
      }
    }
    return null;
  }
}
