import type { Character, SpriteData } from './types';
import {
  MATRIX_EFFECT_DURATION_SEC,
  MATRIX_TRAIL_LENGTH,
  MATRIX_SPRITE_COLS,
  MATRIX_SPRITE_ROWS,
  MATRIX_FLICKER_FPS,
  MATRIX_FLICKER_VISIBILITY_THRESHOLD,
  MATRIX_COLUMN_STAGGER_RANGE,
  MATRIX_HEAD_COLOR,
  MATRIX_TRAIL_OVERLAY_ALPHA,
  MATRIX_TRAIL_EMPTY_ALPHA,
  MATRIX_TRAIL_MID_THRESHOLD,
  MATRIX_TRAIL_DIM_THRESHOLD,
} from './constants';

/** Hash-based flicker: ~70% visible for shimmer effect */
function flickerVisible(col: number, row: number, time: number): boolean {
  const t = Math.floor(time * MATRIX_FLICKER_FPS);
  const hash = ((col * 7 + row * 13 + t * 31) & 0xff);
  return hash < MATRIX_FLICKER_VISIBILITY_THRESHOLD;
}

function generateSeeds(): number[] {
  const seeds: number[] = [];
  for (let i = 0; i < MATRIX_SPRITE_COLS; i++) {
    seeds.push(Math.random());
  }
  return seeds;
}

export { generateSeeds as matrixEffectSeeds };

/**
 * Render a character with a Matrix-style digital rain spawn/despawn effect.
 */
export function renderMatrixEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  spriteData: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const progress = ch.matrixEffectTimer / MATRIX_EFFECT_DURATION_SEC;
  const isSpawn = ch.matrixEffect === 'spawn';
  const time = ch.matrixEffectTimer;
  const totalSweep = MATRIX_SPRITE_ROWS + MATRIX_TRAIL_LENGTH;

  const w = spriteData.width;
  const h = spriteData.height;

  // We need to read the actual pixels to know what to draw/flicker
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.drawImage(spriteData, 0, 0);
  const imgData = tempCtx.getImageData(0, 0, w, h).data;

  for (let col = 0; col < w; col++) {
    const stagger = (ch.matrixEffectSeeds[col] ?? 0) * MATRIX_COLUMN_STAGGER_RANGE;
    const colProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - MATRIX_COLUMN_STAGGER_RANGE)));
    const headRow = colProgress * totalSweep;

    for (let row = 0; row < h; row++) {
      const pxIdx = (row * w + col) * 4;
      const r = imgData[pxIdx];
      const g = imgData[pxIdx + 1];
      const b = imgData[pxIdx + 2];
      const a = imgData[pxIdx + 3];

      const hasPixel = a > 50;
      const pixelStyle = `rgba(${r},${g},${b},${a / 255.0})`;

      const distFromHead = headRow - row;
      const px = drawX + col * zoom;
      const py = drawY + row * zoom;

      if (isSpawn) {
        if (distFromHead < 0) {
          continue;
        } else if (distFromHead < 1) {
          ctx.fillStyle = MATRIX_HEAD_COLOR;
          ctx.fillRect(px, py, zoom, zoom);
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          const trailPos = distFromHead / MATRIX_TRAIL_LENGTH;
          if (hasPixel) {
            ctx.fillStyle = pixelStyle;
            ctx.fillRect(px, py, zoom, zoom);
            const greenAlpha = (1 - trailPos) * MATRIX_TRAIL_OVERLAY_ALPHA;
            if (flickerVisible(col, row, time)) {
              ctx.fillStyle = `rgba(0, 255, 65, ${greenAlpha})`;
              ctx.fillRect(px, py, zoom, zoom);
            }
          } else {
            if (flickerVisible(col, row, time)) {
              const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA;
              ctx.fillStyle = trailPos < MATRIX_TRAIL_MID_THRESHOLD ? `rgba(0, 255, 65, ${alpha})`
                : trailPos < MATRIX_TRAIL_DIM_THRESHOLD ? `rgba(0, 170, 40, ${alpha})`
                  : `rgba(0, 85, 20, ${alpha})`;
              ctx.fillRect(px, py, zoom, zoom);
            }
          }
        } else {
          if (hasPixel) {
            ctx.fillStyle = pixelStyle;
            ctx.fillRect(px, py, zoom, zoom);
          }
        }
      } else {
        if (distFromHead < 0) {
          if (hasPixel) {
            ctx.fillStyle = pixelStyle;
            ctx.fillRect(px, py, zoom, zoom);
          }
        } else if (distFromHead < 1) {
          ctx.fillStyle = MATRIX_HEAD_COLOR;
          ctx.fillRect(px, py, zoom, zoom);
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          if (flickerVisible(col, row, time)) {
            const trailPos = distFromHead / MATRIX_TRAIL_LENGTH;
            const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA;
            ctx.fillStyle = trailPos < MATRIX_TRAIL_MID_THRESHOLD ? `rgba(0, 255, 65, ${alpha})`
              : trailPos < MATRIX_TRAIL_DIM_THRESHOLD ? `rgba(0, 170, 40, ${alpha})`
                : `rgba(0, 85, 20, ${alpha})`;
            ctx.fillRect(px, py, zoom, zoom);
          }
        }
      }
    }
  }
}
