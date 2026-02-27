import type { TaskStatus } from '@agenthub/shared';

export const TILE_SIZE = 16;

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  VOID: 8,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** An image or canvas containing the sprite pixels */
export type SpriteData = HTMLImageElement | HTMLCanvasElement;

export interface Seat {
  uid: string;
  seatCol: number;
  seatRow: number;
  facingDir: Direction;
  assigned: boolean;
}

export type FurnitureSpriteKey = 'desk' | 'chair' | 'pc' | 'plant' | 'bookshelf' | 'cooler' | 'whiteboard' | 'lamp';

export interface FurnitureInstance {
  spriteKey: FurnitureSpriteKey;
  x: number;
  y: number;
  zY: number;
}

export interface RoomDef {
  status: TaskStatus;
  /** Top-left tile col of the room interior */
  col: number;
  /** Top-left tile row of the room interior */
  row: number;
  /** Interior width in tiles */
  w: number;
  /** Interior height in tiles */
  h: number;
  /** Floor tile type */
  floorType: TileType;
  /** Floor base color */
  floorColor: string;
  /** Wall color */
  wallColor: string;
  /** Sign/label text */
  label: string;
  /** Accent color for sign */
  accentColor: string;
}

export interface Character {
  id: string;
  state: CharacterState;
  dir: Direction;
  x: number;
  y: number;
  tileCol: number;
  tileRow: number;
  path: Array<{ col: number; row: number }>;
  moveProgress: number;
  palette: number;
  hueShift: number;
  frame: number;
  frameTimer: number;
  wanderTimer: number;
  wanderCount: number;
  wanderLimit: number;
  isActive: boolean;
  seatId: string | null;
  matrixEffect: 'spawn' | 'despawn' | null;
  matrixEffectTimer: number;
  matrixEffectSeeds: number[];
  /** AgentHub-specific: task ID this character is associated with */
  taskId: string;
  /** AgentHub-specific: room status the character is in */
  roomId: TaskStatus;
  /** AgentHub-specific: display name */
  agentName: string;
  /** AgentHub-specific: agent accent color */
  agentColor: string;
}
