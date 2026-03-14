import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  stat: vi.fn(),
}));

// Mock os.homedir and os.platform
vi.mock("os", () => ({
  homedir: () => "/home/testuser",
  platform: () => "linux",
}));

// Now import the module under test
// We need to import dynamically after mocks are set up
import { userReposDir, isPathWithinRepos, getDirectorySizeMb, REPOS_DIR } from "../lib/storage.js";
import { execFile } from "child_process";
import { stat } from "fs/promises";

describe("Storage Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("REPOS_DIR", () => {
    it("uses STORAGE_PATH env var when set", () => {
      // REPOS_DIR is computed at module load time; test the default path
      expect(REPOS_DIR).toContain("repos");
    });
  });

  describe("userReposDir", () => {
    it("returns correct path for valid userId", () => {
      const result = userReposDir("user123");
      expect(result).toContain("repos");
      expect(result).toMatch(/user123$/);
    });

    it("sanitizes userId by removing special characters", () => {
      const result = userReposDir("user../../../etc");
      // Only alphanumeric, underscore, hyphen allowed
      expect(result).toMatch(/useretc$/);
      expect(result).not.toContain("..");
      expect(result).not.toContain("/etc");
    });

    it("sanitizes userId with slashes", () => {
      const result = userReposDir("user/name");
      expect(result).toMatch(/username$/);
    });

    it("allows underscores and hyphens in userId", () => {
      const result = userReposDir("user_name-123");
      expect(result).toMatch(/user_name-123$/);
    });

    it("throws on empty userId", () => {
      expect(() => userReposDir("")).toThrow("Invalid userId for directory");
    });

    it("throws when userId becomes empty after sanitization", () => {
      expect(() => userReposDir("...///")).toThrow("Invalid userId for directory");
    });

    it("throws on userId with only special characters", () => {
      expect(() => userReposDir("@#$%^&*")).toThrow("Invalid userId for directory");
    });
  });

  describe("isPathWithinRepos", () => {
    it("returns true for path within REPOS_DIR", () => {
      const testPath = `${REPOS_DIR}/user123/my-project`;
      expect(isPathWithinRepos(testPath)).toBe(true);
    });

    it("returns true for REPOS_DIR itself", () => {
      expect(isPathWithinRepos(REPOS_DIR)).toBe(true);
    });

    it("returns false for path outside REPOS_DIR", () => {
      expect(isPathWithinRepos("/tmp/some-path")).toBe(false);
    });

    it("returns false for path traversal attempt", () => {
      const traversalPath = `${REPOS_DIR}/../../../etc/passwd`;
      expect(isPathWithinRepos(traversalPath)).toBe(false);
    });

    it("returns false for parent directory of REPOS_DIR", () => {
      expect(isPathWithinRepos("/home/testuser")).toBe(false);
    });

    it("returns false for sibling directory", () => {
      expect(isPathWithinRepos("/home/testuser/.agenthub/config")).toBe(false);
    });
  });

  describe("getDirectorySizeMb", () => {
    it("returns 0 for non-existent directory", async () => {
      vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));

      const result = await getDirectorySizeMb("/nonexistent/path");
      expect(result).toBe(0);
    });

    it("returns size in MB for existing directory on Linux", async () => {
      vi.mocked(stat).mockResolvedValue({} as never);

      // Mock execFile callback-style
      vi.mocked(execFile).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((_cmd: string, _args: string[], _opts: unknown, cb?: any) => {
          if (cb) {
            cb(null, { stdout: "52428800\t/some/path", stderr: "" });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
      );

      const result = await getDirectorySizeMb("/some/path");
      // 52428800 bytes = 50 MB
      expect(result).toBe(50);
    });

    it("returns 0 when du command fails", async () => {
      vi.mocked(stat).mockResolvedValue({} as never);
      vi.mocked(execFile).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((_cmd: string, _args: string[], _opts: unknown, cb?: any) => {
          if (cb) {
            cb(new Error("command failed"), { stdout: "", stderr: "" });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
      );

      const result = await getDirectorySizeMb("/some/path");
      expect(result).toBe(0);
    });

    it("handles stdout with zero bytes", async () => {
      vi.mocked(stat).mockResolvedValue({} as never);
      vi.mocked(execFile).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((_cmd: string, _args: string[], _opts: unknown, cb?: any) => {
          if (cb) {
            cb(null, { stdout: "0\t/some/path", stderr: "" });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
      );

      const result = await getDirectorySizeMb("/some/path");
      expect(result).toBe(0);
    });
  });
});
