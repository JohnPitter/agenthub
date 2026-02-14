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
  board: "Live Board",
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

  const project = projects.find((p) => p.id === projectId);
  const segment = location.pathname.split("/").pop();
  const pageLabel = segment && ROUTE_LABELS[segment] ? ROUTE_LABELS[segment] : null;

  const isDashboard = location.pathname === "/";
  const isProjectRoute = location.pathname.startsWith("/project/");

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
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between bg-white px-6 shadow-xs">
      {/* Left */}
      <div>
        {isDashboard ? (
          <h1 className="text-[16px] font-semibold text-text-primary">Dashboard</h1>
        ) : standalonePageTitle ? (
          <h1 className="text-[16px] font-semibold text-text-primary">{standalonePageTitle}</h1>
        ) : project ? (
          <div className="flex items-center gap-2 text-[14px]">
            <Link
              to={`/project/${project.id}`}
              className="font-semibold text-text-primary hover:text-primary transition-colors"
            >
              {project.name}
            </Link>
            {pageLabel && (
              <>
                <span className="text-text-placeholder">/</span>
                <span className="text-text-secondary">{pageLabel}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-[14px] font-semibold text-text-primary">AgentHub</span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {isProjectRoute && (
          <button
            onClick={toggleChatPanel}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              chatPanelOpen
                ? "bg-primary text-white"
                : "bg-page text-text-secondary hover:bg-sidebar-hover",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-page px-3 py-1.5 text-text-placeholder hover:bg-sidebar-hover transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="text-[13px]">Buscar...</span>
          <kbd className="ml-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary border border-edge-light">
            ⌘K
          </kbd>
        </button>

        <div ref={bellRef} className="relative">
          <button
            onClick={togglePanel}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              panelOpen ? "bg-primary-light text-primary" : "text-text-tertiary hover:bg-page",
            )}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {panelOpen && <NotificationPanel />}
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white">
          JP
        </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
