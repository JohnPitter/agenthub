import { useEffect, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppLayout } from "./components/layout/app-layout";
import { ProtectedRoute } from "./components/auth/protected-route";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { LandingPage } from "./routes/landing";
import { LoginPage } from "./routes/login";
import { Dashboard } from "./routes/dashboard";
import { getSocket } from "./lib/socket";
import { useWorkspaceStore } from "./stores/workspace-store";
import type { Agent, AgentUpdatedEvent } from "@agenthub/shared";

// Lazy-loaded route pages (heavy deps: Monaco, Recharts, large components)
const ProjectOverview = lazy(() => import("./routes/project-overview").then((m) => ({ default: m.ProjectOverview })));
const ProjectBoard = lazy(() => import("./routes/project-board").then((m) => ({ default: m.ProjectBoard })));
const ProjectTasks = lazy(() => import("./routes/project-tasks").then((m) => ({ default: m.ProjectTasks })));
const ProjectAgents = lazy(() => import("./routes/project-agents").then((m) => ({ default: m.ProjectAgents })));
const ProjectSettings = lazy(() => import("./routes/project-settings").then((m) => ({ default: m.ProjectSettings })));
const ProjectFiles = lazy(() => import("./routes/project-files").then((m) => ({ default: m.ProjectFiles })));
const ProjectPRs = lazy(() => import("./routes/project-prs").then((m) => ({ default: m.ProjectPRs })));
const ProjectPreview = lazy(() => import("./routes/project-preview").then((m) => ({ default: m.ProjectPreview })));
const ProjectsPage = lazy(() => import("./routes/projects-page").then((m) => ({ default: m.ProjectsPage })));
const Analytics = lazy(() => import("./routes/analytics").then((m) => ({ default: m.Analytics })));
const AgentsPage = lazy(() => import("./routes/agents").then((m) => ({ default: m.AgentsPage })));
const TasksPage = lazy(() => import("./routes/tasks").then((m) => ({ default: m.TasksPage })));
const SettingsPage = lazy(() => import("./routes/settings").then((m) => ({ default: m.SettingsPage })));
const DocsPage = lazy(() => import("./routes/docs").then((m) => ({ default: m.DocsPage })));
const TeamSettings = lazy(() => import("./components/teams/team-settings").then((m) => ({ default: m.TeamSettings })));

function RouteLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}

export function App() {
  useEffect(() => {
    const socket = getSocket();
    const onAgentUpdated = (data: AgentUpdatedEvent) => {
      const updated = data.agent as unknown as Agent;
      const { agents, setAgents } = useWorkspaceStore.getState();
      setAgents(agents.map((a) => (a.id === updated.id ? updated : a)));
    };
    socket.on("agent:updated", onAgentUpdated);
    return () => {
      socket.off("agent:updated", onAgentUpdated);
    };
  }, []);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/projects" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectsPage /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectOverview /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/board" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectBoard /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/tasks" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectTasks /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/agents" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectAgents /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/files" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectFiles /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/prs" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectPRs /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/preview" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectPreview /></Suspense></ErrorBoundary>} />
            <Route path="/project/:id/settings" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><ProjectSettings /></Suspense></ErrorBoundary>} />
            <Route path="/agents" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><AgentsPage /></Suspense></ErrorBoundary>} />
            <Route path="/tasks" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><TasksPage /></Suspense></ErrorBoundary>} />
            <Route path="/analytics" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><Analytics /></Suspense></ErrorBoundary>} />
            <Route path="/docs" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><DocsPage /></Suspense></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><SettingsPage /></Suspense></ErrorBoundary>} />
            <Route path="/settings/integrations" element={<div className="p-6">Integrations</div>} />
            <Route path="/teams/:id/settings" element={<ErrorBoundary><Suspense fallback={<RouteLoader />}><TeamSettings /></Suspense></ErrorBoundary>} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
