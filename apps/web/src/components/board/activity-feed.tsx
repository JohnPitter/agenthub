import { useEffect, useRef } from "react";
import { Zap, Clock } from "lucide-react";
import { ActivityItem } from "./activity-item";
import type { Agent, BoardActivityEvent } from "@agenthub/shared";

interface ActivityFeedProps {
  activities: BoardActivityEvent[];
  agents: Agent[];
}

export function ActivityFeed({ activities, agents }: ActivityFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [activities.length]);

  return (
    <div className="flex flex-1 flex-col rounded-lg bg-neutral-bg1 p-5 shadow-2">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-brand" />
        <h3 className="text-[13px] font-semibold text-neutral-fg1">
          Atividades Recentes
        </h3>
      </div>

      <div ref={feedRef} className="flex-1 space-y-1.5 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Clock className="mb-2 h-8 w-8 text-neutral-fg-disabled" />
            <p className="text-[12px] text-neutral-fg3">
              Aguardando atividades...
            </p>
          </div>
        ) : (
          activities.map((activity, idx) => (
            <ActivityItem
              key={`${activity.timestamp}-${idx}`}
              activity={activity}
              agent={agents.find((a) => a.id === activity.agentId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
