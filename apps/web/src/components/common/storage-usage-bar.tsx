import { useEffect, useState, useCallback } from "react";
import { HardDrive } from "lucide-react";
import { getSocket } from "../../lib/socket";
import { api, cn } from "../../lib/utils";
import type { StorageUsage } from "@agenthub/shared";

export function StorageUsageBar() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const { usage: data } = await api<{ usage: StorageUsage }>("/storage/usage");
      setUsage(data);
    } catch {
      // Silently fail — not critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // Real-time storage updates via socket
  useEffect(() => {
    const socket = getSocket();
    const handleStorageUpdated = () => { fetchUsage(); };
    socket.on("storage:updated", handleStorageUpdated);
    return () => { socket.off("storage:updated", handleStorageUpdated); };
  }, [fetchUsage]);

  if (loading || !usage) return null;

  const percent = Math.min(usage.usedPercent, 100);
  const color = percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-warning" : "bg-brand";
  const textColor = percent >= 90 ? "text-danger" : percent >= 70 ? "text-warning" : "text-brand";

  return (
    <div className="px-3 py-3 border-t border-stroke2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="text-[11px] font-medium text-neutral-fg2">Armazenamento</span>
        </div>
        <span className={cn("text-[10px] font-semibold tabular-nums", textColor)}>
          {usage.usedMb.toFixed(0)}MB / {usage.limitMb}MB
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-bg2 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-neutral-fg-disabled">
          {usage.projectCount} projeto(s){usage.maxProjects > 0 ? ` / ${usage.maxProjects}` : ""}
        </span>
        <span className="text-[10px] text-neutral-fg-disabled">
          TTL: {usage.repoTtlDays}d
        </span>
      </div>
    </div>
  );
}
