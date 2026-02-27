import { CharacterState, Direction, TILE_SIZE } from './types';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from './types';
import type { CharacterSprites } from './sprites';
import { findPath } from './tile-map';
import {
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
} from './constants';
import type { TaskStatus } from '@agenthub/shared';

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(
  id: string,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift: number,
  taskId: string,
  roomId: TaskStatus,
  agentName: string,
  agentColor: string,
): Character {
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    taskId,
    roomId,
    agentName,
    agentColor,
  };
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.frameTimer += dt;

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      if (!ch.isActive) {
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
      ch.frame = 0;
      if (ch.isActive) {
        if (!ch.seatId) {
          ch.state = CharacterState.TYPE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }
        const seat = seats.get(ch.seatId);
        if (seat) {
          const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
          } else {
            ch.state = CharacterState.TYPE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
        break;
      }
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0) {
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
        }
        if (walkableTiles.length > 0) {
          const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles);
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }

    case CharacterState.WALK: {
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        if (ch.isActive) {
          if (!ch.seatId) {
            ch.state = CharacterState.TYPE;
          } else {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
            } else {
              ch.state = CharacterState.IDLE;
            }
          }
        } else {
          if (ch.seatId) {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              ch.wanderCount = 0;
              ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      const nextTile = ch.path[0];
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

      if (ch.moveProgress >= 1) {
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }

      if (ch.isActive && ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1];
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }
  }
}

/**
 * Sprite sheet layout (112×96 = 7 cols × 3 rows of 16×32 frames):
 *
 * Rows: 0=Down, 1=Up, 2=Right  (Left = horizontal flip of Right)
 * Cols: 0=Walk1, 1=Walk2(idle), 2=Walk3, 3=Type1, 4=Type2, 5=Read1, 6=Read2
 *
 * Walk cycle: 0→1→2→1 (4-step with frame 1 as standing/idle)
 * Type cycle: 3↔4
 * Idle: frame 1 (standing pose)
 */
const WALK_FRAME_SEQUENCE = [0, 1, 2, 1];

// Map Direction to sprite sheet row (LEFT uses RIGHT row + flip)
const DIR_TO_ROW: Record<number, number> = {
  [Direction.DOWN]: 0,
  [Direction.UP]: 1,
  [Direction.RIGHT]: 2,
  [Direction.LEFT]: 2, // Flipped at render time
};

// Frame cache to avoid creating a new canvas every frame
const frameCacheMap = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const FRAME_W = 16;
  const FRAME_H = 32; // Full frame height in the sheet (includes 8px top padding)
  const DRAW_H = 24; // Visible character height (bottom-aligned in frame)
  const TOP_PAD = FRAME_H - DRAW_H; // 8px transparent padding at top

  const row = DIR_TO_ROW[ch.dir];
  let col: number;

  if (ch.state === CharacterState.TYPE) {
    col = 3 + (ch.frame % 2); // frames 3,4
  } else if (ch.state === CharacterState.WALK) {
    col = WALK_FRAME_SEQUENCE[ch.frame % 4]; // frames 0,1,2,1
  } else {
    col = 1; // idle = standing pose
  }

  const needsFlip = ch.dir === Direction.LEFT;
  const cacheKey = `${row}-${col}-${needsFlip ? 'f' : 'n'}`;

  // Check cache
  let sheetCache = frameCacheMap.get(sprites.sheet);
  if (!sheetCache) {
    sheetCache = new Map();
    frameCacheMap.set(sprites.sheet, sheetCache);
  }
  const cached = sheetCache.get(cacheKey);
  if (cached) return cached;

  // Extract the 16×24 visible portion (skip top padding)
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = DRAW_H;
  const ctx = canvas.getContext('2d')!;

  if (needsFlip) {
    ctx.save();
    ctx.translate(FRAME_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      sprites.sheet,
      col * FRAME_W, row * FRAME_H + TOP_PAD, FRAME_W, DRAW_H,
      0, 0, FRAME_W, DRAW_H,
    );
    ctx.restore();
  } else {
    ctx.drawImage(
      sprites.sheet,
      col * FRAME_W, row * FRAME_H + TOP_PAD, FRAME_W, DRAW_H,
      0, 0, FRAME_W, DRAW_H,
    );
  }

  sheetCache.set(cacheKey, canvas);
  return canvas;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
