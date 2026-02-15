import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { PerformanceChart } from "../components/analytics/performance-chart";
import { CommandBar } from "../components/layout/command-bar";
import { StatBar } from "../components/ui/stat-bar";
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

export function Analytics() {
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
          <div className="flex items-center gap-1 rounded-md bg-neutral-bg2 p-0.5">
            {(["7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  period === p
                    ? "bg-brand text-white"
                    : "text-neutral-fg3 hover:text-neutral-fg2 hover:bg-neutral-bg1"
                )}
              >
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Tudo"}
              </button>
            ))}
          </div>
        }
      >
        <Tablist
          tabs={[
            { key: "overview", label: "Visão Geral" },
            { key: "agents", label: "Agentes" },
          ]}
          activeTab={activeTab}
          onChange={(key) => setActiveTab(key as "overview" | "agents")}
        />
      </CommandBar>

      {/* Stat Bar */}
      <StatBar
        stats={[
          { label: "Total de Tasks", value: totalTasks },
          { label: "Concluídas", value: totalCompleted, color: "var(--color-success)" },
          { label: "Falhadas", value: totalFailed, color: "var(--color-danger)" },
          { label: "Taxa de Sucesso", value: `${overallSuccessRate.toFixed(1)}%`, color: "var(--color-brand)" },
        ]}
      />

      {/* Content */}
      {loading ? (
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "overview" ? (
            /* Chart view */
            <div className="rounded-lg bg-neutral-bg1 p-6 border border-stroke shadow-2">
              <h2 className="text-[14px] font-semibold text-neutral-fg1 mb-6">Tendências de Performance</h2>
              <PerformanceChart data={trends} type="area" />
            </div>
          ) : (
            /* Agents table view */
            <div className="rounded-lg border border-stroke bg-neutral-bg1 shadow-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stroke text-left">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 w-12">#</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Agente</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Total</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Completas</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Falhadas</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Taxa</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Tempo Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke">
                  {metrics.map((metric, index) => (
                    <tr key={metric.agentId} className="hover:bg-neutral-bg-hover transition-colors">
                      <td className="px-4 py-3 text-[12px] font-semibold text-neutral-fg3">{index + 1}</td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-neutral-fg1">{metric.agentName}</td>
                      <td className="px-4 py-3 text-[13px] text-neutral-fg2 text-right">{metric.totalTasks}</td>
                      <td className="px-4 py-3 text-[13px] text-success text-right">{metric.completedTasks}</td>
                      <td className="px-4 py-3 text-[13px] text-danger text-right">{metric.failedTasks}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "text-[13px] font-semibold",
                          metric.successRate >= 80 ? "text-success" : metric.successRate >= 50 ? "text-warning" : "text-danger"
                        )}>
                          {metric.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-neutral-fg3 text-right font-mono">
                        {formatTime(metric.avgCompletionTime)}
                      </td>
                    </tr>
                  ))}
                  {metrics.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState icon={BarChart3} title="Sem dados de analytics" variant="compact" />
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
