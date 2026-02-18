import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useUsageStore, type CostTrendEntry } from "../../stores/usage-store";
import { TrendingUp } from "lucide-react";

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CostTrendEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3 min-w-[140px]">
      <p className="text-[11px] font-semibold text-neutral-fg1 mb-1.5">
        {new Date(d.date).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
      </p>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-fg3">Custo:</span>
          <span className="font-semibold text-brand">${d.totalCost.toFixed(4)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-fg3">Tasks:</span>
          <span className="font-semibold text-neutral-fg1">{d.taskCount}</span>
        </div>
      </div>
    </div>
  );
}

export function CostTrendChart() {
  const costTrend = useUsageStore((s) => s.costTrend);

  if (costTrend.length === 0) {
    return (
      <div className="card-glow p-8 animate-fade-up stagger-4">
        <h3 className="text-title text-neutral-fg1 mb-6">Tendencia de Custo</h3>
        <div className="flex flex-col items-center justify-center h-[250px] text-neutral-fg3">
          <TrendingUp className="h-10 w-10 mb-2 opacity-30" />
          <span className="text-[13px]">Sem dados</span>
        </div>
      </div>
    );
  }

  const data = costTrend.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
  }));

  return (
    <div className="card-glow p-8 animate-fade-up stagger-4">
      <h3 className="text-title text-neutral-fg1 mb-6">Tendencia de Custo</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F97316" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F97316" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rt-stroke)" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 10, fill: "var(--rt-neutral-fg3)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--rt-stroke)" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--rt-neutral-fg3)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--rt-stroke)" }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Tooltip content={<TrendTooltip />} />
          <Area
            type="monotone"
            dataKey="totalCost"
            stroke="#F97316"
            fill="url(#costGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
