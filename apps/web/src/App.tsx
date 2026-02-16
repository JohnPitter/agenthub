import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
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

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/integrations" element={<div className="p-6">Integrations (Phase 6)</div>} />
      </Route>
    </Routes>
  );
}
