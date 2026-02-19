import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Bot, ListTodo, FileText, BarChart3, Settings,
  FolderOpen, Columns3, ClipboardList, Users, FolderTree, GitPullRequest,
  Eye, Cog,
} from "lucide-react";

export type HelpPageKey =
  | "dashboard"
  | "agents"
  | "tasks"
  | "docs"
  | "analytics"
  | "settings"
  | "projectOverview"
  | "projectBoard"
  | "projectTasks"
  | "projectAgents"
  | "projectFiles"
  | "projectPrs"
  | "projectPreview"
  | "projectSettings";

interface HelpPageConfig {
  icon: LucideIcon;
  featureCount: number;
  tipCount: number;
  shortcuts: string[];
}

export const HELP_PAGES: Record<HelpPageKey, HelpPageConfig> = {
  dashboard: {
    icon: LayoutDashboard,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  agents: {
    icon: Bot,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  tasks: {
    icon: ListTodo,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  docs: {
    icon: FileText,
    featureCount: 3,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  analytics: {
    icon: BarChart3,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  settings: {
    icon: Settings,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectOverview: {
    icon: FolderOpen,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectBoard: {
    icon: Columns3,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectTasks: {
    icon: ClipboardList,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectAgents: {
    icon: Users,
    featureCount: 3,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectFiles: {
    icon: FolderTree,
    featureCount: 3,
    tipCount: 2,
    shortcuts: ["search", "saveFile", "toggleHelp"],
  },
  projectPrs: {
    icon: GitPullRequest,
    featureCount: 3,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectPreview: {
    icon: Eye,
    featureCount: 3,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
  projectSettings: {
    icon: Cog,
    featureCount: 4,
    tipCount: 2,
    shortcuts: ["search", "toggleHelp"],
  },
};

const ROUTE_MATCHERS: [RegExp, HelpPageKey][] = [
  [/^\/project\/[^/]+\/board$/, "projectBoard"],
  [/^\/project\/[^/]+\/tasks$/, "projectTasks"],
  [/^\/project\/[^/]+\/agents$/, "projectAgents"],
  [/^\/project\/[^/]+\/files$/, "projectFiles"],
  [/^\/project\/[^/]+\/prs$/, "projectPrs"],
  [/^\/project\/[^/]+\/preview$/, "projectPreview"],
  [/^\/project\/[^/]+\/settings$/, "projectSettings"],
  [/^\/project\/[^/]+\/?$/, "projectOverview"],
  [/^\/dashboard$/, "dashboard"],
  [/^\/agents$/, "agents"],
  [/^\/tasks$/, "tasks"],
  [/^\/docs$/, "docs"],
  [/^\/analytics$/, "analytics"],
  [/^\/settings$/, "settings"],
];

export function resolveHelpKey(pathname: string): HelpPageKey {
  for (const [regex, key] of ROUTE_MATCHERS) {
    if (regex.test(pathname)) return key;
  }
  return "dashboard";
}
