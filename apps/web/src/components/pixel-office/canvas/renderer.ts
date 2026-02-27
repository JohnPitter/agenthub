import { TileType, TILE_SIZE, CharacterState } from './types';
import type { Character, FurnitureInstance, RoomDef, TileType as TileTypeVal } from './types';
import { getCachedSprite, getOutlineSprite } from './sprite-cache';
import { getCharacterSpritesSync, getFurnitureSprite } from './sprites';
import { getCharacterSprite } from './characters';
import { renderMatrixEffect } from './matrix-effect';
import {
  ROOM_COLORS,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  NAME_LABEL_FONT_SIZE,
  NAME_LABEL_OFFSET_Y,
  STATUS_DOT_RADIUS,
} from './constants';
import type { OfficeState } from './office-state';

// ── Floor tile colors ─────────────────────────────────────────
const WALL_COLOR = '#1F2937';
const CORRIDOR_COLOR = '#4B5563';
const VOID_COLOR = '#1a472a';  // Dark green grass

const FLOOR_COLORS: Record<number, string> = {
  [TileType.FLOOR_1]: '#f5e6c8',
  [TileType.FLOOR_2]: '#e8d5b0',
  [TileType.FLOOR_3]: '#9CA3AF', // Door/corridor accent
  [TileType.FLOOR_4]: CORRIDOR_COLOR,
};

interface ZSortItem {
  type: 'furniture' | 'character';
  zY: number;
  item: FurnitureInstance | Character;
}

/** Main render function — call each frame */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: OfficeState,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number,
  hoveredCharacterId: string | null,
): void {
  // Clear canvas
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Layer 1: Floor tiles
  renderFloor(ctx, state.tileMap, state.rooms, zoom, state.gridCols, state.gridRows);

  // Layer 2: Z-sorted scene (furniture + characters)
  renderScene(ctx, state, zoom, hoveredCharacterId);

  // Layer 3: Name labels above characters
  renderNameLabels(ctx, state.characters, zoom);

  // Layer 4: Room labels (rendered last so they're always on top)
  renderRoomLabels(ctx, state.rooms, state.characters, zoom);

  ctx.restore();
}

/** Render floor tiles */
function renderFloor(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  rooms: RoomDef[],
  zoom: number,
  gridCols: number,
  gridRows: number,
): void {
  const ts = TILE_SIZE * zoom;

  // Build a map of room floor colors by tile position for accurate coloring
  const roomFloorMap = new Map<string, string>();
  for (const room of rooms) {
    const colors = ROOM_COLORS[room.status];
    for (let r = 0; r < room.h; r++) {
      for (let c = 0; c < room.w; c++) {
        roomFloorMap.set(`${room.col + c},${room.row + r}`, colors.floor);
      }
    }
  }

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tile = tileMap[row]?.[col] ?? TileType.VOID;
      const x = col * ts;
      const y = row * ts;

      switch (tile) {
        case TileType.VOID:
          // Grass pattern
          ctx.fillStyle = VOID_COLOR;
          ctx.fillRect(x, y, ts, ts);
          // Add subtle grass texture variation
          if ((col + row) % 3 === 0) {
            ctx.fillStyle = '#1e5631';
            ctx.fillRect(x, y, ts, ts);
          }
          break;
        case TileType.WALL: {
          // Use room-specific wall color if we can determine the room
          ctx.fillStyle = WALL_COLOR;
          ctx.fillRect(x, y, ts, ts);
          // Subtle wall pattern
          if ((col + row) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(x, y, ts, ts);
          }
          break;
        }
        case TileType.FLOOR_1:
        case TileType.FLOOR_2: {
          // Use room-specific floor color
          const roomColor = roomFloorMap.get(`${col},${row}`);
          if (roomColor) {
            ctx.fillStyle = roomColor;
            ctx.globalAlpha = 0.15;
            ctx.fillRect(x, y, ts, ts);
            ctx.globalAlpha = 1;
            // Base floor
            ctx.fillStyle = FLOOR_COLORS[tile] ?? '#f5e6c8';
            ctx.fillRect(x, y, ts, ts);
            // Tinted overlay
            ctx.fillStyle = roomColor;
            ctx.globalAlpha = 0.12;
            ctx.fillRect(x, y, ts, ts);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = FLOOR_COLORS[tile] ?? '#f5e6c8';
            ctx.fillRect(x, y, ts, ts);
          }
          // Checkerboard pattern
          if ((col + row) % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.04)';
            ctx.fillRect(x, y, ts, ts);
          }
          break;
        }
        case TileType.FLOOR_3:
        case TileType.FLOOR_4:
          ctx.fillStyle = FLOOR_COLORS[tile] ?? CORRIDOR_COLOR;
          ctx.fillRect(x, y, ts, ts);
          if ((col + row) % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            ctx.fillRect(x, y, ts, ts);
          }
          break;
      }
    }
  }
}

/** Render room labels on the wall section */
function renderRoomLabels(
  ctx: CanvasRenderingContext2D,
  rooms: RoomDef[],
  characters: Map<string, Character>,
  zoom: number,
): void {
  const ts = TILE_SIZE * zoom;
  const fontSize = Math.max(8, Math.floor(10 * zoom / 3));

  for (const room of rooms) {
    const colors = ROOM_COLORS[room.status];

    // Count characters in this room
    let count = 0;
    for (const ch of characters.values()) {
      if (ch.roomId === room.status) count++;
    }

    // Label position: centered on wall above room interior
    const labelX = (room.col + room.w / 2) * ts;
    const labelY = (room.row - 1) * ts + ts / 2;

    // Background pill
    ctx.font = `bold ${fontSize}px monospace`;
    const text = `${room.label} (${count})`;
    const textWidth = ctx.measureText(text).width;
    const pillW = textWidth + fontSize * 1.2;
    const pillH = fontSize * 1.6;

    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    const r = pillH / 2;
    ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, r);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, labelX, labelY);
  }
}

/** Z-sorted rendering of furniture and characters */
function renderScene(
  ctx: CanvasRenderingContext2D,
  state: OfficeState,
  zoom: number,
  hoveredCharacterId: string | null,
): void {
  // Collect all items for z-sorting
  const items: ZSortItem[] = [];

  for (const f of state.furniture) {
    items.push({ type: 'furniture', zY: f.zY, item: f });
  }

  for (const ch of state.characters.values()) {
    const zY = ch.y + CHARACTER_Z_SORT_OFFSET;
    items.push({ type: 'character', zY, item: ch });
  }

  // Sort by Y position (painter's algorithm)
  items.sort((a, b) => a.zY - b.zY);

  for (const entry of items) {
    if (entry.type === 'furniture') {
      const f = entry.item as FurnitureInstance;
      const sprite = getFurnitureSprite(f.spriteKey);
      if (!sprite) continue; // Not loaded yet
      const cached = getCachedSprite(sprite, zoom);
      ctx.drawImage(cached, f.x * zoom, f.y * zoom);
    } else {
      const ch = entry.item as Character;
      renderCharacter(ctx, ch, zoom, hoveredCharacterId === ch.id);
    }
  }
}

/** Render a single character */
function renderCharacter(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  zoom: number,
  isHovered: boolean,
): void {
  const sprites = getCharacterSpritesSync(ch.palette);
  if (!sprites) return; // Wait for load

  const spriteData = getCharacterSprite(ch, sprites);

  // Character sprite from characters.ts is always 16x24
  const spriteW = spriteData.width;
  const spriteH = spriteData.height;

  // Center horizontally on tile, offset vertically so feet are at tile center
  const drawX = ch.x * zoom - (spriteW * zoom) / 2;
  let drawY = ch.y * zoom - (spriteH * zoom) + (TILE_SIZE * zoom) / 2;

  // Sitting offset when typing at a desk
  if (ch.state === CharacterState.TYPE && ch.seatId) {
    drawY += CHARACTER_SITTING_OFFSET_PX * zoom;
  }

  // Matrix effect
  if (ch.matrixEffect) {
    renderMatrixEffect(ctx, ch, spriteData, drawX, drawY, zoom);
    return;
  }

  // Hover outline
  if (isHovered) {
    const outline = getOutlineSprite(spriteData);
    const outlineCached = getCachedSprite(outline, zoom);
    ctx.drawImage(outlineCached, drawX - zoom, drawY - zoom);
  }

  // Draw character sprite
  const cached = getCachedSprite(spriteData, zoom);
  ctx.drawImage(cached, drawX, drawY);
}

/** Render name labels above characters */
function renderNameLabels(
  ctx: CanvasRenderingContext2D,
  characters: Map<string, Character>,
  zoom: number,
): void {
  const fontSize = Math.max(7, Math.floor(NAME_LABEL_FONT_SIZE * zoom / 3));

  for (const ch of characters.values()) {
    if (ch.matrixEffect) continue;

    const spriteH = 24; // Character sprite height in pixels
    const labelX = ch.x * zoom;
    const labelY = ch.y * zoom - spriteH * zoom + (TILE_SIZE * zoom) / 2 - NAME_LABEL_OFFSET_Y * zoom;

    // Name text
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Background for readability
    const name = ch.agentName || ch.id;
    const textWidth = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(
      labelX - textWidth / 2 - 2,
      labelY - fontSize - 2,
      textWidth + 4,
      fontSize + 3,
    );

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, labelX, labelY);

    // Status dot
    const dotX = labelX + textWidth / 2 + STATUS_DOT_RADIUS + 3;
    const dotY = labelY - fontSize / 2 - 1;
    ctx.beginPath();
    ctx.arc(dotX, dotY, STATUS_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = ch.isActive ? '#22C55E' : '#6B7280';
    ctx.fill();
  }
}
