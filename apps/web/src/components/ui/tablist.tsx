import { cn } from "../../lib/utils";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TablistProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function Tablist({ tabs, activeTab, onChange }: TablistProps) {
  return (
    <div className="flex items-center gap-0">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative px-3 py-3 text-[13px] font-medium transition-colors",
              isActive
                ? "text-brand"
                : "text-neutral-fg3 hover:text-neutral-fg2",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "ml-1.5 text-[11px]",
                  isActive ? "text-brand" : "text-neutral-fg-disabled",
                )}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-1 right-1 h-[1.5px] bg-brand rounded-full transition-all" />
            )}
          </button>
        );
      })}
    </div>
  );
}
