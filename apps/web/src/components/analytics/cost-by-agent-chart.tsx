import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useUsageStore, type CostByAgentEntry } from "../../stores/usage-store";
import { BarChart3 } from "lucide-react";

const DEFAULT_COLORS = ["#F97316", "#8B5CF6", "#06B6D4", "#10B981", "#EF4444", "#F59E0B"];

function AgentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CostByAgentEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3 min-w-[160px]">
      <p className="text-[12px] font-semibold text-neutral-fg1 mb-2">{d.agentName}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-fg3">Custo:</span>
          <span className="font-semibold text-brand">${d.totalCost.toFixed(4)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-fg3">Tokens:</span>
          <span className="font-semibold text-neutral-fg1">{d.totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-neutral-fg3">Tasks:</span>
          <span className="font-semibold text-neutral-fg1">{d.taskCount}</span>
        </div>
      </div>
    </div>
  );
}

export function CostByAgentChart() {
  const costByAgent = useUsageStore((s) => s.costByAgent);

  if (costByAgent.length === 0) {
    return (
      <div className="card-glow p-8 animate-fade-up stagger-2">
        <h3 className="text-title text-neutral-fg1 mb-6">Custo por Agente</h3>
        <div className="flex flex-col items-center justify-center h-[250px] text-neutral-fg3">
          <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
          <span className="text-[13px]">Sem dados</span>
        </div>
      </div>
    );
  }

  const data = costByAgent.map((entry, i) => ({
    ...entry,
    fill: entry.agentColor || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <div className="card-glow p-8 animate-fade-up stagger-2">
      <h3 className="text-title text-neutral-fg1 mb-6">Custo por Agente</h3>
      <ResponsiveContainer width="100%" height={Math.max(250, data.length * 50)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rt-stroke)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "var(--rt-neutral-fg3)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--rt-stroke)" }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <YAxis
            type="category"
            dataKey="agentName"
            tick={{ fontSize: 11, fill: "var(--rt-neutral-fg2)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--rt-stroke)" }}
            width={120}
          />
          <Tooltip content={<AgentTooltip />} />
          <Bar dataKey="totalCost" radius={[0, 4, 4, 0]} barSize={28}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
