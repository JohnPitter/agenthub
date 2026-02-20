import type { GitHubRepo } from "@agenthub/shared";
import { logger } from "../lib/logger.js";

const GITHUB_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const DESCRIPTION_CACHE_TTL_MS = 10 * 60_000; // 10 minutes

interface RepoCache {
  repos: GitHubRepo[];
  expiresAt: number;
}

const repoCache = new Map<string, RepoCache>();
const descriptionCache = new Map<string, { value: string | null; expiresAt: number }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AgentHub",
  };
}

// ---------------------------------------------------------------------------
// parseGitHubRepoSlug — extract {owner, repo} from HTTPS / SSH GitHub URLs
// ---------------------------------------------------------------------------

export function parseGitHubRepoSlug(
  remoteUrl: string
): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// getRepoDescriptionREST — GET /repos/{owner}/{repo} → .description
// ---------------------------------------------------------------------------

export async function getRepoDescriptionREST(
  accessToken: string,
  owner: string,
  repo: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;
  const cached = descriptionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers: githubHeaders(accessToken), signal: controller.signal }
    );

    if (!res.ok) {
      logger.warn(`GitHub repo fetch failed ${res.status} for ${cacheKey}`, "github-service");
      return null;
    }

    const data = (await res.json()) as { description?: string | null };
    const value = data.description?.trim() || null;

    descriptionCache.set(cacheKey, { value, expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS });
    return value;
  } catch (err) {
    logger.warn(`getRepoDescriptionREST error for ${cacheKey}: ${err}`, "github-service");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// createGitHubRepo — POST /user/repos
// ---------------------------------------------------------------------------

export interface CreateGitHubRepoOptions {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export interface CreateGitHubRepoResult {
  clone_url: string;
  html_url: string;
  description: string | null;
  full_name: string;
}

export async function createGitHubRepo(
  accessToken: string,
  options: CreateGitHubRepoOptions
): Promise<CreateGitHubRepoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        ...githubHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: options.name,
        description: options.description ?? "",
        private: options.isPrivate ?? false,
        auto_init: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error(`GitHub create repo error ${res.status}: ${text}`, "github-service");
      throw new Error(`GitHub API error: ${res.status} — ${text}`);
    }

    const data = (await res.json()) as {
      clone_url: string;
      html_url: string;
      description: string | null;
      full_name: string;
    };

    return {
      clone_url: data.clone_url,
      html_url: data.html_url,
      description: data.description,
      full_name: data.full_name,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// fetchUserRepos — list user's repos (existing)
// ---------------------------------------------------------------------------

export async function fetchUserRepos(
  accessToken: string
): Promise<GitHubRepo[]> {
  const cacheKey = accessToken.slice(-8);
  const cached = repoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug("Returning cached GitHub repos", "github-service");
    return cached.repos;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const res = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100&type=owner",
      {
        headers: githubHeaders(accessToken),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      logger.error(
        `GitHub API error ${res.status}: ${text}`,
        "github-service"
      );
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const repos = (await res.json()) as GitHubRepo[];

    repoCache.set(cacheKey, { repos, expiresAt: Date.now() + CACHE_TTL_MS });

    return repos;
  } finally {
    clearTimeout(timeout);
  }
}
