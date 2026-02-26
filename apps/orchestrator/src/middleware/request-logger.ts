import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID().slice(0, 8);
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";

    logger[level](
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
      "http",
      { method: req.method, path: req.path, status: res.statusCode, duration, requestId, userId: req.user?.userId },
    );
  });

  next();
}
