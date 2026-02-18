import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, ListTodo, CheckCircle2, XCircle, Zap } from "lucide-react";
import { PerformanceChart } from "../components/analytics/performance-chart";
import { CommandBar } from "../components/layout/command-bar";
import { Tablist } from "../components/ui/tablist";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonStats, SkeletonTable } from "../components/ui/skeleton";
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

const STAT_ITEMS = [
  { key: "total", labelKey: "analytics.totalTasks", icon: ListTodo, color: "text-brand" },
  { key: "completed", labelKey: "analytics.completed", icon: CheckCircle2, color: "text-success" },
  { key: "failed", labelKey: "analytics.failed", icon: XCircle, color: "text-danger" },
  { key: "rate", labelKey: "analytics.successRate", icon: Zap, color: "text-brand" },
] as const;

export function Analytics() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("30d");
  const [activeTab, setActiveTab] = useState<"overview" | "agents">("overview");
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

  const statValues = {
    total: totalTasks,
    completed: totalCompleted,
    failed: totalFailed,
    rate: `${overallSuccessRate.toFixed(1)}%`,
  };

  const formatTime = (ms: number | null) => {
    if (ms === null) return "—";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar
        actions={
          <div className="flex items-center rounded-full bg-neutral-bg2 p-1 border border-stroke">
            {(["7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all duration-200",
                  period === p
                    ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand"
                    : "text-neutral-fg3 hover:text-neutral-fg1"
                )}
              >
                {p === "7d" ? t("analytics.period7d") : p === "30d" ? t("analytics.period30d") : t("analytics.periodAll")}
              </button>
            ))}
          </div>
        }
      >
        <Tablist
          tabs={[
            { key: "overview", label: t("analytics.overview") },
            { key: "agents", label: t("analytics.agentsTab") },
          ]}
          activeTab={activeTab}
          onChange={(key) => setActiveTab(key as "overview" | "agents")}
        />
      </CommandBar>

      {/* Content */}
      {loading ? (
        <div className="flex-1 overflow-auto p-10 flex flex-col gap-8">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-10">
          {/* Stat cards grid */}
          <div className="grid grid-cols-4 gap-4 mb-10 animate-fade-up">
            {STAT_ITEMS.map((item) => {
              const Icon = item.icon;
              const value = statValues[item.key];
              return (
                <div key={item.key} className="stat-card flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-label">{t(item.labelKey)}</span>
                    <Icon className={cn("h-4 w-4", item.color)} />
                  </div>
                  <span className={cn("text-[28px] font-bold tracking-tight", item.color)}>
                    {value}
                  </span>
                </div>
              );
            })}
          </div>

          {activeTab === "overview" ? (
            /* Chart view */
            <div className="card-glow p-8 animate-fade-up stagger-2">
              <h2 className="text-title text-neutral-fg1 mb-6">{t("analytics.overview")}</h2>
              <PerformanceChart data={trends} type="area" />
            </div>
          ) : (
            /* Agents table view */
            <div className="card-glow overflow-hidden animate-fade-up stagger-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke2 text-left">
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 w-12">#</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("chat.agent")}</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("analytics.totalTasks")}</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("analytics.completed")}</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("analytics.failed")}</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("analytics.successRate")}</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("analytics.avgTime")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke2">
                  {metrics.map((metric, index) => (
                    <tr key={metric.agentId} className="table-row">
                      <td className="px-5 py-3.5 text-[12px] font-semibold text-neutral-fg3">{index + 1}</td>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-neutral-fg1">{metric.agentName}</td>
                      <td className="px-5 py-3.5 text-[13px] text-neutral-fg2 text-right">{metric.totalTasks}</td>
                      <td className="px-5 py-3.5 text-[13px] text-success font-semibold text-right">{metric.completedTasks}</td>
                      <td className="px-5 py-3.5 text-[13px] text-danger font-semibold text-right">{metric.failedTasks}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={cn(
                          "text-[13px] font-semibold",
                          metric.successRate >= 80 ? "text-success" : metric.successRate >= 50 ? "text-warning" : "text-danger"
                        )}>
                          {metric.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-neutral-fg3 text-right font-mono">
                        {formatTime(metric.avgCompletionTime)}
                      </td>
                    </tr>
                  ))}
                  {metrics.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState icon={BarChart3} title={t("analytics.noData")} variant="compact" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
