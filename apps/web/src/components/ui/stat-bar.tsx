interface Stat {
  label: string;
  value: string | number;
  color?: string;
}

interface StatBarProps {
  stats: Stat[];
}

export function StatBar({ stats }: StatBarProps) {
  return (
    <div className="flex items-center gap-8 border-b border-stroke bg-neutral-bg1 px-6 py-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <span
            className="text-[20px] font-semibold leading-none"
            style={stat.color ? { color: stat.color } : undefined}
          >
            {stat.value}
          </span>
          <span className="text-[12px] text-neutral-fg3">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
