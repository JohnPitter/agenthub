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

export function PerformanceChart({ data, type = "area" }: PerformanceChartProps) {
  const formattedData = data.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-bg1 border border-stroke2 rounded-md shadow-4 p-3">
          <p className="text-[11px] font-semibold text-neutral-fg1 mb-1.5">
            {new Date(payload[0].payload.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-[10px] text-neutral-fg3">Completed:</span>
              <span className="text-[11px] font-semibold text-success">{payload[0].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger" />
              <span className="text-[10px] text-neutral-fg3">Failed:</span>
              <span className="text-[11px] font-semibold text-danger">{payload[1].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-[10px] text-neutral-fg3">Total:</span>
              <span className="text-[11px] font-semibold text-brand">{payload[2].value}</span>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 10, fill: "#9E9E9E" }}
            tickLine={false}
            axisLine={{ stroke: "#E0E0E0" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9E9E9E" }}
            tickLine={false}
            axisLine={{ stroke: "#E0E0E0" }}
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
            stroke="#107C10"
            fill="#107C10"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="failed"
            name="Failed"
            stroke="#B10E1C"
            fill="#B10E1C"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#0F6CBD"
            fill="#0F6CBD"
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
        <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
        <XAxis
          dataKey="displayDate"
          tick={{ fontSize: 10, fill: "#9E9E9E" }}
          tickLine={false}
          axisLine={{ stroke: "#E0E0E0" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9E9E9E" }}
          tickLine={false}
          axisLine={{ stroke: "#E0E0E0" }}
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
          stroke="#107C10"
          strokeWidth={2}
          dot={{ fill: "#107C10", r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="failed"
          name="Failed"
          stroke="#B10E1C"
          strokeWidth={2}
          dot={{ fill: "#B10E1C", r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="Total"
          stroke="#0F6CBD"
          strokeWidth={2}
          dot={{ fill: "#0F6CBD", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
