import type { GitHubRepo } from "@agenthub/shared";
import { logger } from "../lib/logger.js";

export async function fetchUserRepos(
  accessToken: string
): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100&type=owner",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "AgentHub",
      },
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

  return (await res.json()) as GitHubRepo[];
}
