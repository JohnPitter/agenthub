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
        "skeleton bg-neutral-bg2",
        animation === "pulse" && "animate-pulse",
        animation === "none" && "animate-none",
        getVariantClass(),
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg bg-neutral-bg1 p-5 shadow-2 border border-stroke">
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
    <div className="rounded-lg bg-neutral-bg1 shadow-2 border border-stroke overflow-hidden">
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
        <div key={i} className="rounded-lg bg-neutral-bg1 p-5 shadow-2 border border-stroke">
          <Skeleton variant="rounded" width="40px" height="40px" className="mb-4" />
          <Skeleton width="60%" height="10px" className="mb-3" />
          <Skeleton width="80px" height="28px" />
        </div>
      ))}
    </div>
  );
}
