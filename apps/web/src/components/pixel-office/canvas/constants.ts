import type { TaskStatus } from '@agenthub/shared';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_DEFAULT = 3;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;

// ── Room Colors per TaskStatus ────────────────────────────────
export const ROOM_COLORS: Record<TaskStatus, { floor: string; wall: string; accent: string; label: string }> = {
  created: { floor: '#D97706', wall: '#1F2937', accent: '#3B82F6', label: 'Backlog' },
  assigned: { floor: '#6366F1', wall: '#1F2937', accent: '#6366F1', label: 'Assigned' },
  in_progress: { floor: '#84CC16', wall: '#1F2937', accent: '#F59E0B', label: 'In Progress' },
  blocked: { floor: '#6B7280', wall: '#111827', accent: '#6B7280', label: 'Blocked' },
  review: { floor: '#A855F7', wall: '#1F2937', accent: '#8B5CF6', label: 'Review' },
  changes_requested: { floor: '#F59E0B', wall: '#1F2937', accent: '#F97316', label: 'Changes' },
  done: { floor: '#34D399', wall: '#1F2937', accent: '#22C55E', label: 'Done' },
  cancelled: { floor: '#737373', wall: '#171717', accent: '#737373', label: 'Cancelled' },
  failed: { floor: '#FB7185', wall: '#1F2937', accent: '#EF4444', label: 'Failed' },
};

// ── Name Label ───────────────────────────────────────────────
export const NAME_LABEL_FONT_SIZE = 8;
export const NAME_LABEL_OFFSET_Y = 4;
export const STATUS_DOT_RADIUS = 3;
