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
        <div className="bg-white border border-edge-light rounded-lg shadow-md p-3">
          <p className="text-[11px] font-semibold text-text-primary mb-1.5">
            {new Date(payload[0].payload.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green" />
              <span className="text-[10px] text-text-tertiary">Completed:</span>
              <span className="text-[11px] font-semibold text-green">{payload[0].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red" />
              <span className="text-[10px] text-text-tertiary">Failed:</span>
              <span className="text-[11px] font-semibold text-red">{payload[1].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-[10px] text-text-tertiary">Total:</span>
              <span className="text-[11px] font-semibold text-primary">{payload[2].value}</span>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#DADDE1" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 10, fill: "#8A8D91" }}
            tickLine={false}
            axisLine={{ stroke: "#DADDE1" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8A8D91" }}
            tickLine={false}
            axisLine={{ stroke: "#DADDE1" }}
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
            stroke="#31A24C"
            fill="#31A24C"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="failed"
            name="Failed"
            stroke="#E4405F"
            fill="#E4405F"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#0866FF"
            fill="#0866FF"
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
        <CartesianGrid strokeDasharray="3 3" stroke="#DADDE1" />
        <XAxis
          dataKey="displayDate"
          tick={{ fontSize: 10, fill: "#8A8D91" }}
          tickLine={false}
          axisLine={{ stroke: "#DADDE1" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#8A8D91" }}
          tickLine={false}
          axisLine={{ stroke: "#DADDE1" }}
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
          stroke="#31A24C"
          strokeWidth={2}
          dot={{ fill: "#31A24C", r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="failed"
          name="Failed"
          stroke="#E4405F"
          strokeWidth={2}
          dot={{ fill: "#E4405F", r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="Total"
          stroke="#0866FF"
          strokeWidth={2}
          dot={{ fill: "#0866FF", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
