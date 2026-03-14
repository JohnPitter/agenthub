import { logger } from "../lib/logger.js";

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

export interface PullRequestCreate {
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  draft?: boolean;
}

export interface PullRequestReview {
  id: number;
  user: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  body: string;
  submittedAt: string;
}

const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 15_000;

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AgentHub",
  };
}

async function githubFetch(
  url: string,
  token: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      headers: { ...headers(token), ...options?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Map GitHub API response to our PullRequest interface
function mapPR(pr: Record<string, unknown>): PullRequest {
  const head = pr.head as Record<string, unknown> | undefined;
  const base = pr.base as Record<string, unknown> | undefined;
  const user = pr.user as Record<string, unknown> | undefined;
  const labels = (pr.labels as Array<Record<string, unknown>>) ?? [];
  const merged = pr.merged_at !== null && pr.merged_at !== undefined;

  let state: "open" | "closed" | "merged" = pr.state as "open" | "closed";
  if (merged) state = "merged";

  return {
    number: pr.number as number,
    title: pr.title as string,
    body: (pr.body as string) ?? "",
    state,
    url: pr.html_url as string,
    headBranch: (head?.ref as string) ?? "",
    baseBranch: (base?.ref as string) ?? "",
    author: (user?.login as string) ?? "",
    createdAt: pr.created_at as string,
    updatedAt: pr.updated_at as string,
    additions: (pr.additions as number) ?? 0,
    deletions: (pr.deletions as number) ?? 0,
    changedFiles: (pr.changed_files as number) ?? 0,
    mergeable: pr.mergeable === true,
    draft: (pr.draft as boolean) ?? false,
    labels: labels.map((l) => (l.name as string) ?? ""),
  };
}

export class GitHubService {
  /**
   * Check if we can access GitHub API with the given token
   */
  async isAvailable(token: string): Promise<boolean> {
    try {
      const res = await githubFetch(`${GITHUB_API}/user`, token);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * List pull requests for the repository
   */
  async listPRs(
    token: string,
    owner: string,
    repo: string,
    options?: { state?: "open" | "closed" | "merged" | "all"; limit?: number },
  ): Promise<PullRequest[]> {
    const requestedState = options?.state ?? "open";
    // GitHub API only supports open/closed/all — "merged" requires post-filtering
    const apiState =
      requestedState === "merged" ? "closed" : requestedState;
    const limit = options?.limit ?? 20;

    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=${apiState}&per_page=${limit}&sort=updated&direction=desc`,
        token,
      );

      if (!res.ok) {
        logger.error(
          `List PRs failed: ${res.status}`,
          "github-service",
        );
        return [];
      }

      const raw = (await res.json()) as Array<Record<string, unknown>>;
      let prs = raw.map(mapPR);

      if (requestedState === "merged") {
        prs = prs.filter((pr) => pr.state === "merged");
      }

      return prs;
    } catch (err) {
      logger.error(`Failed to list PRs: ${err}`, "github-service");
      return [];
    }
  }

  /**
   * Get a single PR by number
   */
  async getPR(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequest | null> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
        token,
      );
      if (!res.ok) return null;
      return mapPR((await res.json()) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  /**
   * Create a pull request
   */
  async createPR(
    token: string,
    owner: string,
    repo: string,
    data: PullRequestCreate,
  ): Promise<PullRequest | null> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            body: data.body,
            head: data.headBranch,
            base: data.baseBranch,
            draft: data.draft ?? false,
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        logger.error(
          `Create PR failed: ${res.status} ${text}`,
          "github-service",
        );
        throw new Error(`Failed to create PR: ${res.status} — ${text}`);
      }

      return mapPR((await res.json()) as Record<string, unknown>);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith("Failed to create PR")
      ) {
        throw err;
      }
      logger.error(`Create PR error: ${err}`, "github-service");
      throw new Error(`Failed to create PR: ${err}`);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
    method: "merge" | "squash" | "rebase" = "squash",
  ): Promise<boolean> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
        token,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merge_method: method }),
        },
      );

      if (!res.ok) {
        logger.error(
          `Merge PR #${prNumber} failed: ${res.status}`,
          "github-service",
        );
        return false;
      }

      // Delete branch after merge (best-effort)
      try {
        const prRes = await githubFetch(
          `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
          token,
        );
        if (prRes.ok) {
          const prData = (await prRes.json()) as {
            head?: { ref?: string };
          };
          if (prData.head?.ref) {
            await githubFetch(
              `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${prData.head.ref}`,
              token,
              { method: "DELETE" },
            );
          }
        }
      } catch {
        /* branch deletion is best-effort */
      }

      return true;
    } catch (err) {
      logger.error(`Merge PR error: ${err}`, "github-service");
      return false;
    }
  }

  /**
   * Close a pull request
   */
  async closePR(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<boolean> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "closed" }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get PR reviews
   */
  async getPRReviews(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestReview[]> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        token,
      );
      if (!res.ok) return [];

      const raw = (await res.json()) as Array<{
        id: number;
        user: { login: string };
        state: string;
        body: string;
        submitted_at: string;
      }>;

      return raw.map((r) => ({
        id: r.id,
        user: r.user.login,
        state: r.state as PullRequestReview["state"],
        body: r.body ?? "",
        submittedAt: r.submitted_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get CI checks status for a PR
   */
  async getPRChecks(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<{
    status: "pass" | "fail" | "pending" | "none";
    checks: Array<{ name: string; status: string; conclusion: string }>;
  }> {
    try {
      // Get PR head SHA first
      const prRes = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
        token,
      );
      if (!prRes.ok) return { status: "none", checks: [] };

      const prData = (await prRes.json()) as {
        head?: { sha?: string };
      };
      const sha = prData.head?.sha;
      if (!sha) return { status: "none", checks: [] };

      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        token,
      );
      if (!res.ok) return { status: "none", checks: [] };

      const data = (await res.json()) as {
        check_runs: Array<{
          name: string;
          status: string;
          conclusion: string | null;
        }>;
      };
      const checks = data.check_runs ?? [];

      if (checks.length === 0) return { status: "none", checks: [] };

      const hasFail = checks.some(
        (c) =>
          c.conclusion === "failure" || c.conclusion === "timed_out",
      );
      const hasPending = checks.some(
        (c) => c.status === "queued" || c.status === "in_progress",
      );
      const status = hasFail
        ? "fail"
        : hasPending
          ? "pending"
          : "pass";

      return {
        status,
        checks: checks.map((c) => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion ?? "",
        })),
      };
    } catch {
      return { status: "none", checks: [] };
    }
  }

  /**
   * Find PR for a specific branch
   */
  async findPRForBranch(
    token: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<PullRequest | null> {
    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=all&per_page=1`,
        token,
      );
      if (!res.ok) return null;

      const prs = (await res.json()) as Array<Record<string, unknown>>;
      return prs.length > 0 ? mapPR(prs[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get repo description via REST API (cached 10min)
   */
  async getRepoDescription(
    token: string,
    owner: string,
    repo: string,
  ): Promise<string | null> {
    const cacheKey = `${owner}/${repo}`;
    const cached = descriptionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const res = await githubFetch(
        `${GITHUB_API}/repos/${owner}/${repo}`,
        token,
      );
      if (!res.ok) return null;

      const data = (await res.json()) as {
        description?: string | null;
      };
      const value = data.description?.trim() || null;

      descriptionCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
      });
      return value;
    } catch {
      return null;
    }
  }
}

const DESCRIPTION_CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const descriptionCache = new Map<
  string,
  { value: string | null; expiresAt: number }
>();
