import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { ActiveAgentBar } from "./active-agent-bar";
import { ChatPanel } from "../chat/chat-panel";
import { ToastContainer } from "../ui/toast-container";
import { useWorkspaceStore } from "../../stores/workspace-store";

export function AppLayout() {
  const { id: projectId } = useParams();
  const { setActiveProject } = useWorkspaceStore();

  // Update active project when route changes
  useEffect(() => {
    setActiveProject(projectId || null);
  }, [projectId, setActiveProject]);

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-app-bg p-5 gap-6">
        <AppSidebar />
        <ChatPanel />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stroke bg-neutral-bg2/50">
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
