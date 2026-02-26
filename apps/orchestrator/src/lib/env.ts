import crypto from "crypto";
import { logger } from "./logger.js";

const isProd = process.env.NODE_ENV === "production";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error(`Missing required env var: ${name}`, "env");
    process.exit(1);
  }
  return value;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (raw) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["http://localhost:5173", "http://localhost:5174"];
}

const JWT_SECRET = isProd
  ? requireEnv("JWT_SECRET")
  : process.env.JWT_SECRET ?? crypto.randomBytes(32).toString("hex");

if (!isProd && !process.env.JWT_SECRET) {
  logger.warn("JWT_SECRET not set — using random secret (sessions will not persist across restarts)", "env");
}

const ENCRYPTION_KEY = isProd
  ? requireEnv("ENCRYPTION_KEY")
  : process.env.ENCRYPTION_KEY ?? "";

const CORS_ORIGINS = parseCorsOrigins(process.env.CORS_ORIGINS);

// In dev, OAuth callbacks need to redirect to the frontend origin (e.g. http://localhost:5175)
// In production, relative redirects work since the SPA is served by the same server
const FRONTEND_ORIGIN = process.env.FRONTEND_URL
  ?? (isProd ? "" : (CORS_ORIGINS[0] ?? "http://localhost:5173"));

export const env = {
  isProd,
  PORT: parsePort(process.env.ORCHESTRATOR_PORT, 3001),
  JWT_SECRET,
  ENCRYPTION_KEY,
  CORS_ORIGINS,
  DEV_AUTH: !isProd && process.env.DEV_AUTH === "true",
  FRONTEND_ORIGIN,
} as const;
