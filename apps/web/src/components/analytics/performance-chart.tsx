import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface TrendDataPoint {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

interface PerformanceChartProps {
  data: TrendDataPoint[];
  type?: "line" | "area";
}

const CHART_COLORS = {
  success: "var(--rt-success)",
  danger: "var(--rt-danger)",
  info: "var(--rt-info)",
  grid: "var(--rt-stroke)",
  tick: "var(--rt-neutral-fg3)",
};

export function PerformanceChart({ data, type = "area" }: PerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-[13px] text-neutral-fg3">
        No data available for the selected period
      </div>
    );
  }

  const formattedData = data.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; payload: TrendDataPoint }> }) => {
    if (active && payload && payload.length) {
      const point = payload[0]?.payload;
      if (!point) return null;
      const getValue = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;
      return (
        <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3">
          <p className="text-[11px] font-semibold text-neutral-fg1 mb-1.5">
            {new Date(point.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-[10px] text-neutral-fg3">Completed:</span>
              <span className="text-[11px] font-semibold text-success">{getValue("completed")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger" />
              <span className="text-[10px] text-neutral-fg3">Failed:</span>
              <span className="text-[11px] font-semibold text-danger">{getValue("failed")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-[10px] text-neutral-fg3">Total:</span>
              <span className="text-[11px] font-semibold text-brand">{getValue("total")}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 10, fill: CHART_COLORS.tick }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_COLORS.tick }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
            iconType="circle"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke={CHART_COLORS.success}
            fill={CHART_COLORS.success}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="failed"
            name="Failed"
            stroke={CHART_COLORS.danger}
            fill={CHART_COLORS.danger}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total"
            stroke={CHART_COLORS.info}
            fill={CHART_COLORS.info}
            fillOpacity={0.08}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="displayDate"
          tick={{ fontSize: 10, fill: CHART_COLORS.tick }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: CHART_COLORS.tick }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
          iconType="circle"
          iconSize={8}
        />
        <Line
          type="monotone"
          dataKey="completed"
          name="Completed"
          stroke={CHART_COLORS.success}
          strokeWidth={2}
          dot={{ fill: CHART_COLORS.success, r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="failed"
          name="Failed"
          stroke={CHART_COLORS.danger}
          strokeWidth={2}
          dot={{ fill: CHART_COLORS.danger, r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="Total"
          stroke={CHART_COLORS.info}
          strokeWidth={2}
          dot={{ fill: CHART_COLORS.info, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
