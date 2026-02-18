import { useTranslation } from "react-i18next";
import { Bot, GitFork, Merge, CircleDot, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import type { WorkflowNodeType } from "@agenthub/shared";

interface WorkflowNodeProps {
  id: string;
  type: WorkflowNodeType;
  label: string;
  agentName?: string;
  agentRole?: string;
  isSelected: boolean;
  isEntry?: boolean;
  onClick: () => void;
}

const NODE_STYLES: Record<WorkflowNodeType, {
  bg: string;
  bgSelected: string;
  ring: string;
  icon: string;
  badge: string;
  badgeText: string;
}> = {
  agent: {
    bg: "bg-success-light/40 border-success/30",
    bgSelected: "bg-success-light ring-2 ring-success shadow-4",
    ring: "ring-success",
    icon: "text-success-dark",
    badge: "bg-success-light",
    badgeText: "text-success-dark",
  },
  condition: {
    bg: "bg-warning-light/40 border-warning/30",
    bgSelected: "bg-warning-light ring-2 ring-warning shadow-4",
    ring: "ring-warning",
    icon: "text-warning",
    badge: "bg-warning-light",
    badgeText: "text-warning",
  },
  parallel: {
    bg: "bg-info-light/40 border-info/30",
    bgSelected: "bg-info-light ring-2 ring-info shadow-4",
    ring: "ring-info",
    icon: "text-info",
    badge: "bg-info-light",
    badgeText: "text-info",
  },
  merge: {
    bg: "bg-purple-50 border-purple-300/30",
    bgSelected: "bg-purple-100 ring-2 ring-purple-500 shadow-4",
    ring: "ring-purple-500",
    icon: "text-purple-600",
    badge: "bg-purple-50",
    badgeText: "text-purple-600",
  },
};

const NODE_ICONS: Record<WorkflowNodeType, typeof Bot> = {
  agent: Bot,
  condition: GitFork,
  parallel: Zap,
  merge: Merge,
};

export function WorkflowNodeComponent({
  type,
  label,
  agentName,
  agentRole,
  isSelected,
  isEntry,
  onClick,
}: WorkflowNodeProps) {
  const { t } = useTranslation();
  const style = NODE_STYLES[type];
  const Icon = NODE_ICONS[type];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-5 py-4 cursor-pointer transition-all duration-200 min-w-[220px] max-w-[280px] border",
        isSelected ? style.bgSelected : `${style.bg} hover:shadow-4`,
      )}
    >
      {isEntry && (
        <span className="absolute -top-2.5 left-4 rounded-md bg-brand px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          {t("workflow.entry", "Entrada")}
        </span>
      )}

      {/* Connection handle top */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-neutral-bg1 bg-neutral-fg-disabled opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", style.badge)}>
        <Icon className={cn("h-5 w-5", style.icon)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-neutral-fg1">
          {type === "agent" ? (agentName ?? t("workflow.noAgent", "Sem agente")) : label}
        </p>
        <p className="truncate text-[11px] text-neutral-fg3">
          {type === "agent" && agentRole
            ? agentRole
            : label}
        </p>
      </div>

      <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium", style.badge, style.badgeText)}>
        {t(`workflow.nodeType.${type}`, type)}
      </span>

      {/* Connection handle bottom */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-neutral-bg1 bg-neutral-fg-disabled opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

/** Small drag item for toolbar */
export function WorkflowNodeDragItem({
  type,
  label,
}: {
  type: WorkflowNodeType;
  label: string;
}) {
  const style = NODE_STYLES[type];
  const Icon = NODE_ICONS[type];

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-grab active:cursor-grabbing transition-all hover:shadow-2",
      style.bg,
    )}>
      <Icon className={cn("h-4 w-4", style.icon)} />
      <span className="text-[12px] font-medium text-neutral-fg1">{label}</span>
    </div>
  );
}

/** Utility: get the display icon component for a node type */
export function getNodeIcon(type: WorkflowNodeType) {
  return NODE_ICONS[type];
}

/** Utility: get the color badge for a node type */
export function getNodeBadgeClasses(type: WorkflowNodeType) {
  return NODE_STYLES[type];
}
