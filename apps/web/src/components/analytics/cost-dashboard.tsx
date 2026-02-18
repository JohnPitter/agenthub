import { DollarSign, Coins, CheckCircle2, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { useUsageStore } from "../../stores/usage-store";
import { cn } from "../../lib/utils";

interface CostDashboardProps {
  period: string;
}

export function CostDashboard({ period }: CostDashboardProps) {
  const summary = useUsageStore((s) => s.summary);
  const costByAgent = useUsageStore((s) => s.costByAgent);

  const totalCost = summary?.totalCostUsd ?? 0;
  const totalTokens = summary?.totalTokens ?? 0;
  const completedTasks = summary?.completedTasks ?? 0;
  const totalTasks = summary?.totalTasks ?? 0;
  const avgCost = totalTasks > 0 ? totalCost / totalTasks : 0;

  // Simple trend: compare agent count as proxy (no historical data available)
  const hasData = costByAgent.length > 0;

  const formatCost = (v: number) => {
    if (v >= 1) return `$${v.toFixed(2)}`;
    if (v >= 0.01) return `$${v.toFixed(3)}`;
    if (v > 0) return `$${v.toFixed(4)}`;
    return "$0.00";
  };

  const formatTokens = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  const stats = [
    {
      label: "Custo Total",
      value: formatCost(totalCost),
      icon: DollarSign,
      color: "text-brand",
      bgColor: "bg-brand/10",
    },
    {
      label: "Tokens Totais",
      value: formatTokens(totalTokens),
      icon: Coins,
      color: "text-purple",
      bgColor: "bg-purple/10",
    },
    {
      label: "Tasks Concluidas",
      value: String(completedTasks),
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Custo Medio/Task",
      value: formatCost(avgCost),
      icon: TrendingUp,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-8 animate-fade-up">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-stroke bg-neutral-bg2 p-6 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-neutral-fg3 uppercase tracking-wider">
                {stat.label}
              </span>
              <div className={cn("rounded-lg p-1.5", stat.bgColor)}>
                <Icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className={cn("text-[24px] font-bold tracking-tight", stat.color)}>
                {stat.value}
              </span>
              {hasData && (
                <span className="text-[11px] text-neutral-fg3 pb-1 flex items-center gap-0.5">
                  {totalCost > 0 ? (
                    <ArrowUp className="h-3 w-3 text-success" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-neutral-fg3" />
                  )}
                  {period === "7d" ? "7d" : period === "30d" ? "30d" : "total"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
