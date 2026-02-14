import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Loader2, TrendingDown, Target } from "lucide-react";
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

  const summaryStats = [
    { label: "Total Tasks", value: totalTasks.toString(), icon: BarChart3, color: "text-primary", bg: "from-primary-light to-purple-light" },
    { label: "Completed", value: totalCompleted.toString(), icon: TrendingUp, color: "text-green", bg: "from-green-light to-green-muted" },
    { label: "Failed", value: totalFailed.toString(), icon: TrendingDown, color: "text-red", bg: "from-red-light to-red-muted" },
    { label: "Success Rate", value: `${overallSuccessRate.toFixed(1)}%`, icon: Target, color: "text-primary", bg: "from-primary-light to-purple-light" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Period Selector */}
      <div className="glass relative z-10 flex items-center justify-between px-8 py-4 shadow-sm border-b border-edge-light/50">
        <div className="flex items-center gap-2">
          <div className="h-1 w-6 rounded-full bg-gradient-primary" />
          <h2 className="text-[15px] font-bold text-text-primary">Performance Analytics</h2>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-page p-1">
          {(["7d", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-bold transition-all duration-200",
                period === p
                  ? "bg-white text-primary shadow-md"
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
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-[13px] text-text-tertiary">Carregando analytics...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-8">
          <div className="stagger flex flex-col gap-8">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {summaryStats.map((stat, index) => (
                <div
                  key={stat.label}
                  className="card-hover relative overflow-hidden rounded-2xl bg-white p-6 shadow-card"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute inset-0 opacity-[0.03] gradient-primary" />
                  <div className="relative">
                    <div className={cn("mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-br p-2.5", stat.bg)}>
                      <stat.icon className={cn("h-5 w-5", stat.color)} />
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary mb-1">
                      {stat.label}
                    </p>
                    <p className={cn("text-[28px] font-bold leading-none", stat.color)}>{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Performance Trends Chart */}
            <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg">
              <div className="absolute inset-0 opacity-[0.02] gradient-primary" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-6">
                  <div className="h-1 w-6 rounded-full bg-gradient-primary" />
                  <h2 className="text-[15px] font-bold text-text-primary">Performance Trends</h2>
                </div>
                <PerformanceChart data={trends} type="area" />
              </div>
            </div>

            {/* Agent Metrics Cards */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-6 rounded-full bg-gradient-primary" />
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-primary">
                  Agent Performance
                </h2>
              </div>
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
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-light to-purple-light mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <p className="text-[14px] font-semibold text-text-secondary mb-1">Sem dados de analytics</p>
                <p className="text-[12px] text-text-tertiary">Execute tasks para ver métricas aqui</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
