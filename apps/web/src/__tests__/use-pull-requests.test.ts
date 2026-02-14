import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePullRequests } from "../hooks/use-pull-requests";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setupFetchMock(responses: Record<string, unknown>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => data } as Response;
      }
    }
    return { ok: false, json: async () => ({ error: "Not found" }) } as Response;
  });
}

describe("usePullRequests", () => {
  it("starts with empty PRs", async () => {
    setupFetchMock({
      "/prs/status": { available: false, authenticated: false, repoSlug: null, reason: null },
    });

    const { result } = renderHook(() => usePullRequests("project-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.prs).toEqual([]);
  });

  it("checks GitHub status on mount", async () => {
    setupFetchMock({
      "/prs/status": { available: false, authenticated: false, repoSlug: null, reason: "gh not found" },
    });

    const { result } = renderHook(() => usePullRequests("project-1"));

    await waitFor(() => {
      expect(result.current.ghStatus).toEqual({
        available: false,
        authenticated: false,
        repoSlug: null,
        reason: "gh not found",
      });
    });
  });

  it("fetches PRs when GitHub is available", async () => {
    setupFetchMock({
      "/prs/status": { available: true, authenticated: true, repoSlug: "user/repo", reason: null },
      "/prs?state=": {
        prs: [
          {
            number: 1,
            title: "Test PR",
            state: "open",
            url: "https://github.com/user/repo/pull/1",
            headBranch: "feature",
            baseBranch: "main",
            author: "dev",
            createdAt: "2025-01-01",
            updatedAt: "2025-01-01",
            additions: 10,
            deletions: 5,
            changedFiles: 2,
            mergeable: true,
            draft: false,
            labels: [],
            body: "",
          },
        ],
      },
    });

    const { result } = renderHook(() => usePullRequests("project-1"));

    await waitFor(() => {
      expect(result.current.prs).toHaveLength(1);
    });

    expect(result.current.prs[0].title).toBe("Test PR");
    expect(result.current.loading).toBe(false);
  });

  it("does not fetch when projectId is undefined", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => usePullRequests(undefined));

    expect(result.current.prs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles filter change", async () => {
    setupFetchMock({
      "/prs/status": { available: true, authenticated: true, repoSlug: "user/repo", reason: null },
      "/prs?state=": { prs: [{ number: 1, title: "Open PR", state: "open" }] },
    });

    const { result } = renderHook(() => usePullRequests("project-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.filter).toBe("open");

    act(() => {
      result.current.setFilter("closed");
    });

    await waitFor(() => {
      expect(result.current.filter).toBe("closed");
    });
  });

  it("handles status check failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => usePullRequests("project-1"));

    await waitFor(() => {
      expect(result.current.ghStatus).toEqual({
        available: false,
        authenticated: false,
        repoSlug: null,
        reason: "Failed to check status",
      });
    });
  });
});
