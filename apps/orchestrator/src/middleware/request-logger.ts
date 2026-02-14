import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";

    logger[level](
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
      "http",
      { method: req.method, path: req.path, status: res.statusCode, duration },
    );
  });

  next();
}
