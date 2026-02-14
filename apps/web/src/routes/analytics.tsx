import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Loader2 } from "lucide-react";
import { AgentMetricsCard } from "../components/analytics/agent-metrics-card";
import { PerformanceChart } from "../components/analytics/performance-chart";
import { api, cn } from "../lib/utils";

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

interface TrendDataPoint {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

type Period = "7d" | "30d" | "all";

export function Analytics() {
  const [period, setPeriod] = useState<Period>("30d");
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [metricsData, trendsData] = await Promise.all([
        api(`/analytics/agents?period=${period}`) as Promise<{ metrics: AgentMetrics[] }>,
        api(`/analytics/trends?period=${period}`) as Promise<{ trends: TrendDataPoint[] }>,
      ]);

      setMetrics(metricsData.metrics);
      setTrends(trendsData.trends);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalTasks = metrics.reduce((sum, m) => sum + m.totalTasks, 0);
  const totalCompleted = metrics.reduce((sum, m) => sum + m.completedTasks, 0);
  const totalFailed = metrics.reduce((sum, m) => sum + m.failedTasks, 0);
  const overallSuccessRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-edge bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-light">
              <BarChart3 className="h-5 w-5 text-purple" />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-text-primary">Analytics</h1>
              <p className="text-[12px] text-text-tertiary">
                Performance metrics and insights
              </p>
            </div>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-page rounded-lg p-1">
            <button
              onClick={() => setPeriod("7d")}
              className={cn(
                "rounded px-3 py-1.5 text-[11px] font-semibold transition-colors",
                period === "7d"
                  ? "bg-white text-purple shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setPeriod("30d")}
              className={cn(
                "rounded px-3 py-1.5 text-[11px] font-semibold transition-colors",
                period === "30d"
                  ? "bg-white text-purple shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              Last 30 days
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={cn(
                "rounded px-3 py-1.5 text-[11px] font-semibold transition-colors",
                period === "all"
                  ? "bg-white text-purple shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              All time
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-page p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-edge rounded-xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-text-tertiary uppercase font-semibold mb-2">
                <BarChart3 className="h-3 w-3" />
                Total Tasks
              </div>
              <div className="text-[24px] font-bold text-text-primary">{totalTasks}</div>
            </div>

            <div className="bg-white border border-edge rounded-xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-green uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3" />
                Completed
              </div>
              <div className="text-[24px] font-bold text-green">{totalCompleted}</div>
            </div>

            <div className="bg-white border border-edge rounded-xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-red uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3 rotate-180" />
                Failed
              </div>
              <div className="text-[24px] font-bold text-red">{totalFailed}</div>
            </div>

            <div className="bg-white border border-edge rounded-xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-purple uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3" />
                Success Rate
              </div>
              <div className="text-[24px] font-bold text-purple">{overallSuccessRate.toFixed(1)}%</div>
            </div>
          </div>

          {/* Performance Trends Chart */}
          <div className="bg-white border border-edge rounded-xl p-6 mb-6">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">
              Performance Trends
            </h2>
            <PerformanceChart data={trends} type="area" />
          </div>

          {/* Agent Metrics Cards */}
          <div>
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">
              Agent Performance
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {metrics.map((metric, index) => (
                <AgentMetricsCard
                  key={metric.agentId}
                  metrics={metric}
                  rank={index + 1}
                />
              ))}
            </div>
          </div>

          {metrics.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="h-12 w-12 text-text-tertiary mb-3" />
              <p className="text-[13px] text-text-tertiary">No analytics data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
