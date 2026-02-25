/**
 * Pixel-art furniture and decorations for the Gather Town-style office.
 * Pure CSS — no external assets.
 */

/* ═══ Indoor plants ═══ */

export function PixelPlant({ variant = 0 }: { variant?: number }) {
  const v = variant % 3;
  const leaves = ["#22C55E", "#16A34A", "#4ADE80"][v];
  const pot = ["#92400E", "#78350F", "#A16207"][v];

  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div style={{ width: 12, height: 9, background: leaves, borderRadius: "4px 4px 1px 1px", border: "1px solid rgba(0,0,0,0.18)", boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.15)" }} />
      <div style={{ width: 2, height: 3, background: "#15803D" }} />
      <div style={{ width: 10, height: 6, background: pot, border: "1px solid rgba(0,0,0,0.3)", borderRadius: "0 0 2px 2px" }} />
    </div>
  );
}

/* ═══ Outdoor tree ═══ */

export function PixelTree({ variant = 0 }: { variant?: number }) {
  const isRound = variant % 2 === 0;

  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div className="relative" style={{ width: isRound ? 44 : 48, height: isRound ? 38 : 42 }}>
        {isRound ? (
          <>
            <div className="absolute" style={{ left: 7, top: 0, width: 30, height: 16, background: "#4ADE80", borderRadius: "50%", border: "2px solid #15803D", zIndex: 3 }} />
            <div className="absolute" style={{ left: 0, top: 8, width: 44, height: 22, background: "#22C55E", borderRadius: "50%", border: "2px solid #166534", zIndex: 2, boxShadow: "inset -4px -4px 0 #16A34A, inset 3px 3px 0 #4ADE80" }} />
            <div className="absolute" style={{ left: 5, top: 22, width: 34, height: 16, background: "#16A34A", borderRadius: "50%", border: "2px solid #14532D", zIndex: 1, boxShadow: "inset -3px -3px 0 #15803D" }} />
          </>
        ) : (
          <>
            <div className="absolute" style={{ left: 14, top: 0, width: 20, height: 14, background: "#4ADE80", borderRadius: "50%", border: "2px solid #15803D", zIndex: 4 }} />
            <div className="absolute" style={{ left: 6, top: 6, width: 36, height: 18, background: "#22C55E", borderRadius: "50%", border: "2px solid #166534", zIndex: 3, boxShadow: "inset 3px 3px 0 #4ADE80" }} />
            <div className="absolute" style={{ left: 0, top: 16, width: 48, height: 20, background: "#16A34A", borderRadius: "50%", border: "2px solid #14532D", zIndex: 2, boxShadow: "inset -4px -4px 0 #15803D, inset 4px 3px 0 #22C55E" }} />
            <div className="absolute" style={{ left: 8, top: 28, width: 32, height: 14, background: "#15803D", borderRadius: "50%", border: "2px solid #14532D", zIndex: 1 }} />
          </>
        )}
      </div>
      <div style={{ width: 8, height: 10, background: "linear-gradient(90deg, #6B4423, #8B5E3C, #6B4423)", border: "1px solid #4A2C11", zIndex: 5, position: "relative" }} />
      <div style={{ width: 30, height: 6, borderRadius: "50%", background: "rgba(0,0,0,0.1)", marginTop: 1 }} />
    </div>
  );
}

/* ═══ Bookshelf ═══ */

export function PixelBookshelf() {
  return (
    <div className="shrink-0 relative" style={{ width: 24, height: 22, imageRendering: "pixelated", background: "#8B6914", border: "2px solid #6B4C0E" }}>
      <div className="absolute flex gap-px" style={{ top: 2, left: 2 }}>
        <div style={{ width: 3, height: 7, background: "#EF4444" }} />
        <div style={{ width: 2, height: 7, background: "#3B82F6" }} />
        <div style={{ width: 3, height: 7, background: "#22C55E" }} />
        <div style={{ width: 3, height: 7, background: "#F59E0B" }} />
        <div style={{ width: 2, height: 7, background: "#8B5CF6" }} />
      </div>
      <div className="absolute" style={{ top: 10, left: 1, width: 20, height: 1, background: "#5C3D0E" }} />
      <div className="absolute flex gap-px" style={{ top: 12, left: 2 }}>
        <div style={{ width: 3, height: 6, background: "#EC4899" }} />
        <div style={{ width: 2, height: 6, background: "#14B8A6" }} />
        <div style={{ width: 3, height: 6, background: "#F97316" }} />
        <div style={{ width: 3, height: 6, background: "#6366F1" }} />
      </div>
    </div>
  );
}

/* ═══ Monitor (standalone) ═══ */

export function PixelMonitor({ screenColor = "#3B82F6" }: { screenColor?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div className="relative" style={{ width: 22, height: 14, background: "#1a1a1a", border: "2px solid #333" }}>
        <div style={{ position: "absolute", inset: 2, background: screenColor, opacity: 0.85 }} />
        <div style={{ position: "absolute", top: 2, left: 2, width: 4, height: 3, background: "rgba(255,255,255,0.25)" }} />
      </div>
      <div style={{ width: 4, height: 2, background: "#444" }} />
      <div style={{ width: 10, height: 2, background: "#555" }} />
    </div>
  );
}

/* ═══ Water cooler ═══ */

export function PixelWaterCooler() {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div style={{ width: 8, height: 8, background: "#BFDBFE", border: "1px solid #93C5FD", borderRadius: "2px 2px 0 0" }} />
      <div style={{ width: 10, height: 6, background: "#E5E7EB", border: "1px solid #9CA3AF" }} />
      <div className="flex" style={{ gap: 4 }}>
        <div style={{ width: 2, height: 3, background: "#6B7280" }} />
        <div style={{ width: 2, height: 3, background: "#6B7280" }} />
      </div>
    </div>
  );
}

/* ═══ Whiteboard ═══ */

export function PixelWhiteboard() {
  return (
    <div className="shrink-0 relative" style={{ width: 32, height: 20, imageRendering: "pixelated", background: "#F8FAFC", border: "2px solid #94A3B8" }}>
      <div className="absolute" style={{ top: 3, left: 4, width: 14, height: 2, background: "#3B82F6" }} />
      <div className="absolute" style={{ top: 7, left: 4, width: 10, height: 2, background: "#EF4444" }} />
      <div className="absolute" style={{ top: 11, left: 4, width: 18, height: 1, background: "#CBD5E1" }} />
      <div className="absolute" style={{ top: 13, left: 4, width: 6, height: 1, background: "#22C55E" }} />
    </div>
  );
}

/* ═══ Sofa ═══ */

export function PixelSofa({ color = "#F97316" }: { color?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div style={{ width: 36, height: 6, background: color, border: "1px solid rgba(0,0,0,0.25)", borderRadius: "3px 3px 0 0", filter: "brightness(0.8)" }} />
      <div className="relative" style={{ width: 36, height: 8, background: color, border: "1px solid rgba(0,0,0,0.15)", borderRadius: "0 0 2px 2px" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(0,0,0,0.1)" }} />
      </div>
      <div className="flex justify-between" style={{ width: 30, marginTop: 1 }}>
        <div style={{ width: 3, height: 3, background: "#5C4033" }} />
        <div style={{ width: 3, height: 3, background: "#5C4033" }} />
      </div>
    </div>
  );
}

/* ═══ Wall art / picture frame ═══ */

export function PixelWallArt({ variant = 0 }: { variant?: number }) {
  const colors = [
    { frame: "#8B6914", bg: "#1E3A5F", accent: "#F59E0B" },
    { frame: "#5C4033", bg: "#14532D", accent: "#86EFAC" },
    { frame: "#6B4C0E", bg: "#4C1D95", accent: "#C4B5FD" },
  ][variant % 3];

  return (
    <div className="shrink-0 relative" style={{ width: 18, height: 14, imageRendering: "pixelated", background: colors.bg, border: `2px solid ${colors.frame}` }}>
      <div className="absolute" style={{ bottom: 2, left: 2, width: 6, height: 4, background: colors.accent, opacity: 0.6 }} />
      <div className="absolute" style={{ top: 2, right: 3, width: 3, height: 3, background: colors.accent, borderRadius: "50%", opacity: 0.5 }} />
    </div>
  );
}

/* ═══ Coffee machine ═══ */

export function PixelCoffeeMachine() {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated" }}>
      <div style={{ width: 12, height: 10, background: "#374151", border: "1px solid #1F2937", borderRadius: "2px 2px 0 0" }}>
        <div style={{ width: 4, height: 3, background: "#EF4444", margin: "2px auto 0", borderRadius: 1 }} />
      </div>
      <div style={{ width: 14, height: 4, background: "#4B5563", border: "1px solid #374151" }} />
    </div>
  );
}
