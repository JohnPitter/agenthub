import { useState, useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { Search, Bell, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useNotificationStore, useUnreadCount } from "../../stores/notification-store";
import { useCommandPalette } from "../../hooks/use-command-palette";
import { NotificationPanel } from "./notification-panel";
import { CommandPalette } from "../ui/command-palette";

const ROUTE_LABELS: Record<string, string> = {
  board: "Live Board",
  tasks: "Tasks",
  agents: "Agentes",
  files: "Arquivos",
  settings: "Configurações",
};

export function Header() {
  const { id: projectId } = useParams();
  const location = useLocation();
  const { projects, chatPanelOpen, toggleChatPanel } = useWorkspaceStore();
  const unreadCount = useUnreadCount();
  const { panelOpen, togglePanel } = useNotificationStore();
  const { open: commandOpen, setOpen: setCommandOpen } = useCommandPalette();
  const bellRef = useRef<HTMLDivElement>(null);

  const project = projects.find((p) => p.id === projectId);
  const segment = location.pathname.split("/").pop();
  const pageLabel = segment && ROUTE_LABELS[segment] ? ROUTE_LABELS[segment] : null;

  const isDashboard = location.pathname === "/";
  const isProjectRoute = location.pathname.startsWith("/project/");

  // Click outside to close notification panel
  useEffect(() => {
    if (!panelOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        togglePanel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelOpen, togglePanel]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge-light px-8">
      {/* Left */}
      <div>
        {isDashboard ? (
          <h1 className="text-[18px] font-semibold text-text-primary">Dashboard</h1>
        ) : project ? (
          <div className="flex items-center gap-2 text-[14px]">
            <Link
              to={`/project/${project.id}`}
              className="font-semibold text-text-primary transition-colors hover:text-primary"
            >
              {project.name}
            </Link>
            {pageLabel && (
              <>
                <span className="text-text-placeholder">/</span>
                <span className="font-medium text-text-secondary">{pageLabel}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-[14px] font-semibold text-text-primary">AgentHub</span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {isProjectRoute && (
          <button
            onClick={toggleChatPanel}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all duration-200",
              chatPanelOpen
                ? "bg-primary text-white shadow-sm"
                : "border border-edge bg-white text-text-secondary hover:border-text-placeholder",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-edge bg-white px-4 py-2 transition-all duration-200 hover:border-text-placeholder"
        >
          <Search className="h-4 w-4 text-text-tertiary" />
          <span className="text-[13px] text-text-placeholder">Buscar...</span>
          <kbd className="ml-2 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary border border-edge">
            Ctrl+K
          </kbd>
        </button>

        <div ref={bellRef} className="relative">
          <button
            onClick={togglePanel}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl text-text-tertiary transition-all duration-200",
              panelOpen ? "bg-primary-light text-primary" : "hover:bg-surface hover:text-text-secondary",
            )}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {panelOpen && <NotificationPanel />}
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-hero-from to-hero-to text-[11px] font-bold text-white">
          JP
        </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
