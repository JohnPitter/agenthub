import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useUsageStore, type CostByModelEntry } from "../../stores/usage-store";
import { PieChart as PieChartIcon } from "lucide-react";

const MODEL_COLORS = ["#F97316", "#8B5CF6", "#06B6D4", "#10B981", "#EF4444", "#F59E0B"];

function ModelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CostByModelEntry & { percent: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3 min-w-[160px]">
      <p className="text-[12px] font-semibold text-neutral-fg1 mb-2">{d.model}</p>
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

interface LegendEntry {
  value: string;
  color: string;
  payload?: { totalCost: number; percent: number };
}

function CustomLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-3 justify-center mt-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-neutral-fg2">{entry.value}</span>
          {entry.payload && (
            <span className="text-neutral-fg3">
              (${entry.payload.totalCost.toFixed(2)} / {(entry.payload.percent * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CostByModelChart() {
  const costByModel = useUsageStore((s) => s.costByModel);

  if (costByModel.length === 0) {
    return (
      <div className="card-glow p-8 animate-fade-up stagger-3">
        <h3 className="text-title text-neutral-fg1 mb-6">Custo por Modelo</h3>
        <div className="flex flex-col items-center justify-center h-[250px] text-neutral-fg3">
          <PieChartIcon className="h-10 w-10 mb-2 opacity-30" />
          <span className="text-[13px]">Sem dados</span>
        </div>
      </div>
    );
  }

  const totalCost = costByModel.reduce((sum, e) => sum + e.totalCost, 0);
  const data = costByModel.map((entry) => ({
    ...entry,
    percent: totalCost > 0 ? entry.totalCost / totalCost : 0,
  }));

  return (
    <div className="card-glow p-8 animate-fade-up stagger-3">
      <h3 className="text-title text-neutral-fg1 mb-6">Custo por Modelo</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="totalCost"
            nameKey="model"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={50}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ModelTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
