import { Router } from "express";
import { execFile } from "child_process";
import { logger } from "../lib/logger.js";

export const systemRouter = Router();

systemRouter.get("/system/version", (_req, res) => {
  execFile("claude", ["--version"], { timeout: 5000 }, (error, stdout) => {
    if (error) {
      logger.warn(`Failed to get Claude CLI version: ${error.message}`, "system");
      res.json({ version: "unknown" });
      return;
    }
    const version = stdout.trim() || "unknown";
    res.json({ version });
  });
});
