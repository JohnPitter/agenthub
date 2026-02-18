import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { ProtectedRoute } from "./components/auth/protected-route";
import { LandingPage } from "./routes/landing";
import { LoginPage } from "./routes/login";
import { Dashboard } from "./routes/dashboard";
import { ProjectOverview } from "./routes/project-overview";
import { ProjectBoard } from "./routes/project-board";
import { ProjectTasks } from "./routes/project-tasks";
import { ProjectAgents } from "./routes/project-agents";
import { ProjectSettings } from "./routes/project-settings";
import { ProjectFiles } from "./routes/project-files";
import { ProjectPRs } from "./routes/project-prs";
import { ProjectPreview } from "./routes/project-preview";
import { Analytics } from "./routes/analytics";
import { AgentsPage } from "./routes/agents";
import { TasksPage } from "./routes/tasks";
import { SettingsPage } from "./routes/settings";
import { DocsPage } from "./routes/docs";
import { getSocket } from "./lib/socket";
import { useWorkspaceStore } from "./stores/workspace-store";
import type { Agent } from "@agenthub/shared";

export function App() {
  useEffect(() => {
    const socket = getSocket();
    const onAgentUpdated = (data: { agent: Record<string, unknown> }) => {
      const updated = data.agent as unknown as Agent;
      const { agents, setAgents } = useWorkspaceStore.getState();
      setAgents(agents.map((a) => (a.id === updated.id ? updated : a)));
    };
    socket.on("agent:updated" as any, onAgentUpdated);
    return () => {
      socket.off("agent:updated" as any, onAgentUpdated);
    };
  }, []);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectOverview />} />
          <Route path="/project/:id/board" element={<ProjectBoard />} />
          <Route path="/project/:id/tasks" element={<ProjectTasks />} />
          <Route path="/project/:id/agents" element={<ProjectAgents />} />
          <Route path="/project/:id/files" element={<ProjectFiles />} />
          <Route path="/project/:id/prs" element={<ProjectPRs />} />
          <Route path="/project/:id/preview" element={<ProjectPreview />} />
          <Route path="/project/:id/settings" element={<ProjectSettings />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/integrations" element={<div className="p-6">Integrations</div>} />
        </Route>
      </Route>
    </Routes>
  );
}
