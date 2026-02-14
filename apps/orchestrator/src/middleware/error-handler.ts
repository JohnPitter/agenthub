import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err.message, "error-handler", {
    name: err.name,
    stack: err.stack?.split("\n").slice(0, 3).join(" | "),
  });

  res.status(500).json({
    error: "Internal server error",
  });
}
