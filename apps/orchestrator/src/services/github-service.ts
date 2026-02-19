import type { GitHubRepo } from "@agenthub/shared";
import { logger } from "../lib/logger.js";

const GITHUB_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

interface RepoCache {
  repos: GitHubRepo[];
  expiresAt: number;
}

const repoCache = new Map<string, RepoCache>();

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
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AgentHub",
        },
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
