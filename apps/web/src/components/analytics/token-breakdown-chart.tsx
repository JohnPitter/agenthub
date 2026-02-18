import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useUsageStore, type CostTrendEntry } from "../../stores/usage-store";
import { Layers } from "lucide-react";

function TokenTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; payload: CostTrendEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3 min-w-[160px]">
      <p className="text-[11px] font-semibold text-neutral-fg1 mb-1.5">
        {new Date(d.date).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
      </p>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full bg-info" />
          <span className="text-neutral-fg3">Input:</span>
          <span className="font-semibold text-neutral-fg1">{d.inputTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F97316" }} />
          <span className="text-neutral-fg3">Output:</span>
          <span className="font-semibold text-neutral-fg1">{d.outputTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-neutral-fg3">Total:</span>
          <span className="font-semibold text-neutral-fg1">
            {(d.inputTokens + d.outputTokens).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TokenBreakdownChart() {
  const costTrend = useUsageStore((s) => s.costTrend);

  if (costTrend.length === 0) {
    return (
      <div className="card-glow p-8 animate-fade-up stagger-5">
        <h3 className="text-title text-neutral-fg1 mb-6">Tokens por Dia</h3>
        <div className="flex flex-col items-center justify-center h-[250px] text-neutral-fg3">
          <Layers className="h-10 w-10 mb-2 opacity-30" />
          <span className="text-[13px]">Sem dados</span>
        </div>
      </div>
    );
  }

  const data = costTrend.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
  }));

  const formatTokens = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div className="card-glow p-8 animate-fade-up stagger-5">
      <h3 className="text-title text-neutral-fg1 mb-6">Tokens por Dia</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
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
            tickFormatter={formatTokens}
          />
          <Tooltip content={<TokenTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
            iconType="circle"
            iconSize={8}
          />
          <Bar
            dataKey="inputTokens"
            name="Input Tokens"
            stackId="tokens"
            fill="var(--rt-info, #3B82F6)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="outputTokens"
            name="Output Tokens"
            stackId="tokens"
            fill="#F97316"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
