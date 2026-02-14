import { useState, useEffect } from "react";
import { api } from "../lib/utils";

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export interface GitConfig {
  remoteUrl?: string;
  defaultBranch: string;
  autoCommit: boolean;
  autoCreateBranch: boolean;
  autoPR: boolean;
}

export interface GitRemoteStatus {
  remoteUrl: string;
  ahead: number;
  behind: number;
  remoteBranches: string[];
}

export function useGitStatus(projectId: string | undefined) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [lastCommit, setLastCommit] = useState<GitCommit | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<GitRemoteStatus | null>(null);
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetchGitStatus();
    fetchGitConfig();
  }, [projectId]);

  const fetchGitStatus = async () => {
    try {
      const data = await api(`/projects/${projectId}/git/status`) as {
        isGitRepo: boolean;
        status: GitStatus | null;
        remoteStatus: GitRemoteStatus | null;
        lastCommit: GitCommit | null;
      };
      setIsGitRepo(data.isGitRepo);
      setStatus(data.status);
      setRemoteStatus(data.remoteStatus);
      setLastCommit(data.lastCommit);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch git status:", error);
      setLoading(false);
    }
  };

  const fetchGitConfig = async () => {
    try {
      const data = await api(`/projects/${projectId}/git/config`) as GitConfig | null;
      setConfig(data);
    } catch (error) {
      console.error("Failed to fetch git config:", error);
    }
  };

  const initRepo = async () => {
    try {
      await api(`/projects/${projectId}/git/init`, { method: "POST" });
      await fetchGitStatus();
    } catch (error) {
      console.error("Failed to initialize git repo:", error);
      throw error;
    }
  };

  const updateConfig = async (newConfig: GitConfig) => {
    try {
      await api(`/projects/${projectId}/git/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      setConfig(newConfig);
    } catch (error) {
      console.error("Failed to update git config:", error);
      throw error;
    }
  };

  return {
    status,
    remoteStatus,
    lastCommit,
    config,
    isGitRepo,
    loading,
    initRepo,
    updateConfig,
    refresh: fetchGitStatus,
  };
}
