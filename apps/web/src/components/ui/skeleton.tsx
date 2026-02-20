import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string;
  height?: string;
  animation?: "pulse" | "wave" | "none";
}

export function Skeleton({
  className,
  variant = "rectangular",
  width,
  height,
  animation = "wave",
}: SkeletonProps) {
  const getVariantClass = () => {
    switch (variant) {
      case "text":
        return "h-4 rounded-lg";
      case "circular":
        return "rounded-full";
      case "rounded":
        return "rounded-lg";
      case "rectangular":
      default:
        return "rounded-lg";
    }
  };

  return (
    <div
      className={cn(
        "skeleton",
        animation === "pulse" && "animate-pulse",
        animation === "none" && "!animate-none",
        getVariantClass(),
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4 mb-5">
        <Skeleton variant="circular" width="40px" height="40px" />
        <div className="flex-1">
          <Skeleton className="mb-2" width="60%" height="16px" />
          <Skeleton width="40%" height="14px" />
        </div>
      </div>
      <Skeleton className="mb-3" height="14px" />
      <Skeleton className="mb-3" width="90%" height="14px" />
      <Skeleton width="70%" height="14px" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-stroke">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} width={i === 0 ? "25%" : "20%"} height="14px" />
        ))}
      </div>
      {/* Rows */}
      {[...Array(5)].map((_, rowIdx) => (
        <div key={rowIdx} className="flex items-center gap-4 px-5 py-4 border-b border-stroke">
          <Skeleton variant="circular" width="36px" height="36px" />
          <Skeleton width="30%" height="14px" />
          <Skeleton width="20%" height="14px" />
          <Skeleton width="15%" height="20px" className="rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="stat-card">
          <Skeleton variant="rounded" width="40px" height="40px" className="mb-4" />
          <Skeleton width="60%" height="10px" className="mb-3" />
          <Skeleton width="80px" height="28px" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 6 }: { columns?: number }) {
  return (
    <div className={cn("grid h-full gap-4", `grid-cols-${columns}`)} style={{ minWidth: columns * 200 }}>
      {[...Array(columns)].map((_, colIdx) => (
        <div key={colIdx} className="flex flex-col rounded-xl">
          <div className="rounded-t-xl px-4 py-3 border-b border-stroke2 bg-neutral-bg2/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton variant="circular" width="8px" height="8px" />
                <Skeleton width="60px" height="13px" />
              </div>
              <Skeleton variant="circular" width="20px" height="20px" />
            </div>
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            {[...Array(colIdx < 3 ? 3 - colIdx : 1)].map((_, cardIdx) => (
              <div key={cardIdx} className="rounded-lg bg-neutral-bg1 p-3.5 border border-stroke">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circular" width="6px" height="6px" />
                    <Skeleton width="40px" height="9px" />
                  </div>
                  <Skeleton width="60px" height="16px" className="rounded-md" />
                </div>
                <Skeleton width="90%" height="13px" className="mb-1.5" />
                <Skeleton width="60%" height="13px" className="mb-3" />
                <div className="flex items-center justify-between pt-2 border-t border-stroke">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="circular" width="20px" height="20px" />
                    <Skeleton width="50px" height="10px" />
                  </div>
                  <Skeleton width="30px" height="9px" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonAgentList() {
  return (
    <div className="flex flex-col gap-1">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-4">
          <Skeleton variant="rounded" width="40px" height="40px" />
          <div className="flex-1">
            <Skeleton width="70%" height="13px" className="mb-2" />
            <Skeleton width="40%" height="11px" />
          </div>
          <Skeleton variant="rounded" width="36px" height="20px" className="rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonFileTree() {
  return (
    <div className="flex flex-col gap-1 p-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(i % 3) * 16}px` }}>
          <Skeleton width="14px" height="14px" variant="rounded" />
          <Skeleton width={`${50 + Math.random() * 40}%`} height="12px" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPRList() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="card p-5 flex items-center gap-4">
          <Skeleton variant="circular" width="14px" height="14px" />
          <Skeleton width="40px" height="12px" />
          <div className="flex-1">
            <Skeleton width="70%" height="13px" className="mb-2" />
            <div className="flex items-center gap-3">
              <Skeleton width="80px" height="16px" className="rounded-md" />
              <Skeleton width="50px" height="11px" />
              <Skeleton width="40px" height="11px" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
