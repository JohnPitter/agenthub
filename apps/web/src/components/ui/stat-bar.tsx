import { type LucideIcon, FolderOpen, Bot, Zap, Eye, CheckCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface Stat {
  label: string;
  value: string | number;
  color?: string;
  icon?: LucideIcon;
}

interface StatBarProps {
  stats: Stat[];
}

const DEFAULT_ICONS: Record<string, LucideIcon> = {
  projects: FolderOpen,
  projetos: FolderOpen,
  agents: Bot,
  agentes: Bot,
  "in progress": Zap,
  "em progresso": Zap,
  running: Zap,
  review: Eye,
  revisão: Eye,
  done: CheckCircle,
  concluídas: CheckCircle,
  completed: CheckCircle,
};

function resolveIcon(stat: Stat): LucideIcon | undefined {
  if (stat.icon) return stat.icon;
  const key = stat.label.toLowerCase();
  for (const [k, v] of Object.entries(DEFAULT_ICONS)) {
    if (key.includes(k)) return v;
  }
  return undefined;
}

export function StatBar({ stats }: StatBarProps) {
  return (
    <div
      className={cn(
        "grid gap-3 px-6 py-4",
        stats.length <= 3 && "grid-cols-3",
        stats.length === 4 && "grid-cols-4",
        stats.length >= 5 && "grid-cols-5",
      )}
    >
      {stats.map((stat, i) => {
        const Icon = resolveIcon(stat);
        return (
          <div
            key={stat.label}
            className={cn(
              "stat-card group flex flex-col gap-3 animate-fade-up",
              i === 0 && "stagger-1",
              i === 1 && "stagger-2",
              i === 2 && "stagger-3",
              i === 3 && "stagger-4",
              i === 4 && "stagger-5",
            )}
            style={stat.color ? { borderLeftWidth: 2, borderLeftColor: stat.color } : undefined}
          >
            <div className="flex items-center justify-between">
              {Icon && (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                  style={{
                    backgroundColor: stat.color ? `${stat.color}12` : "var(--color-neutral-bg3)",
                  }}
                >
                  <Icon
                    className="h-4.5 w-4.5 transition-colors"
                    strokeWidth={1.8}
                    style={{ color: stat.color || "var(--color-neutral-fg3)" }}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span
                className="text-[24px] font-bold leading-none tracking-tight"
                style={stat.color ? { color: stat.color } : undefined}
              >
                {stat.value}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-fg3">
                {stat.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
