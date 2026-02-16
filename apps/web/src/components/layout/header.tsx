import { useRef, useState, useEffect } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { Search, Bell, MessageSquare, Settings, LogOut, User } from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useNotificationStore, useUnreadCount } from "../../stores/notification-store";
import { useCommandPalette } from "../../hooks/use-command-palette";
import { useUserStore } from "../../stores/user-store";
import { useAuthStore } from "../../stores/auth-store";
import { getAgentAvatarUrl } from "../../lib/agent-avatar";
import { NotificationPanel } from "./notification-panel";
import { CommandPalette } from "../ui/command-palette";

const ROUTE_LABELS: Record<string, string> = {
  board: "Board",
  tasks: "Tasks",
  agents: "Agentes",
  files: "Arquivos",
  prs: "Pull Requests",
  preview: "Preview",
  settings: "Configurações",
};

export function Header() {
  const { id: projectId } = useParams();
  const location = useLocation();
  const { projects, chatPanelOpen, toggleChatPanel } = useWorkspaceStore();
  const unreadCount = useUnreadCount();
  const { panelOpen, togglePanel } = useNotificationStore();
  const { open: commandOpen, setOpen: setCommandOpen } = useCommandPalette();
  const { name: userName, avatar: userAvatar, color: userColor } = useUserStore();
  const authUser = useAuthStore((s) => s.user);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const userAvatarUrl = getAgentAvatarUrl(userAvatar, 36);
  const displayAvatar = authUser?.avatarUrl ?? userAvatarUrl;
  const displayName = authUser?.name ?? userName;
  const userInitials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const { activeProjectId } = useWorkspaceStore();
  const project = projects.find((p) => p.id === projectId);
  const segment = location.pathname.split("/").pop();
  const pageLabel = segment && ROUTE_LABELS[segment] ? ROUTE_LABELS[segment] : null;

  const isDashboard = location.pathname === "/dashboard";

  const PAGE_TITLES: Record<string, string> = {
    "/analytics": "Analytics",
    "/settings": "Configurações",
  };
  const standalonePageTitle = PAGE_TITLES[location.pathname] ?? null;

  useEffect(() => {
    if (!panelOpen && !profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelOpen && bellRef.current && !bellRef.current.contains(e.target as Node)) {
        togglePanel();
      }
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelOpen, togglePanel, profileOpen]);

  return (
    <header className="relative z-10 flex h-14 shrink-0 flex-col bg-neutral-bg1">
      {/* Gradient accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-brand/40 via-purple/30 to-brand/40 bg-[length:200%_100%] animate-gradient" />

      {/* Header content */}
      <div className="flex flex-1 items-center justify-between px-6 border-b border-stroke2">
        {/* Left */}
      <div>
        {isDashboard ? (
          <h1 className="text-[17px] font-semibold text-neutral-fg1">Dashboard</h1>
        ) : standalonePageTitle ? (
          <h1 className="text-[17px] font-semibold text-neutral-fg1">{standalonePageTitle}</h1>
        ) : project ? (
          <div className="flex items-center gap-2 text-[15px]">
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
          <span className="text-[15px] font-semibold text-brand">
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
              "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-200",
              chatPanelOpen
                ? "bg-gradient-to-r from-brand to-purple text-white shadow-brand"
                : "bg-neutral-bg2 text-neutral-fg2 hover:bg-neutral-bg-hover border border-stroke",
            )}
          >
            <MessageSquare className="h-4 w-4" strokeWidth={2} />
            Chat
          </button>
        )}

        <button
          onClick={() => setCommandOpen(true)}
          className="glass-strong flex items-center gap-2 rounded-lg px-4 py-2 text-neutral-fg3 hover:text-neutral-fg2 hover:border-stroke-active transition-all duration-200 focus:ring-2 focus:ring-brand/20"
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
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
              panelOpen
                ? "bg-brand-light text-brand"
                : "text-neutral-fg3 hover:bg-neutral-bg-hover",
            )}
          >
            <Bell className="h-4.5 w-4.5" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {panelOpen && <NotificationPanel />}
        </div>

        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-semibold text-white ring-2 transition-all duration-200 overflow-hidden",
              profileOpen ? "ring-brand/40" : "ring-transparent hover:ring-brand/20",
            )}
            style={!displayAvatar ? { backgroundColor: userColor } : undefined}
          >
            {displayAvatar ? (
              <img src={displayAvatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              userInitials
            )}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-neutral-bg1 border border-stroke2 shadow-16 animate-fade-up overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-stroke2">
                <p className="text-[13px] font-semibold text-neutral-fg1">{authUser?.name ?? userName}</p>
                <p className="text-[11px] text-neutral-fg3 mt-0.5">{authUser?.login ? `@${authUser.login}` : "Administrador"}</p>
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                <Link
                  to="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                >
                  <User className="h-4 w-4 text-neutral-fg3" />
                  Meu Perfil
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                >
                  <Settings className="h-4 w-4 text-neutral-fg3" />
                  Configurações
                </Link>
              </div>

              <div className="border-t border-stroke2 py-1.5">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    useAuthStore.getState().logout();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger-light"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
