import type { SpriteData } from './types';

const zoomCaches = new Map<number, WeakMap<SpriteData, HTMLCanvasElement>>();

// ── Outline sprite generation ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>();

/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite);
  if (cached) return cached;

  const w = sprite.width;
  const h = sprite.height;

  // Render to a temporary canvas to get image data
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.drawImage(sprite, 0, 0);
  const imgData = tempCtx.getImageData(0, 0, w, h).data;

  // Resulting canvas for the outline, +2 on each side
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w + 2;
  outCanvas.height = h + 2;
  const outCtx = outCanvas.getContext('2d')!;
  const outImgData = outCtx.createImageData(w + 2, h + 2);
  const outData = outImgData.data;

  // Fast alpha check for original pixels and their 4 neighbors
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const srcIdx = (r * w + c) * 4;
      const alpha = imgData[srcIdx + 3];

      if (alpha > 128) {
        // Original pixel is solid — mark its 4 neighbors as white on outData
        const neighbors = [
          { nr: r + 1 - 1, nc: c + 1 },     // top
          { nr: r + 1 + 1, nc: c + 1 },     // bottom
          { nr: r + 1, nc: c + 1 - 1 }, // left
          { nr: r + 1, nc: c + 1 + 1 }, // right
        ];

        for (const { nr, nc } of neighbors) {
          // If valid coordinate
          if (nr >= 0 && nr < h + 2 && nc >= 0 && nc < w + 2) {
            // Only draw outline where the original image IS NOT solid
            // We'll clean up overlapping pixels below instead of complex bounds checking
            const dstIdx = (nr * (w + 2) + nc) * 4;
            outData[dstIdx] = 255;     // R
            outData[dstIdx + 1] = 255; // G
            outData[dstIdx + 2] = 255; // B
            outData[dstIdx + 3] = 255; // A
          }
        }
      }
    }
  }

  // Clear pixels from outline that overlap with original drawing
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const srcIdx = (r * w + c) * 4;
      const alpha = imgData[srcIdx + 3];
      if (alpha > 128) {
        const dstIdx = ((r + 1) * (w + 2) + (c + 1)) * 4;
        outData[dstIdx + 3] = 0; // Transparent inner body
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  outlineCache.set(sprite, outCanvas);
  return outCanvas;
}

export function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = zoomCaches.get(zoom);
  if (!cache) {
    cache = new WeakMap();
    zoomCaches.set(zoom, cache);
  }

  const cached = cache.get(sprite);
  if (cached) return cached;

  const w = sprite.width;
  const h = sprite.height;

  const canvas = document.createElement('canvas');
  canvas.width = w * zoom;
  canvas.height = h * zoom;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Just draw the scaled image
  ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);

  cache.set(sprite, canvas);
  return canvas;
}
