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
      {/* Period Selector */}
      <div className="relative z-10 flex items-center justify-end bg-white px-8 py-4 shadow-xs">
        <div className="flex items-center gap-1 rounded-lg bg-page p-1">
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                period === p
                  ? "bg-white text-primary shadow-xs"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Tudo"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-4">
            <div className="bg-white rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-2 text-[11px] text-text-tertiary uppercase font-semibold mb-2">
                <BarChart3 className="h-3 w-3" />
                Total Tasks
              </div>
              <div className="text-[20px] font-semibold text-text-primary">{totalTasks}</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-2 text-[11px] text-green uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3" />
                Completed
              </div>
              <div className="text-[20px] font-semibold text-green">{totalCompleted}</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-2 text-[11px] text-red uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3 rotate-180" />
                Failed
              </div>
              <div className="text-[20px] font-semibold text-red">{totalFailed}</div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-2 text-[11px] text-primary uppercase font-semibold mb-2">
                <TrendingUp className="h-3 w-3" />
                Success Rate
              </div>
              <div className="text-[20px] font-semibold text-primary">{overallSuccessRate.toFixed(1)}%</div>
            </div>
          </div>

          {/* Performance Trends Chart */}
          <div className="bg-white rounded-xl p-6 shadow-card mb-8">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">
              Performance Trends
            </h2>
            <PerformanceChart data={trends} type="area" />
          </div>

          {/* Agent Metrics Cards */}
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary mb-4">
              Agent Performance
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <BarChart3 className="h-10 w-10 text-text-placeholder mb-3" />
              <p className="text-[13px] text-text-tertiary">No analytics data available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
