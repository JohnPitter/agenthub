import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the storage service
vi.mock("../services/storage-service.js", () => ({
  storageService: {
    cleanupExpiredRepos: vi.fn(),
  },
}));

import { storageCleanup } from "../tasks/storage-cleanup.js";
import { storageService } from "../services/storage-service.js";

describe("Storage Cleanup Scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    storageCleanup.stop();
    vi.useRealTimers();
  });

  it("start() sets up initial timeout and recurring interval", () => {
    vi.mocked(storageService.cleanupExpiredRepos).mockResolvedValue({
      cleaned: 0,
      freedMb: 0,
    });

    storageCleanup.start();

    // The initial setTimeout is set for 60 seconds
    // The setInterval is set for 6 hours
    // At this point, no cleanups should have run yet
    expect(storageService.cleanupExpiredRepos).not.toHaveBeenCalled();
  });

  it("runs initial cleanup after 1 minute", async () => {
    vi.mocked(storageService.cleanupExpiredRepos).mockResolvedValue({
      cleaned: 2,
      freedMb: 150.5,
    });

    storageCleanup.start();

    // Advance past the 1-minute initial timeout
    await vi.advanceTimersByTimeAsync(60_000);

    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(1);
  });

  it("runs periodic cleanup every 6 hours", async () => {
    vi.mocked(storageService.cleanupExpiredRepos).mockResolvedValue({
      cleaned: 0,
      freedMb: 0,
    });

    storageCleanup.start();

    // Skip initial timeout
    await vi.advanceTimersByTimeAsync(60_000);
    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(1);

    // Advance 6 hours for the interval
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(2);

    // Advance another 6 hours
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(3);
  });

  it("stop() clears the interval", async () => {
    vi.mocked(storageService.cleanupExpiredRepos).mockResolvedValue({
      cleaned: 0,
      freedMb: 0,
    });

    storageCleanup.start();

    // Advance past initial timeout
    await vi.advanceTimersByTimeAsync(60_000);
    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(1);

    storageCleanup.stop();

    // Advance 6 hours — interval should NOT fire
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(1);
  });

  it("handles cleanup errors gracefully", async () => {
    vi.mocked(storageService.cleanupExpiredRepos).mockRejectedValue(
      new Error("DB connection lost"),
    );

    storageCleanup.start();

    // Should not throw even if cleanup fails
    await vi.advanceTimersByTimeAsync(60_000);

    expect(storageService.cleanupExpiredRepos).toHaveBeenCalledTimes(1);
  });
});
