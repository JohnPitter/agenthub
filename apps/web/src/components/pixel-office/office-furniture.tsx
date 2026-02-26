/**
 * Pixel-art furniture and decorations for the Gather Town-style office.
 * Pure CSS — no external assets. Employs 16-bit RPG isometric/top-down aesthetics.
 */

/* ═══ Indoor plants ═══ */

export function PixelPlant({ variant = 0 }: { variant?: number }) {
  const v = variant % 3;
  const leavesBase = ["#22C55E", "#059669", "#84CC16"][v];
  const leavesShadow = ["#15803D", "#047857", "#4D7C0F"][v];
  const potBase = ["#B45309", "#78350F", "#9CA3AF"][v];
  const potShadow = ["#78350F", "#451A03", "#4B5563"][v];

  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Leaves Cluster */}
      <div className="relative z-20" style={{ width: 14, height: 12, background: leavesBase, border: "2px solid #064E3B", borderRadius: "4px 4px 2px 2px", boxShadow: `inset -2px -2px 0 ${leavesShadow}, inset 2px 2px 0 rgba(255,255,255,0.2)` }}>
        <div style={{ position: "absolute", top: 2, right: 2, width: 2, height: 2, background: "rgba(255,255,255,0.4)" }} />
        <div style={{ position: "absolute", bottom: 2, left: 2, width: 4, height: 2, background: leavesShadow }} />
      </div>
      {/* Stem */}
      <div style={{ width: 4, height: 4, background: "#064E3B", margin: "-2px 0" }} />
      {/* Pot */}
      <div className="relative z-10" style={{ width: 12, height: 8, background: potBase, border: "2px solid #27272A", borderRadius: "1px 1px 3px 3px", borderTop: "none", boxShadow: `inset -2px -2px 0 ${potShadow}` }}>
        <div style={{ position: "absolute", top: -2, left: -2, width: 16, height: 4, background: potBase, border: "2px solid #27272A", borderRadius: 1, boxShadow: `inset 0 -1px 0 ${potShadow}` }} />
      </div>
    </div>
  );
}

/* ═══ Outdoor tree ═══ */

export function PixelTree({ variant = 0 }: { variant?: number }) {
  const isPine = variant % 2 === 1;

  if (isPine) {
    return (
      <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.15))" }}>
        {/* Pine Tree */}
        <div className="relative z-10 flex flex-col items-center">
            {/* Top Tier */}
            <div style={{ width: 24, height: 16, background: "#059669", border: "2px solid #064E3B", borderBottom: "none", borderRadius: "12px 12px 0 0", boxShadow: "inset -4px -2px 0 #047857, inset 2px 2px 0 rgba(255,255,255,0.2)" }} />
            {/* Mid Tier */}
            <div style={{ width: 40, height: 20, background: "#059669", border: "2px solid #064E3B", borderBottom: "none", borderRadius: "20px 20px 0 0", marginTop: -6, boxShadow: "inset -4px -4px 0 #047857, inset 2px 2px 0 rgba(255,255,255,0.15)" }} />
            {/* Base Tier */}
            <div style={{ width: 56, height: 24, background: "#059669", border: "2px solid #064E3B", borderRadius: "28px 28px 4px 4px", marginTop: -8, boxShadow: "inset -6px -6px 0 #047857, inset 2px 2px 0 rgba(255,255,255,0.1)" }} />
        </div>
        {/* Trunk */}
        <div style={{ width: 12, height: 16, background: "#78350F", border: "2px solid #451A03", marginTop: -4, borderTop: "none", zIndex: 5, boxShadow: "inset -2px 0 0 #451A03" }}>
           <div style={{ width: 2, height: 6, background: "#451A03", margin: "2px" }} />
        </div>
      </div>
    );
  }

  // Round Tree (Oak style)
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.15))" }}>
      <div className="relative overflow-hidden z-10" style={{ width: 56, height: 50, background: "#22C55E", border: "2px solid #14532D", borderRadius: "40% 60% 50% 50%", boxShadow: "inset -6px -8px 0 #15803D, inset 4px 4px 0 rgba(255,255,255,0.2)" }}>
         {/* Detail clusters */}
         <div style={{ position: "absolute", top: 10, left: 8, width: 16, height: 12, background: "#4ADE80", borderRadius: "50%" }} />
         <div style={{ position: "absolute", top: 20, right: 10, width: 20, height: 14, background: "#15803D", borderRadius: "50%" }} />
         <div style={{ position: "absolute", bottom: 8, left: 14, width: 12, height: 8, background: "#14532D", borderRadius: "50%" }} />
      </div>
      {/* Trunk */}
      <div style={{ width: 14, height: 14, background: "#92400E", border: "2px solid #451A03", marginTop: -6, zIndex: 5, borderTop: "none", boxShadow: "inset -3px 0 0 #78350F" }} />
    </div>
  );
}

/* ═══ Bookshelf ═══ */

export function PixelBookshelf() {
  return (
    <div className="shrink-0 relative" style={{ width: 28, height: 32, imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Top Face */}
      <div style={{ width: 28, height: 6, background: "#B45309", border: "2px solid #451A03", borderBottom: "none", transform: "skewX(-15deg)", marginLeft: 2 }} />
      
      {/* Front Face */}
      <div className="relative" style={{ width: 28, height: 26, background: "#78350F", border: "2px solid #451A03", borderRadius: 1 }}>
        {/* Shelf 1 */}
        <div style={{ position: "absolute", top: 4, left: 2, right: 2, height: 8, background: "#451A03", borderBottom: "2px solid #92400E" }}>
            <div className="absolute flex items-end gap-[1px]" style={{ bottom: 2, left: 2, height: 6 }}>
                <div style={{ width: 3, height: 6, background: "#EF4444", border: "1px solid #7F1D1D" }} />
                <div style={{ width: 2, height: 5, background: "#3B82F6", border: "1px solid #1E3A8A" }} />
                <div style={{ width: 3, height: 6, background: "#22C55E", border: "1px solid #14532D" }} />
                <div style={{ width: 4, height: 4, background: "#F59E0B", border: "1px solid #78350F" }} />
            </div>
        </div>
        {/* Shelf 2 */}
        <div style={{ position: "absolute", top: 14, left: 2, right: 2, height: 10, background: "#451A03", borderBottom: "2px solid #92400E" }}>
            <div className="absolute flex items-end gap-[1px]" style={{ bottom: 2, right: 2, height: 8 }}>
                <div style={{ width: 3, height: 5, background: "#EC4899", border: "1px solid #831843" }} />
                <div style={{ width: 2, height: 7, background: "#14B8A6", border: "1px solid #134E4A" }} />
                <div style={{ width: 4, height: 6, background: "#F97316", border: "1px solid #7C2D12", transform: "rotate(15deg)", transformOrigin: "bottom left" }} />
            </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Monitor (standalone) ═══ */

export function PixelMonitor({ screenColor = "#3B82F6" }: { screenColor?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      <div className="relative" style={{ width: 24, height: 16, background: "#1F2937", border: "2px solid #030712", borderRadius: 2 }}>
        <div style={{ position: "absolute", inset: 1, border: "1px solid #374151", background: screenColor, boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.2), inset -2px -2px 0 rgba(0,0,0,0.2)" }} />
      </div>
      <div style={{ width: 6, height: 4, background: "#4B5563", border: "2px solid #1F2937", borderTop: "none" }} />
      <div style={{ width: 14, height: 2, background: "#1F2937" }} />
    </div>
  );
}

/* ═══ Water cooler ═══ */

export function PixelWaterCooler() {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Bottle */}
      <div className="relative" style={{ width: 14, height: 16, background: "#93C5FD", border: "2px solid #1E3A8A", borderRadius: "6px 6px 2px 2px", borderBottom: "none", boxShadow: "inset -3px -2px 0 #60A5FA, inset 2px 2px 0 rgba(255,255,255,0.4)" }}>
        <div style={{ position: "absolute", top: 4, left: 2, width: 2, height: 8, background: "rgba(255,255,255,0.6)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "#3B82F6", opacity: 0.5 }} />
      </div>
      {/* Base Machine */}
      <div className="relative z-10" style={{ width: 16, height: 14, background: "#F3F4F6", border: "2px solid #374151", borderRadius: 2, boxShadow: "inset -2px -2px 0 #9CA3AF" }}>
        {/* Drip Tray */}
        <div style={{ position: "absolute", bottom: 2, left: 3, width: 6, height: 3, background: "#9CA3AF", border: "1px solid #4B5563" }} />
        {/* Tap */}
        <div style={{ position: "absolute", top: 2, left: 4, width: 2, height: 3, background: "#EF4444" }} />
        <div style={{ position: "absolute", top: 2, left: 7, width: 2, height: 3, background: "#3B82F6" }} />
      </div>
    </div>
  );
}

/* ═══ Whiteboard ═══ */

export function PixelWhiteboard() {
  return (
    <div className="shrink-0 relative" style={{ width: 36, height: 28, imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Legs */}
      <div className="absolute" style={{ top: 16, left: 4, width: 2, height: 12, background: "#64748B", borderLeft: "1px solid #334155" }} />
      <div className="absolute" style={{ top: 16, right: 4, width: 2, height: 12, background: "#64748B", borderRight: "1px solid #334155" }} />
      <div className="absolute" style={{ top: 26, left: 2, width: 6, height: 2, background: "#475569" }} />
      <div className="absolute" style={{ top: 26, right: 2, width: 6, height: 2, background: "#475569" }} />

      {/* Board */}
      <div className="absolute z-10" style={{ top: 0, left: 0, width: 36, height: 20, background: "#FFFFFF", border: "2px solid #94A3B8", borderRadius: 2, boxShadow: "inset -2px -2px 0 #E2E8F0" }}>
         {/* Eraser holder */}
         <div style={{ position: "absolute", bottom: 0, left: -2, right: -2, height: 3, background: "#CBD5E1", border: "1px solid #94A3B8", borderTop: "none" }}>
            <div style={{ width: 4, height: 2, background: "#EF4444", marginLeft: 4 }} />
         </div>
         {/* Drawings */}
         <div style={{ position: "absolute", top: 4, left: 4, width: 16, height: 2, background: "#3B82F6" }} />
         <div style={{ position: "absolute", top: 8, left: 4, width: 10, height: 2, background: "#10B981" }} />
         <div style={{ position: "absolute", top: 5, right: 4, width: 8, height: 6, border: "1px solid #EF4444", borderRadius: "50%" }} />
      </div>
    </div>
  );
}

/* ═══ Sofa ═══ */

export function PixelSofa({ color = "#F97316" }: { color?: string }) {
  return (
    <div className="shrink-0 relative" style={{ width: 44, height: 22, imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
      {/* Backrest Top Edge */}
      <div style={{ position: "absolute", top: 0, left: 4, width: 36, height: 4, background: color, border: "2px solid #431407", borderBottom: "none", borderRadius: "4px 4px 0 0", filter: "brightness(1.15)" }} />
      {/* Backrest Front */}
      <div style={{ position: "absolute", top: 4, left: 4, width: 36, height: 10, background: color, border: "2px solid #431407", borderTop: "none", boxShadow: "inset 0 4px 0 rgba(0,0,0,0.1)" }} />
      
      {/* Seat Cushions */}
      <div style={{ position: "absolute", top: 12, left: 6, width: 32, height: 8, background: color, border: "2px solid #431407", display: "flex", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.2)" }}>
         <div style={{ flex: 1, borderRight: "2px solid #431407" }} />
         <div style={{ flex: 1 }} />
      </div>

      {/* Armrests */}
      <div style={{ position: "absolute", top: 8, left: 0, width: 8, height: 12, background: color, border: "2px solid #431407", borderRadius: "2px 0 0 2px", boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.2)" }} />
      <div style={{ position: "absolute", top: 8, right: 0, width: 8, height: 12, background: color, border: "2px solid #431407", borderRadius: "0 2px 2px 0", boxShadow: "inset -2px 2px 0 rgba(0,0,0,0.1)" }} />
    </div>
  );
}

/* ═══ Wall art / picture frame ═══ */

export function PixelWallArt({ variant = 0 }: { variant?: number }) {
  const themes = [
    { frame: "#78350F", shadow: "#451A03", bg: "#1E3A8A", art: ["#60A5FA", "#FCD34D"] }, // Night starry sky
    { frame: "#FFFFFF", shadow: "#9CA3AF", bg: "#10B981", art: ["#047857", "#D97706"] }, // Abstract green
    { frame: "#1F2937", shadow: "#030712", bg: "#A855F7", art: ["#FDE047", "#DB2777"] }, // Vaporwave
  ];
  const t = themes[variant % 3];

  return (
    <div className="shrink-0 relative" style={{ width: 20, height: 18, imageRendering: "pixelated", background: t.bg, border: `2px solid ${t.frame}`, boxShadow: `0 2px 0 ${t.shadow}, inset 2px 2px 0 rgba(0,0,0,0.5)` }}>
      <div style={{ position: "absolute", bottom: 2, left: 2, width: 10, height: 5, background: t.art[0] }} />
      <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, background: t.art[1], borderRadius: "50%" }} />
      {/* Frame highlight */}
      <div style={{ position: "absolute", top: -2, left: -2, width: 2, height: 2, background: "rgba(255,255,255,0.4)" }} />
    </div>
  );
}

/* ═══ Coffee machine ═══ */

export function PixelCoffeeMachine() {
  return (
    <div className="flex flex-col items-center shrink-0" style={{ imageRendering: "pixelated", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.15))" }}>
       {/* Top container */}
       <div className="relative" style={{ width: 14, height: 8, background: "#4B5563", border: "2px solid #1F2937", borderBottom: "none", borderRadius: "4px 4px 0 0", boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.2)" }}>
           {/* Bean hopper */}
           <div style={{ position: "absolute", top: -4, left: 2, width: 6, height: 4, background: "#9CA3AF", border: "2px solid #1F2937", borderRadius: "2px 2px 0 0", opacity: 0.8 }} />
       </div>
       {/* Middle brewing area */}
       <div className="relative" style={{ width: 16, height: 10, background: "#E5E7EB", border: "2px solid #1F2937", boxShadow: "inset -2px 0 0 #9CA3AF" }}>
           {/* Control panel */}
           <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#374151" }} />
           <div style={{ position: "absolute", top: 1, left: 2, width: 2, height: 2, background: "#10B981" }} />
           {/* Spout */}
           <div style={{ position: "absolute", top: 4, left: 6, width: 2, height: 3, background: "#1F2937" }} />
       </div>
       {/* Base with cup */}
       <div className="relative" style={{ width: 16, height: 4, background: "#1F2937" }}>
           <div style={{ position: "absolute", bottom: 4, left: 5, width: 5, height: 5, background: "#FFFFFF", border: "1px solid #1F2937", borderRadius: "0 0 2px 2px" }} />
       </div>
    </div>
  );
}
