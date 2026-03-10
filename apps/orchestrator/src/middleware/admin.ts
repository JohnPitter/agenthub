import type { Request, Response, NextFunction } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [user] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch (err) {
    logger.error(`Admin middleware error: ${err}`, "admin");
    res.status(500).json({ error: "Internal server error" });
  }
}
