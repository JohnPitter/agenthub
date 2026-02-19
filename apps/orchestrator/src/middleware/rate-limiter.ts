import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Category-based rate limit configurations.
 */
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  auth:    { windowMs: 15 * 60_000, maxRequests: 20 },   // 20 req / 15 min
  api:     { windowMs: 60_000,      maxRequests: 300 },   // 300 req / min
  git:     { windowMs: 60_000,      maxRequests: 30 },    // 30 req / min
  upload:  { windowMs: 60_000,      maxRequests: 10 },    // 10 req / min
  agent:   { windowMs: 60_000,      maxRequests: 200 },   // 200 req / min
};

/** Per-category stores keyed by IP */
const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(category: string): Map<string, RateLimitEntry> {
  let store = stores.get(category);
  if (!store) {
    store = new Map();
    stores.set(category, store);
  }
  return store;
}

// Cleanup expired entries every 5 minutes across all stores
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }
}, 300_000);

/**
 * Set X-RateLimit-* headers on the response.
 */
function setRateLimitHeaders(
  res: Response,
  config: RateLimitConfig,
  entry: RateLimitEntry,
): void {
  const remaining = Math.max(0, config.maxRequests - entry.count);
  res.setHeader("X-RateLimit-Limit", config.maxRequests);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
}

/**
 * Create a rate limiter middleware for a specific category.
 */
export function createRateLimiter(category: string) {
  const config = RATE_LIMIT_CONFIGS[category] ?? RATE_LIMIT_CONFIGS.api;
  const store = getStore(category);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    let entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + config.windowMs };
      store.set(ip, entry);
      setRateLimitHeaders(res, config, entry);
      return next();
    }

    entry.count++;
    setRateLimitHeaders(res, config, entry);

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    next();
  };
}

/** Pre-built category limiters */
export const authLimiter = createRateLimiter("auth");
export const apiLimiter = createRateLimiter("api");
export const gitLimiter = createRateLimiter("git");
export const uploadLimiter = createRateLimiter("upload");
export const agentLimiter = createRateLimiter("agent");

/** Backward-compatible default (api category) */
export const rateLimiter = apiLimiter;
