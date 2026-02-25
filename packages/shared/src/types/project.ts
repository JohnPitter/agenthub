export interface Project {
  id: string;
  name: string;
  path: string;
  stack: string[];
  icon: string | null;
  description: string | null;
  status: "active" | "archived";
  githubUrl: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  owner: { login: string; avatar_url: string };
}
