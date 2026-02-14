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
    <header className="glass relative z-10 flex h-16 shrink-0 items-center justify-between px-8 shadow-md border-b border-edge-light/50">
      {/* Enhanced gradient accent line with glow */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-primary opacity-70 shadow-sm" />

      {/* Left */}
      <div>
        {isDashboard ? (
          <h1 className="text-[18px] font-bold text-text-primary tracking-tight">Dashboard</h1>
        ) : standalonePageTitle ? (
          <h1 className="text-[18px] font-bold text-text-primary tracking-tight">{standalonePageTitle}</h1>
        ) : project ? (
          <div className="flex items-center gap-2.5 text-[15px]">
            <Link
              to={`/project/${project.id}`}
              className="font-bold text-text-primary hover:text-primary transition-all hover:scale-105"
            >
              {project.name}
            </Link>
            {pageLabel && (
              <>
                <span className="text-text-placeholder font-light">/</span>
                <span className="font-semibold text-text-secondary">{pageLabel}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-[15px] font-bold bg-gradient-primary bg-clip-text text-transparent">
            AgentHub
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {isProjectRoute && (
          <button
            onClick={toggleChatPanel}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-[14px] font-bold transition-all duration-300",
              chatPanelOpen
                ? "bg-gradient-primary text-white shadow-lg glow-primary scale-105"
                : "bg-page text-text-secondary hover:bg-surface-hover hover:shadow-md",
            )}
          >
            <MessageSquare className="h-4.5 w-4.5" strokeWidth={2.2} />
            Chat
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2.5 rounded-xl bg-page px-5 py-2.5 text-text-placeholder hover:bg-surface-hover hover:shadow-md transition-all duration-300"
        >
          <Search className="h-4.5 w-4.5" strokeWidth={2} />
          <span className="text-[14px] font-semibold">Buscar...</span>
          <kbd className="ml-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-text-tertiary border border-edge-light shadow-sm">
            ⌘K
          </kbd>
        </button>

        <div ref={bellRef} className="relative">
          <button
            onClick={togglePanel}
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300",
              panelOpen
                ? "bg-gradient-to-br from-primary-light to-purple-light text-primary shadow-lg scale-105"
                : "text-text-tertiary hover:bg-page hover:shadow-md",
            )}
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-gradient-danger px-2 text-[11px] font-bold text-white shadow-lg glow-red">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {panelOpen && <NotificationPanel />}
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-[14px] font-bold text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer">
          JP
        </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
