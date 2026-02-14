import { TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, Activity } from "lucide-react";
import { cn } from "../../lib/utils";

interface AgentMetrics {
  agentId: string;
  agentName: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  successRate: number;
  avgCompletionTime: number | null;
  tasksByStatus: {
    pending: number;
    assigned: number;
    in_progress: number;
    review: number;
    done: number;
    failed: number;
  };
}

interface AgentMetricsCardProps {
  metrics: AgentMetrics;
  rank?: number;
}

export function AgentMetricsCard({ metrics, rank }: AgentMetricsCardProps) {
  const formatTime = (ms: number | null) => {
    if (!ms) return "—";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 80) return "text-green";
    if (rate >= 50) return "text-orange";
    return "text-red";
  };

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 80) return TrendingUp;
    if (rate >= 50) return Activity;
    return TrendingDown;
  };

  const SuccessIcon = getSuccessRateIcon(metrics.successRate);

  return (
    <div className="bg-white rounded-xl p-5 shadow-card transition-all hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {rank && (
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-bold",
                rank === 1 && "bg-yellow-light text-yellow",
                rank === 2 && "bg-page text-text-secondary",
                rank === 3 && "bg-yellow-light text-yellow",
                rank > 3 && "bg-page text-text-tertiary"
              )}
            >
              #{rank}
            </div>
          )}
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">{metrics.agentName}</h3>
            <p className="text-[11px] text-text-tertiary">{metrics.totalTasks} total tasks</p>
          </div>
        </div>

        {/* Success Rate */}
        <div className="text-right">
          <div className={cn("flex items-center gap-1 text-[16px] font-bold", getSuccessRateColor(metrics.successRate))}>
            <SuccessIcon className="h-3.5 w-3.5" />
            {metrics.successRate.toFixed(1)}%
          </div>
          <p className="text-[10px] text-text-tertiary">Success Rate</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-green-light rounded-md p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle2 className="h-3 w-3 text-green" />
            <span className="text-[9px] font-semibold text-green uppercase">Completed</span>
          </div>
          <div className="text-[15px] font-bold text-green">{metrics.completedTasks}</div>
        </div>

        <div className="bg-red-light rounded-md p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <XCircle className="h-3 w-3 text-red" />
            <span className="text-[9px] font-semibold text-red uppercase">Failed</span>
          </div>
          <div className="text-[15px] font-bold text-red">{metrics.failedTasks}</div>
        </div>

        <div className="bg-purple-light rounded-md p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Activity className="h-3 w-3 text-purple" />
            <span className="text-[9px] font-semibold text-purple uppercase">In Progress</span>
          </div>
          <div className="text-[15px] font-bold text-purple">{metrics.inProgressTasks}</div>
        </div>
      </div>

      {/* Avg Completion Time */}
      <div className="flex items-center justify-between py-2.5 border-t border-edge-light/50">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Clock className="h-3 w-3" />
          <span>Avg. Completion Time</span>
        </div>
        <span className="text-[12px] font-semibold text-text-primary">
          {formatTime(metrics.avgCompletionTime)}
        </span>
      </div>

      {/* Status Distribution */}
      <div className="mt-2">
        <div className="text-[10px] font-semibold text-text-tertiary uppercase mb-1.5">
          Status Distribution
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-page">
          {metrics.tasksByStatus.done > 0 && (
            <div
              className="bg-green"
              style={{ width: `${(metrics.tasksByStatus.done / metrics.totalTasks) * 100}%` }}
              title={`Done: ${metrics.tasksByStatus.done}`}
            />
          )}
          {metrics.tasksByStatus.in_progress > 0 && (
            <div
              className="bg-purple"
              style={{ width: `${(metrics.tasksByStatus.in_progress / metrics.totalTasks) * 100}%` }}
              title={`In Progress: ${metrics.tasksByStatus.in_progress}`}
            />
          )}
          {metrics.tasksByStatus.review > 0 && (
            <div
              className="bg-blue"
              style={{ width: `${(metrics.tasksByStatus.review / metrics.totalTasks) * 100}%` }}
              title={`Review: ${metrics.tasksByStatus.review}`}
            />
          )}
          {metrics.tasksByStatus.failed > 0 && (
            <div
              className="bg-red"
              style={{ width: `${(metrics.tasksByStatus.failed / metrics.totalTasks) * 100}%` }}
              title={`Failed: ${metrics.tasksByStatus.failed}`}
            />
          )}
          {metrics.tasksByStatus.pending + metrics.tasksByStatus.assigned > 0 && (
            <div
              className="bg-edge"
              style={{
                width: `${((metrics.tasksByStatus.pending + metrics.tasksByStatus.assigned) / metrics.totalTasks) * 100}%`,
              }}
              title={`Pending/Assigned: ${metrics.tasksByStatus.pending + metrics.tasksByStatus.assigned}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
