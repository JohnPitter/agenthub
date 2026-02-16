import { getAgentAvatarUrl } from "../../lib/agent-avatar";
import { cn } from "../../lib/utils";

interface AgentAvatarProps {
  name: string;
  avatar?: string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: { px: 36, cls: "h-9 w-9 text-[13px]" },
  md: { px: 40, cls: "h-10 w-10 text-[14px]" },
  lg: { px: 56, cls: "h-14 w-14 text-[22px]" },
};

export function AgentAvatar({ name, avatar, color, size = "md", className }: AgentAvatarProps) {
  const { px, cls } = SIZE_MAP[size];
  const url = getAgentAvatarUrl(avatar, px);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn("shrink-0 rounded-lg bg-neutral-bg2", cls, className)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        cls,
        className,
      )}
      style={{ backgroundColor: color ?? "#6366F1" }}
    >
      {name.charAt(0)}
    </div>
  );
}
