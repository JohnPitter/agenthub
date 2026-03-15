import { useEffect } from "react";
import { Outlet, useParams, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { ActiveAgentBar } from "./active-agent-bar";
import { ChatPanel } from "../chat/chat-panel";
import { ToastContainer } from "../ui/toast-container";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { cn } from "../../lib/utils";

export function AppLayout() {
  const { id: projectId } = useParams();
  const location = useLocation();
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const mobileSidebarOpen = useWorkspaceStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useWorkspaceStore((s) => s.setMobileSidebarOpen);

  // Update active project when route changes
  useEffect(() => {
    setActiveProject(projectId || null);
  }, [projectId, setActiveProject]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, setMobileSidebarOpen]);

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-app-bg flex-col md:flex-row p-2 md:p-5 gap-2 md:gap-6">
        {/* Mobile hamburger button */}
        <button
          className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-neutral-bg2 border border-stroke shadow-2"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          aria-label="Toggle menu"
        >
          {mobileSidebarOpen ? (
            <X className="h-5 w-5 text-neutral-fg2" />
          ) : (
            <Menu className="h-5 w-5 text-neutral-fg2" />
          )}
        </button>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 animate-fade-in"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar — hidden on mobile, shown via overlay; collapsed on tablet; expanded on desktop */}
        <div className={cn(
          "shrink-0 z-40",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 transition-transform duration-300 md:relative md:inset-auto md:translate-x-0",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Add padding on mobile for the sidebar
          "p-2 md:p-0",
        )}>
          <AppSidebar />
        </div>

        <ChatPanel />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stroke bg-neutral-bg2/50 mt-12 md:mt-0">
          <Header />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
          <ActiveAgentBar />
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
