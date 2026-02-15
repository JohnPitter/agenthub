import { useRef, useEffect } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { Search, Bell, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useNotificationStore, useUnreadCount } from "../../stores/notification-store";
import { useCommandPalette } from "../../hooks/use-command-palette";
import { NotificationPanel } from "./notification-panel";
import { CommandPalette } from "../ui/command-palette";

const ROUTE_LABELS: Record<string, string> = {
  board: "Board",
  tasks: "Tasks",
  agents: "Agentes",
  files: "Arquivos",
  prs: "Pull Requests",
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

  const { activeProjectId } = useWorkspaceStore();
  const project = projects.find((p) => p.id === projectId);
  const segment = location.pathname.split("/").pop();
  const pageLabel = segment && ROUTE_LABELS[segment] ? ROUTE_LABELS[segment] : null;

  const isDashboard = location.pathname === "/";

  const PAGE_TITLES: Record<string, string> = {
    "/analytics": "Analytics",
    "/settings": "Configurações",
  };
  const standalonePageTitle = PAGE_TITLES[location.pathname] ?? null;

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
    <header className="relative z-10 flex h-12 shrink-0 flex-col bg-neutral-bg1">
      {/* Gradient accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-brand via-purple to-brand bg-[length:200%_100%] animate-gradient" />

      {/* Header content */}
      <div className="flex flex-1 items-center justify-between px-6 border-b border-stroke2">
        {/* Left */}
      <div>
        {isDashboard ? (
          <h1 className="text-[15px] font-semibold text-neutral-fg1">Dashboard</h1>
        ) : standalonePageTitle ? (
          <h1 className="text-[15px] font-semibold text-neutral-fg1">{standalonePageTitle}</h1>
        ) : project ? (
          <div className="flex items-center gap-2 text-[14px]">
            <Link
              to={`/project/${project.id}`}
              className="font-semibold text-neutral-fg1 hover:text-brand transition-colors"
            >
              {project.name}
            </Link>
            {pageLabel && (
              <>
                <span className="text-neutral-fg-disabled">/</span>
                <span className="font-medium text-neutral-fg2">{pageLabel}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-[14px] font-semibold text-brand">
            AgentHub
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {activeProjectId && (
          <button
            onClick={toggleChatPanel}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold transition-colors",
              chatPanelOpen
                ? "bg-brand text-white"
                : "bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover",
            )}
          >
            <MessageSquare className="h-4 w-4" strokeWidth={2} />
            Chat
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2 rounded-md bg-neutral-bg2 px-4 py-2 text-neutral-fg3 hover:bg-neutral-bg-hover transition-colors"
        >
          <Search className="h-4 w-4" strokeWidth={2} />
          <span className="text-[13px]">Buscar...</span>
          <kbd className="ml-1 rounded-md bg-neutral-bg1 px-2 py-1 text-[10px] font-semibold text-neutral-fg3 border border-stroke">
            ⌘K
          </kbd>
        </button>

        <div ref={bellRef} className="relative">
          <button
            onClick={togglePanel}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              panelOpen
                ? "bg-brand-light text-brand"
                : "text-neutral-fg3 hover:bg-neutral-bg-hover",
            )}
          >
            <Bell className="h-4.5 w-4.5" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {panelOpen && <NotificationPanel />}
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-brand to-purple text-[12px] font-semibold text-white cursor-pointer">
          JP
        </div>
      </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
