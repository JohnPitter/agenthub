import type { Request, Response, NextFunction } from "express";
import { verifyJWT, isTokenBlacklisted, type JWTPayload } from "../services/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.agenthub_token;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Check if token has been invalidated (logout)
  if (isTokenBlacklisted(token)) {
    res.status(401).json({ error: "Token has been revoked" });
    return;
  }

  try {
    req.user = verifyJWT(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
