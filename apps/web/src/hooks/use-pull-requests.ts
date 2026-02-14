import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/utils";

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  url: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean;
  draft: boolean;
  labels: string[];
}

export interface PRCheck {
  name: string;
  status: string;
  conclusion: string;
}

export interface PRReview {
  id: number;
  user: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  body: string;
  submittedAt: string;
}

interface GitHubStatus {
  available: boolean;
  authenticated: boolean;
  repoSlug: string | null;
  reason: string | null;
}

export function usePullRequests(projectId: string | undefined) {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [filter, setFilter] = useState<"open" | "closed" | "merged" | "all">("open");

  const checkStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api<GitHubStatus>(`/projects/${projectId}/prs/status`);
      setGhStatus(data);
    } catch {
      setGhStatus({ available: false, authenticated: false, repoSlug: null, reason: "Failed to check status" });
    }
  }, [projectId]);

  const fetchPRs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api<{ prs: PullRequest[] }>(`/projects/${projectId}/prs?state=${filter}`);
      setPrs(data.prs);
    } catch {
      setPrs([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, filter]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (ghStatus?.available && ghStatus.authenticated && ghStatus.repoSlug) {
      fetchPRs();
    } else {
      setLoading(false);
    }
  }, [ghStatus, fetchPRs]);

  const createPR = async (data: {
    title: string;
    body: string;
    headBranch: string;
    baseBranch: string;
    draft?: boolean;
    taskId?: string;
  }): Promise<PullRequest | null> => {
    if (!projectId) return null;
    const result = await api<{ pr: PullRequest }>(`/projects/${projectId}/prs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (result.pr) {
      setPrs((prev) => [result.pr, ...prev]);
    }
    return result.pr;
  };

  const mergePR = async (prNumber: number, method: "merge" | "squash" | "rebase" = "squash") => {
    if (!projectId) return false;
    const result = await api<{ success: boolean }>(`/projects/${projectId}/prs/${prNumber}/merge`, {
      method: "POST",
      body: JSON.stringify({ method }),
    });
    if (result.success) {
      setPrs((prev) => prev.map((pr) => (pr.number === prNumber ? { ...pr, state: "merged" as const } : pr)));
    }
    return result.success;
  };

  const closePR = async (prNumber: number) => {
    if (!projectId) return false;
    const result = await api<{ success: boolean }>(`/projects/${projectId}/prs/${prNumber}/close`, {
      method: "POST",
    });
    if (result.success) {
      setPrs((prev) => prev.map((pr) => (pr.number === prNumber ? { ...pr, state: "closed" as const } : pr)));
    }
    return result.success;
  };

  const getPRDetail = async (prNumber: number) => {
    if (!projectId) return null;
    return api<{ pr: PullRequest; reviews: PRReview[]; checks: { status: string; checks: PRCheck[] } }>(
      `/projects/${projectId}/prs/${prNumber}`
    );
  };

  return {
    prs,
    loading,
    ghStatus,
    filter,
    setFilter,
    createPR,
    mergePR,
    closePR,
    getPRDetail,
    refresh: fetchPRs,
  };
}
