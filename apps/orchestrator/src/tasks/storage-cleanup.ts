import { storageService } from "../services/storage-service.js";
import { logger } from "../lib/logger.js";

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export const storageCleanup = {
  start(): void {
    // Run initial cleanup after 1 minute
    setTimeout(async () => {
      try {
        const result = await storageService.cleanupExpiredRepos();
        if (result.cleaned > 0) {
          logger.info(`Initial cleanup: ${result.cleaned} repos, freed ${result.freedMb.toFixed(1)}MB`, "storage-cleanup");
        }
      } catch (err) {
        logger.error(`Initial storage cleanup failed: ${err}`, "storage-cleanup");
      }
    }, 60_000);

    cleanupTimer = setInterval(async () => {
      try {
        logger.debug("Starting scheduled storage cleanup scan", "storage-cleanup");
        const result = await storageService.cleanupExpiredRepos();
        if (result.cleaned > 0) {
          logger.info(`Cleaned ${result.cleaned} repos, freed ${result.freedMb.toFixed(1)}MB`, "storage-cleanup");
        }
      } catch (err) {
        logger.error(`Storage cleanup failed: ${err}`, "storage-cleanup");
      }
    }, CLEANUP_INTERVAL);
    logger.info("Storage cleanup scheduler started (every 6h)", "storage-cleanup");
  },

  stop(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  },
};
