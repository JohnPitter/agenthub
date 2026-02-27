import type { SpriteData, FurnitureSpriteKey } from './types';

// Cache for loaded images
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Load an image from an async source
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    if (imageCache.has(src)) {
        return Promise.resolve(imageCache.get(src)!);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            imageCache.set(src, img);
            resolve(img);
        };
        img.onerror = (e) => {
            console.error(`Failed to load sprite: ${src}`);
            reject(e);
        };
        img.src = src;
    });
}

// ── Furniture Sprites ───────────────────────────────────────────

const furnitureSprites = new Map<FurnitureSpriteKey, SpriteData>();

/** Resolve a furniture sprite by key. Returns null if not yet loaded. */
export function getFurnitureSprite(key: FurnitureSpriteKey): SpriteData | null {
    return furnitureSprites.get(key) ?? null;
}

// ── Character Sprites ───────────────────────────────────────────

// To keep things simple, we'll map palettes to the 6 char PNGs we copied
const CHAR_MAP = [
    '/assets/pixel-office/characters/char_0.png',
    '/assets/pixel-office/characters/char_1.png',
    '/assets/pixel-office/characters/char_2.png',
    '/assets/pixel-office/characters/char_3.png',
    '/assets/pixel-office/characters/char_4.png',
    '/assets/pixel-office/characters/char_5.png',
];

export interface CharacterSprites {
    sheet: HTMLImageElement;
}

const charSpriteCache = new Map<number, CharacterSprites>();

// The reference project has sprite sheets where character animations are laid out.
// But as a simplification, let's load the full character sheet and slice it in characters.ts
export async function loadCharacterSprites(paletteIndex: number): Promise<CharacterSprites> {
    const index = paletteIndex % CHAR_MAP.length;
    const src = CHAR_MAP[index];

    if (charSpriteCache.has(index)) {
        return charSpriteCache.get(index)!;
    }

    const sheet = await loadImage(src);
    const sprites = { sheet };
    charSpriteCache.set(index, sprites);
    return sprites;
}

export function getCharacterSpritesSync(paletteIndex: number): CharacterSprites | null {
    const index = paletteIndex % CHAR_MAP.length;
    return charSpriteCache.get(index) || null;
}

// ── Preloader ──────────────────────────────────────────────

export async function preloadAllAssets(): Promise<void> {
    const loads = [
        // Preload characters
        ...CHAR_MAP.map(src => loadImage(src).then((img) => {
            const idx = CHAR_MAP.indexOf(src);
            charSpriteCache.set(idx, { sheet: img });
        })),
        // Currently, furniture in reference was built via pixel arrays or separate images.
        // For now, if we don't have the furniture images explicitly, we can load a fallback or empty canvas.
        // Let's create dummy 1x1 canvases for furniture that aren't mapped yet, to prevent crashes.
    ];

    await Promise.all(loads);

    // Pixel art furniture sprites
    furnitureSprites.set('desk', makeDesk());
    furnitureSprites.set('chair', makeChair());
    furnitureSprites.set('pc', makeMonitor());
    furnitureSprites.set('plant', makePlant());
    furnitureSprites.set('bookshelf', makeBookshelf());
    furnitureSprites.set('cooler', makeCooler());
    furnitureSprites.set('whiteboard', makeWhiteboard());
    furnitureSprites.set('lamp', makeLamp());
}

// ── Pixel Art Furniture Factories ────────────────────────────────

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')!];
}

/** 32×32 wooden desk (2×2 tiles) */
function makeDesk(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(32, 32);
    // Table top
    ctx.fillStyle = '#A0724E';
    ctx.fillRect(0, 0, 32, 4);
    // Table top highlight
    ctx.fillStyle = '#B8875F';
    ctx.fillRect(1, 0, 30, 2);
    // Table top shadow
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(0, 4, 32, 2);
    // Front panel
    ctx.fillStyle = '#7A5030';
    ctx.fillRect(0, 6, 32, 10);
    // Panel detail lines
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(0, 6, 32, 1);
    ctx.fillRect(15, 6, 2, 10);
    // Legs
    ctx.fillStyle = '#5C3A20';
    ctx.fillRect(1, 16, 3, 16);
    ctx.fillRect(28, 16, 3, 16);
    // Leg shadows
    ctx.fillStyle = '#4A2E18';
    ctx.fillRect(1, 16, 1, 16);
    ctx.fillRect(28, 16, 1, 16);
    return c;
}

/** 16×16 office chair */
function makeChair(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 16);
    // Seat cushion
    ctx.fillStyle = '#4A5568';
    ctx.fillRect(3, 6, 10, 5);
    ctx.fillStyle = '#5A6578';
    ctx.fillRect(4, 6, 8, 3);
    // Back rest
    ctx.fillStyle = '#3D4555';
    ctx.fillRect(4, 1, 8, 6);
    ctx.fillStyle = '#4A5568';
    ctx.fillRect(5, 2, 6, 4);
    // Base pole
    ctx.fillStyle = '#2D3748';
    ctx.fillRect(7, 11, 2, 3);
    // Wheels
    ctx.fillStyle = '#1A202C';
    ctx.fillRect(3, 14, 3, 2);
    ctx.fillRect(10, 14, 3, 2);
    return c;
}

/** 16×16 computer monitor on desk */
function makeMonitor(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 16);
    // Monitor frame
    ctx.fillStyle = '#2D3748';
    ctx.fillRect(1, 0, 14, 11);
    // Screen
    ctx.fillStyle = '#1E40AF';
    ctx.fillRect(2, 1, 12, 8);
    // Screen glow/content
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(3, 2, 4, 1);
    ctx.fillRect(3, 4, 8, 1);
    ctx.fillRect(3, 6, 6, 1);
    // Screen highlight
    ctx.fillStyle = '#60A5FA';
    ctx.fillRect(3, 2, 3, 1);
    // Monitor stand
    ctx.fillStyle = '#4A5568';
    ctx.fillRect(6, 11, 4, 2);
    // Monitor base
    ctx.fillStyle = '#374151';
    ctx.fillRect(4, 13, 8, 2);
    return c;
}

/** 16×24 potted plant */
function makePlant(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 24);
    // Leaves
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(5, 0, 6, 3);
    ctx.fillRect(3, 3, 10, 4);
    ctx.fillRect(1, 5, 14, 4);
    ctx.fillRect(3, 9, 10, 3);
    // Darker leaf patches
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(4, 4, 3, 3);
    ctx.fillRect(9, 6, 3, 2);
    ctx.fillRect(6, 1, 2, 2);
    // Stem
    ctx.fillStyle = '#15803D';
    ctx.fillRect(7, 12, 2, 3);
    // Pot
    ctx.fillStyle = '#B45309';
    ctx.fillRect(3, 15, 10, 2);
    ctx.fillRect(4, 17, 8, 5);
    ctx.fillRect(5, 22, 6, 2);
    // Pot rim highlight
    ctx.fillStyle = '#D97706';
    ctx.fillRect(4, 15, 8, 1);
    return c;
}

/** 16×32 bookshelf */
function makeBookshelf(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 32);
    // Frame
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0, 0, 16, 32);
    // Shelves (4 shelves)
    ctx.fillStyle = '#92400E';
    for (let i = 0; i < 4; i++) {
        const y = i * 8;
        ctx.fillRect(1, y + 1, 14, 6);
    }
    // Books on each shelf
    const bookColors = ['#DC2626', '#2563EB', '#16A34A', '#9333EA', '#EA580C', '#0891B2'];
    for (let shelf = 0; shelf < 4; shelf++) {
        const y = shelf * 8 + 1;
        let x = 2;
        for (let b = 0; b < 4; b++) {
            const bw = 2 + (b % 2);
            ctx.fillStyle = bookColors[(shelf * 4 + b) % bookColors.length];
            ctx.fillRect(x, y, bw, 6);
            x += bw + 1;
        }
    }
    return c;
}

/** 16×24 water cooler */
function makeCooler(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 24);
    // Water bottle (top)
    ctx.fillStyle = '#93C5FD';
    ctx.fillRect(5, 0, 6, 8);
    ctx.fillStyle = '#BFDBFE';
    ctx.fillRect(6, 1, 4, 6);
    // Bottle neck
    ctx.fillStyle = '#60A5FA';
    ctx.fillRect(6, 8, 4, 2);
    // Body
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(3, 10, 10, 10);
    // Spigot
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(2, 13, 2, 2);
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(12, 13, 2, 2);
    // Base
    ctx.fillStyle = '#D1D5DB';
    ctx.fillRect(4, 20, 8, 4);
    return c;
}

/** 32×16 whiteboard */
function makeWhiteboard(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(32, 16);
    // Frame
    ctx.fillStyle = '#9CA3AF';
    ctx.fillRect(0, 0, 32, 16);
    // White surface
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(2, 2, 28, 11);
    // Scribbles
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(4, 4, 10, 1);
    ctx.fillRect(4, 7, 14, 1);
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(4, 10, 8, 1);
    // Tray
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(4, 13, 24, 2);
    // Markers on tray
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(6, 13, 3, 1);
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(10, 13, 3, 1);
    return c;
}

/** 16×16 desk lamp */
function makeLamp(): HTMLCanvasElement {
    const [c, ctx] = makeCanvas(16, 16);
    // Lamp shade
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(3, 0, 10, 5);
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(4, 0, 8, 4);
    // Light glow
    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(5, 5, 6, 2);
    // Arm
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(7, 5, 2, 6);
    // Base
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(4, 11, 8, 2);
    ctx.fillRect(5, 13, 6, 2);
    return c;
}
