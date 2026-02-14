import { Outlet, useLocation, useParams } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { ActiveAgentBar } from "./active-agent-bar";
import { ChatPanel } from "../chat/chat-panel";
import { ToastContainer } from "../ui/toast-container";

export function AppLayout() {
  const location = useLocation();
  const { id: projectId } = useParams();
  const isProjectRoute = location.pathname.startsWith("/project/");

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-gradient-to-br from-page via-surface-hover/20 to-page">
        <AppSidebar />
        {/* Separator with subtle shadow */}
        <div className="w-[1px] bg-gradient-to-b from-transparent via-edge-light to-transparent" />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              <Outlet />
            </main>
            {isProjectRoute && projectId && <ChatPanel projectId={projectId} />}
          </div>
          <ActiveAgentBar />
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
