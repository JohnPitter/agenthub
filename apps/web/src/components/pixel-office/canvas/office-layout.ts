import { TileType, Direction, TILE_SIZE } from './types';
import type { TileType as TileTypeVal, Seat, FurnitureInstance, RoomDef } from './types';
import type { TaskStatus } from '@agenthub/shared';
import { ROOM_COLORS } from './constants';

// ── Layout Constants ────────────────────────────────────────────
const ROOM_W = 14;       // Interior width in tiles
const ROOM_H = 8;        // Interior height in tiles
const WALL_TOP = 2;      // Wall thickness at top
const WALL_BOTTOM = 1;   // Wall thickness at bottom
const WALL_SIDE = 1;     // Wall thickness on sides
const CORRIDOR_W = 2;    // Corridor width between rooms
const BORDER = 2;        // Grass border around the office
const DOOR_W = 2;        // Door opening width
const ROOMS_PER_ROW = 3;
const ROWS = 3;

// Full room dimensions including walls
const FULL_ROOM_W = WALL_SIDE + ROOM_W + WALL_SIDE;  // 16
const FULL_ROOM_H = WALL_TOP + ROOM_H + WALL_BOTTOM; // 11

// Grid dimensions
const GRID_COLS = BORDER + FULL_ROOM_W * ROOMS_PER_ROW + CORRIDOR_W * (ROOMS_PER_ROW - 1) + BORDER; // 2+16*3+2*2+2 = 56
const GRID_ROWS = BORDER + FULL_ROOM_H * ROWS + CORRIDOR_W * (ROWS - 1) + BORDER; // 2+11*3+2*2+2 = 41

// Room status layout (3x3 grid)
const ROOM_STATUS_GRID: TaskStatus[][] = [
  ['created', 'assigned', 'in_progress'],
  ['blocked', 'review', 'changes_requested'],
  ['done', 'cancelled', 'failed'],
];

export interface OfficeLayout {
  tileMap: TileTypeVal[][];
  rooms: RoomDef[];
  seats: Map<string, Seat>;
  furniture: FurnitureInstance[];
  blockedTiles: Set<string>;
  gridCols: number;
  gridRows: number;
}

/** Get room interior top-left (col, row) for a grid position */
function roomOrigin(gridCol: number, gridRow: number): { col: number; row: number } {
  return {
    col: BORDER + gridCol * (FULL_ROOM_W + CORRIDOR_W) + WALL_SIDE,
    row: BORDER + gridRow * (FULL_ROOM_H + CORRIDOR_W) + WALL_TOP,
  };
}

/** Get the full room top-left (including walls) */
function roomTopLeft(gridCol: number, gridRow: number): { col: number; row: number } {
  return {
    col: BORDER + gridCol * (FULL_ROOM_W + CORRIDOR_W),
    row: BORDER + gridRow * (FULL_ROOM_H + CORRIDOR_W),
  };
}

/** Create the complete office layout */
export function createOfficeLayout(): OfficeLayout {
  // Initialize tile map with VOID
  const tileMap: TileTypeVal[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    tileMap[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      tileMap[r][c] = TileType.VOID;
    }
  }

  const rooms: RoomDef[] = [];
  const seats = new Map<string, Seat>();
  const furniture: FurnitureInstance[] = [];
  const blockedTiles = new Set<string>();

  // Build each room
  for (let gr = 0; gr < ROWS; gr++) {
    for (let gc = 0; gc < ROOMS_PER_ROW; gc++) {
      const status = ROOM_STATUS_GRID[gr][gc];
      const colors = ROOM_COLORS[status];
      const origin = roomOrigin(gc, gr);
      const topLeft = roomTopLeft(gc, gr);

      // Alternate floor tile types for visual variety
      const floorType = (gr + gc) % 2 === 0 ? TileType.FLOOR_1 : TileType.FLOOR_2;

      const roomDef: RoomDef = {
        status,
        col: origin.col,
        row: origin.row,
        w: ROOM_W,
        h: ROOM_H,
        floorType,
        floorColor: colors.floor,
        wallColor: colors.wall,
        label: colors.label,
        accentColor: colors.accent,
      };
      rooms.push(roomDef);

      // Fill walls
      for (let r = 0; r < FULL_ROOM_H; r++) {
        for (let c = 0; c < FULL_ROOM_W; c++) {
          const tr = topLeft.row + r;
          const tc = topLeft.col + c;
          if (tr >= 0 && tr < GRID_ROWS && tc >= 0 && tc < GRID_COLS) {
            const isWallTop = r < WALL_TOP;
            const isWallBottom = r >= WALL_TOP + ROOM_H;
            const isWallLeft = c < WALL_SIDE;
            const isWallRight = c >= WALL_SIDE + ROOM_W;

            if (isWallTop || isWallBottom || isWallLeft || isWallRight) {
              tileMap[tr][tc] = TileType.WALL;
            } else {
              tileMap[tr][tc] = floorType;
            }
          }
        }
      }

      // Door openings — bottom wall, centered
      const doorCol = topLeft.col + WALL_SIDE + Math.floor((ROOM_W - DOOR_W) / 2);
      const doorRow = topLeft.row + WALL_TOP + ROOM_H; // bottom wall row
      for (let d = 0; d < DOOR_W; d++) {
        if (doorRow < GRID_ROWS) {
          tileMap[doorRow][doorCol + d] = TileType.FLOOR_3;
        }
      }

      // Right wall door (connect to corridor on the right, except last column)
      if (gc < ROOMS_PER_ROW - 1) {
        const rightDoorRow = topLeft.row + WALL_TOP + Math.floor((ROOM_H - DOOR_W) / 2);
        const rightDoorCol = topLeft.col + FULL_ROOM_W - 1; // rightmost wall column
        for (let d = 0; d < DOOR_W; d++) {
          tileMap[rightDoorRow + d][rightDoorCol] = TileType.FLOOR_3;
        }
      }

      // Place 4 workstations in the room
      placeWorkstations(origin, status, gc, gr, seats, furniture, blockedTiles);

      // Place decorative furniture
      placeDecorations(origin, status, furniture, blockedTiles);
    }
  }

  // Fill corridors between rooms
  fillCorridors(tileMap);

  return {
    tileMap,
    rooms,
    seats,
    furniture,
    blockedTiles,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
  };
}

/** Place 4 desk+chair workstations in a room */
function placeWorkstations(
  origin: { col: number; row: number },
  status: TaskStatus,
  gridCol: number,
  gridRow: number,
  seats: Map<string, Seat>,
  furniture: FurnitureInstance[],
  blockedTiles: Set<string>,
): void {
  // 4 workstations: 2 on left side, 2 on right side
  // Each workstation: desk (2x2) + monitor on desk + chair (1x1)
  // Chair is where the agent sits; agent faces the desk
  const workstations = [
    // Left pair — chair to the right of desk, facing LEFT toward desk
    { deskCol: 1, deskRow: 1, chairCol: 3, chairRow: 2, facing: Direction.LEFT },
    { deskCol: 1, deskRow: 4, chairCol: 3, chairRow: 5, facing: Direction.LEFT },
    // Right pair — chair to the left of desk, facing RIGHT toward desk
    { deskCol: 11, deskRow: 1, chairCol: 10, chairRow: 2, facing: Direction.RIGHT },
    { deskCol: 11, deskRow: 4, chairCol: 10, chairRow: 5, facing: Direction.RIGHT },
  ];

  for (let i = 0; i < workstations.length; i++) {
    const ws = workstations[i];
    const deskX = (origin.col + ws.deskCol) * TILE_SIZE;
    const deskY = (origin.row + ws.deskRow) * TILE_SIZE;
    const chairX = (origin.col + ws.chairCol) * TILE_SIZE;
    const chairY = (origin.row + ws.chairRow) * TILE_SIZE;

    // Desk sprite (2x2 tiles = 32x32 pixels)
    furniture.push({
      spriteKey: 'desk',
      x: deskX,
      y: deskY,
      zY: deskY + TILE_SIZE * 2,
    });

    // Monitor centered on desk surface (offset 8px right to center the 16px monitor on 32px desk)
    furniture.push({
      spriteKey: 'pc',
      x: deskX + 8,
      y: deskY - 4, // Slightly above desk surface
      zY: deskY + TILE_SIZE, // Z-sort in front of desk back, behind characters
    });

    // Chair
    furniture.push({
      spriteKey: 'chair',
      x: chairX,
      y: chairY,
      zY: chairY + TILE_SIZE,
    });

    // Block desk tiles (2x2)
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        blockedTiles.add(`${origin.col + ws.deskCol + dc},${origin.row + ws.deskRow + dr}`);
      }
    }

    // Seat: the chair tile is where the character sits
    const seatId = `${status}-${gridCol}-${gridRow}-${i}`;
    seats.set(seatId, {
      uid: seatId,
      seatCol: origin.col + ws.chairCol,
      seatRow: origin.row + ws.chairRow,
      facingDir: ws.facing,
      assigned: false,
    });
  }
}

/** Place decorative furniture based on room status.
 * NOTE: Row 0 of the interior is reserved for room labels — place decorations at row 1+ */
function placeDecorations(
  origin: { col: number; row: number },
  status: TaskStatus,
  furniture: FurnitureInstance[],
  blockedTiles: Set<string>,
): void {
  // Plant in bottom-right corner (away from label area)
  const plantCol = origin.col + ROOM_W - 2;
  const plantRow = origin.row + ROOM_H - 2;
  furniture.push({
    spriteKey: 'plant',
    x: plantCol * TILE_SIZE,
    y: plantRow * TILE_SIZE,
    zY: (plantRow + 1) * TILE_SIZE,
  });
  blockedTiles.add(`${plantCol},${plantRow}`);

  // Lamp in bottom area
  const lampCol = origin.col + 5;
  const lampRow = origin.row + ROOM_H - 1;
  furniture.push({
    spriteKey: 'lamp',
    x: lampCol * TILE_SIZE,
    y: lampRow * TILE_SIZE,
    zY: (lampRow + 1) * TILE_SIZE,
  });
  blockedTiles.add(`${lampCol},${lampRow}`);

  // Status-specific decorations — all placed in interior, never on wall/label rows
  switch (status) {
    case 'in_progress':
    case 'review': {
      // Whiteboard in mid-room area
      const wbCol = origin.col + 7;
      const wbRow = origin.row + ROOM_H - 1;
      furniture.push({
        spriteKey: 'whiteboard',
        x: wbCol * TILE_SIZE,
        y: wbRow * TILE_SIZE,
        zY: (wbRow + 1) * TILE_SIZE,
      });
      blockedTiles.add(`${wbCol},${wbRow}`);
      break;
    }
    case 'blocked':
    case 'changes_requested': {
      // Bookshelf in bottom area
      const bsCol = origin.col + 7;
      const bsRow = origin.row + ROOM_H - 2;
      furniture.push({
        spriteKey: 'bookshelf',
        x: bsCol * TILE_SIZE,
        y: bsRow * TILE_SIZE,
        zY: (bsRow + 1) * TILE_SIZE,
      });
      blockedTiles.add(`${bsCol},${bsRow}`);
      break;
    }
    case 'done':
    case 'created': {
      // Water cooler in bottom-right
      const wcCol = origin.col + ROOM_W - 3;
      const wcRow = origin.row + ROOM_H - 1;
      furniture.push({
        spriteKey: 'cooler',
        x: wcCol * TILE_SIZE,
        y: wcRow * TILE_SIZE,
        zY: (wcRow + 1) * TILE_SIZE,
      });
      blockedTiles.add(`${wcCol},${wcRow}`);
      break;
    }
    default:
      break;
  }
}

/** Fill corridors with walkable floor tiles */
function fillCorridors(tileMap: TileTypeVal[][]): void {
  // Horizontal corridors between rooms in the same row
  for (let gr = 0; gr < ROWS; gr++) {
    for (let gc = 0; gc < ROOMS_PER_ROW - 1; gc++) {
      const leftRoom = roomTopLeft(gc, gr);
      const corridorStartCol = leftRoom.col + FULL_ROOM_W;
      const corridorRow = leftRoom.row + WALL_TOP;

      for (let r = 0; r < ROOM_H; r++) {
        for (let c = 0; c < CORRIDOR_W; c++) {
          const tr = corridorRow + r;
          const tc = corridorStartCol + c;
          if (tr >= 0 && tr < GRID_ROWS && tc >= 0 && tc < GRID_COLS) {
            tileMap[tr][tc] = TileType.FLOOR_4;
          }
        }
      }
    }
  }

  // Vertical corridors between rooms in the same column
  for (let gr = 0; gr < ROWS - 1; gr++) {
    for (let gc = 0; gc < ROOMS_PER_ROW; gc++) {
      const topRoom = roomTopLeft(gc, gr);
      const corridorStartRow = topRoom.row + FULL_ROOM_H;
      const corridorCol = topRoom.col + WALL_SIDE;

      for (let r = 0; r < CORRIDOR_W; r++) {
        for (let c = 0; c < ROOM_W; c++) {
          const tr = corridorStartRow + r;
          const tc = corridorCol + c;
          if (tr >= 0 && tr < GRID_ROWS && tc >= 0 && tc < GRID_COLS) {
            tileMap[tr][tc] = TileType.FLOOR_4;
          }
        }
      }
    }
  }

  // Corridor intersections (where horizontal and vertical corridors meet)
  for (let gr = 0; gr < ROWS - 1; gr++) {
    for (let gc = 0; gc < ROOMS_PER_ROW - 1; gc++) {
      const topRoom = roomTopLeft(gc, gr);
      const intersectCol = topRoom.col + FULL_ROOM_W;
      const intersectRow = topRoom.row + FULL_ROOM_H;

      for (let r = 0; r < CORRIDOR_W; r++) {
        for (let c = 0; c < CORRIDOR_W; c++) {
          const tr = intersectRow + r;
          const tc = intersectCol + c;
          if (tr >= 0 && tr < GRID_ROWS && tc >= 0 && tc < GRID_COLS) {
            tileMap[tr][tc] = TileType.FLOOR_4;
          }
        }
      }
    }
  }
}

/** Get the RoomDef for a given task status */
export function getRoomForStatus(rooms: RoomDef[], status: TaskStatus): RoomDef | undefined {
  return rooms.find(r => r.status === status);
}

/** Get an available seat in a room, or null if all are taken */
export function getSeatInRoom(
  seats: Map<string, Seat>,
  status: TaskStatus,
): Seat | null {
  for (const [, seat] of seats) {
    if (seat.uid.startsWith(status + '-') && !seat.assigned) {
      return seat;
    }
  }
  return null;
}

/** Get a spawn point (walkable tile near the door) for a room */
export function getSpawnPointInRoom(
  room: RoomDef,
): { col: number; row: number } {
  // Spawn near the bottom-center of the room (by the door)
  return {
    col: room.col + Math.floor(room.w / 2),
    row: room.row + room.h - 1,
  };
}

export { GRID_COLS, GRID_ROWS };
