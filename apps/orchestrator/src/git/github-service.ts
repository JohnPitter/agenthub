import { execFileNoThrow } from "../lib/exec-file.js";
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

export class GitHubService {
  /**
   * Check if gh CLI is available
   */
  async isGhAvailable(): Promise<boolean> {
    const result = await execFileNoThrow("gh", ["--version"], { timeout: 5000 });
    return !result.error;
  }

  /**
   * Check if gh is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const result = await execFileNoThrow("gh", ["auth", "status"], { timeout: 10000 });
    return !result.error;
  }

  /**
   * Get repo owner/name from remote URL
   */
  async getRepoSlug(projectPath: string): Promise<string | null> {
    const result = await execFileNoThrow(
      "gh",
      ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
      { cwd: projectPath, timeout: 15000 }
    );

    if (result.error) {
      return null;
    }

    return result.stdout.trim() || null;
  }

  /**
   * List open pull requests for the repository
   */
  async listPRs(
    projectPath: string,
    options?: { state?: "open" | "closed" | "merged" | "all"; limit?: number }
  ): Promise<PullRequest[]> {
    const state = options?.state ?? "open";
    const limit = options?.limit ?? 20;

    const args = [
      "pr", "list",
      "--state", state,
      "--limit", String(limit),
      "--json", "number,title,body,state,url,headRefName,baseRefName,author,createdAt,updatedAt,additions,deletions,changedFiles,isDraft,labels,mergeable",
    ];

    const result = await execFileNoThrow("gh", args, {
      cwd: projectPath,
      timeout: 30000,
    });

    if (result.error) {
      logger.error(`Failed to list PRs: ${result.stderr}`, "github-service");
      return [];
    }

    try {
      const raw = JSON.parse(result.stdout);
      return raw.map((pr: Record<string, unknown>) => ({
        number: pr.number as number,
        title: pr.title as string,
        body: pr.body as string,
        state: (pr.state as string).toLowerCase() as "open" | "closed" | "merged",
        url: pr.url as string,
        headBranch: pr.headRefName as string,
        baseBranch: pr.baseRefName as string,
        author: (pr.author as Record<string, string>)?.login ?? "",
        createdAt: pr.createdAt as string,
        updatedAt: pr.updatedAt as string,
        additions: (pr.additions as number) ?? 0,
        deletions: (pr.deletions as number) ?? 0,
        changedFiles: (pr.changedFiles as number) ?? 0,
        mergeable: pr.mergeable === "MERGEABLE",
        draft: (pr.isDraft as boolean) ?? false,
        labels: ((pr.labels as Array<Record<string, string>>) ?? []).map((l) => l.name),
      }));
    } catch {
      logger.error("Failed to parse PR list response", "github-service");
      return [];
    }
  }

  /**
   * Get a single PR by number
   */
  async getPR(projectPath: string, prNumber: number): Promise<PullRequest | null> {
    const result = await execFileNoThrow(
      "gh",
      [
        "pr", "view", String(prNumber),
        "--json", "number,title,body,state,url,headRefName,baseRefName,author,createdAt,updatedAt,additions,deletions,changedFiles,isDraft,labels,mergeable",
      ],
      { cwd: projectPath, timeout: 15000 }
    );

    if (result.error) {
      return null;
    }

    try {
      const pr = JSON.parse(result.stdout);
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: (pr.state as string).toLowerCase() as "open" | "closed" | "merged",
        url: pr.url,
        headBranch: pr.headRefName,
        baseBranch: pr.baseRefName,
        author: pr.author?.login ?? "",
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changedFiles ?? 0,
        mergeable: pr.mergeable === "MERGEABLE",
        draft: pr.isDraft ?? false,
        labels: (pr.labels ?? []).map((l: Record<string, string>) => l.name),
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a pull request
   */
  async createPR(projectPath: string, data: PullRequestCreate): Promise<PullRequest | null> {
    const args = [
      "pr", "create",
      "--title", data.title,
      "--body", data.body,
      "--head", data.headBranch,
      "--base", data.baseBranch,
    ];

    if (data.draft) {
      args.push("--draft");
    }

    const result = await execFileNoThrow("gh", args, {
      cwd: projectPath,
      timeout: 30000,
    });

    if (result.error) {
      logger.error(`Failed to create PR: ${result.stderr}`, "github-service");
      throw new Error(`Failed to create PR: ${result.stderr}`);
    }

    // gh pr create returns the URL — extract PR number
    const urlMatch = result.stdout.trim().match(/\/pull\/(\d+)/);
    if (!urlMatch) {
      logger.error("Could not extract PR number from create output", "github-service");
      return null;
    }

    const prNumber = parseInt(urlMatch[1], 10);
    return this.getPR(projectPath, prNumber);
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    projectPath: string,
    prNumber: number,
    method: "merge" | "squash" | "rebase" = "squash"
  ): Promise<boolean> {
    const result = await execFileNoThrow(
      "gh",
      ["pr", "merge", String(prNumber), `--${method}`, "--delete-branch"],
      { cwd: projectPath, timeout: 30000 }
    );

    if (result.error) {
      logger.error(`Failed to merge PR #${prNumber}: ${result.stderr}`, "github-service");
      return false;
    }

    return true;
  }

  /**
   * Close a pull request
   */
  async closePR(projectPath: string, prNumber: number): Promise<boolean> {
    const result = await execFileNoThrow(
      "gh",
      ["pr", "close", String(prNumber)],
      { cwd: projectPath, timeout: 15000 }
    );

    return !result.error;
  }

  /**
   * Get PR reviews
   */
  async getPRReviews(projectPath: string, prNumber: number): Promise<PullRequestReview[]> {
    const result = await execFileNoThrow(
      "gh",
      [
        "api",
        `repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
        "--jq", ".[] | {id: .id, user: .user.login, state: .state, body: .body, submittedAt: .submitted_at}",
      ],
      { cwd: projectPath, timeout: 15000 }
    );

    if (result.error) {
      return [];
    }

    try {
      // Each line is a JSON object
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Get CI checks status for a PR
   */
  async getPRChecks(projectPath: string, prNumber: number): Promise<{
    status: "pass" | "fail" | "pending" | "none";
    checks: Array<{ name: string; status: string; conclusion: string }>;
  }> {
    const result = await execFileNoThrow(
      "gh",
      ["pr", "checks", String(prNumber), "--json", "name,state,conclusion"],
      { cwd: projectPath, timeout: 15000 }
    );

    if (result.error) {
      return { status: "none", checks: [] };
    }

    try {
      const checks = JSON.parse(result.stdout) as Array<{ name: string; state: string; conclusion: string }>;

      if (checks.length === 0) return { status: "none", checks: [] };

      const hasFail = checks.some((c) => c.conclusion === "FAILURE" || c.conclusion === "ERROR");
      const hasPending = checks.some((c) => c.state === "PENDING" || c.state === "QUEUED" || c.state === "IN_PROGRESS");

      let status: "pass" | "fail" | "pending" | "none" = "pass";
      if (hasFail) status = "fail";
      else if (hasPending) status = "pending";

      return {
        status,
        checks: checks.map((c) => ({
          name: c.name,
          status: c.state,
          conclusion: c.conclusion,
        })),
      };
    } catch {
      return { status: "none", checks: [] };
    }
  }

  /**
   * Find PR for a specific branch
   */
  async findPRForBranch(projectPath: string, branch: string): Promise<PullRequest | null> {
    const result = await execFileNoThrow(
      "gh",
      [
        "pr", "list",
        "--head", branch,
        "--state", "all",
        "--limit", "1",
        "--json", "number,title,body,state,url,headRefName,baseRefName,author,createdAt,updatedAt,additions,deletions,changedFiles,isDraft,labels,mergeable",
      ],
      { cwd: projectPath, timeout: 15000 }
    );

    if (result.error) return null;

    try {
      const prs = JSON.parse(result.stdout);
      if (prs.length === 0) return null;

      const pr = prs[0];
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: (pr.state as string).toLowerCase() as "open" | "closed" | "merged",
        url: pr.url,
        headBranch: pr.headRefName,
        baseBranch: pr.baseRefName,
        author: pr.author?.login ?? "",
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changedFiles ?? 0,
        mergeable: pr.mergeable === "MERGEABLE",
        draft: pr.isDraft ?? false,
        labels: (pr.labels ?? []).map((l: Record<string, string>) => l.name),
      };
    } catch {
      return null;
    }
  }
}
