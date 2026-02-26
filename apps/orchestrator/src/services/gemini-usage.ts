import { logger } from "../lib/logger.js";
import { getGeminiOAuthToken } from "./gemini-oauth.js";

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1internal";

export interface QuotaBucket {
  remainingFraction: number;
  resetTime: string | null;
  modelId: string | null;
  tokenType: string | null;
}

export interface GeminiUsageData {
  tier: string;
  tierLabel: string;
  project: string | null;
  buckets: QuotaBucket[];
  overallUtilization: number; // 0-100
  status: "ok" | "low" | "warning" | "over_limit";
  queriedAt: string;
}

// Cache usage data for 2 minutes
let usageCache: { data: GeminiUsageData; fetchedAt: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

// Cache discovered project
let discoveredProject: { project: string; tier: string; tierLabel: string } | null = null;

interface GeminiUserTier {
  id?: string;
  name?: string;
  description?: string;
}

/** Map verbose tier names to short UI-friendly labels */
function normalizeTierLabel(tierId: string, rawName?: string): string {
  if (tierId.includes("free")) return "Free";
  if (tierId.includes("standard")) return "Standard";
  if (tierId.includes("enterprise")) return "Enterprise";
  if (tierId.includes("legacy")) return "Legacy";
  // If tier ID doesn't match, try to extract from long name
  if (rawName) {
    const lower = rawName.toLowerCase();
    if (lower.includes("individual") || lower.includes("free")) return "Free";
    if (lower.includes("pro") || lower.includes("standard")) return "Standard";
    if (lower.includes("enterprise")) return "Enterprise";
  }
  return rawName ?? tierId;
}

interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier;
  paidTier?: GeminiUserTier;
  cloudaicompanionProject?: string;
  allowedTiers?: GeminiUserTier[];
}

interface RetrieveUserQuotaResponse {
  buckets?: Array<{
    remainingFraction?: number;
    resetTime?: string;
    modelId?: string;
    tokenType?: string;
    remainingAmount?: string;
  }>;
}

/** Build URL in Google API convention: base/version:method */
function methodUrl(method: string): string {
  return `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`;
}

/**
 * Discover the GCP project and tier via Code Assist API.
 * Uses the same endpoint and format as Gemini CLI.
 */
async function loadCodeAssist(accessToken: string): Promise<{ project: string; tier: string; tierLabel: string }> {
  if (discoveredProject) return discoveredProject;

  const res = await fetch(methodUrl("loadCodeAssist"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metadata: {
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Code Assist loadCodeAssist failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json() as LoadCodeAssistResponse;

  if (!data.cloudaicompanionProject) {
    throw new Error("Code Assist did not return a project. Ensure Gemini CLI is properly authenticated.");
  }

  // Use paidTier if available, otherwise currentTier
  const effectiveTier = data.paidTier ?? data.currentTier;
  const tierId = effectiveTier?.id ?? "free-tier";

  // Normalize long tier names (e.g. "Gemini Code Assist for individuals") to short labels
  const tierLabel = normalizeTierLabel(tierId, effectiveTier?.name);

  const result = {
    project: data.cloudaicompanionProject,
    tier: tierId,
    tierLabel,
  };

  discoveredProject = result;
  logger.info(`Gemini Code Assist: project=${result.project}, tier=${result.tier}`, "gemini");

  return result;
}

/**
 * Retrieve user quota from Code Assist API.
 * Returns per-model quota buckets with remainingFraction and resetTime.
 */
async function retrieveUserQuota(
  accessToken: string,
  project: string,
): Promise<QuotaBucket[]> {
  const res = await fetch(methodUrl("retrieveUserQuota"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Code Assist retrieveUserQuota failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json() as RetrieveUserQuotaResponse;

  if (!data.buckets?.length) {
    return [{ remainingFraction: 1, resetTime: null, modelId: null, tokenType: null }];
  }

  return data.buckets.map((b) => ({
    remainingFraction: b.remainingFraction ?? 1,
    resetTime: b.resetTime ?? null,
    modelId: b.modelId ?? null,
    tokenType: b.tokenType ?? null,
  }));
}

/**
 * Fetch Gemini usage via Code Assist API.
 * Auto-discovers project ID and tier — no manual input needed.
 * Returns cached data if fresh enough.
 */
export async function fetchGeminiUsage(): Promise<GeminiUsageData> {
  // Return cache if fresh
  if (usageCache && Date.now() - usageCache.fetchedAt < CACHE_TTL) {
    return usageCache.data;
  }

  const token = await getGeminiOAuthToken();
  if (!token) {
    throw new Error("Gemini OAuth not connected. Run 'gemini' CLI to authenticate.");
  }

  const { project, tier, tierLabel } = await loadCodeAssist(token);
  const buckets = await retrieveUserQuota(token, project);

  // Filter to REQUESTS type only (ignore INPUT_TOKENS/OUTPUT_TOKENS if present)
  const requestBuckets = buckets.filter((b) => !b.tokenType || b.tokenType === "REQUESTS");
  const activeBuckets = requestBuckets.length > 0 ? requestBuckets : buckets;

  // Calculate overall utilization from buckets (lowest remaining = highest usage)
  const minRemaining = Math.min(...activeBuckets.map((b) => b.remainingFraction));
  const overallUtilization = Math.round((1 - minRemaining) * 1000) / 10; // 0-100 with 1 decimal

  let status: GeminiUsageData["status"] = "ok";
  if (minRemaining <= 0) status = "over_limit";
  else if (minRemaining <= 0.1) status = "warning";
  else if (minRemaining <= 0.25) status = "low";

  const result: GeminiUsageData = {
    tier,
    tierLabel,
    project,
    buckets: activeBuckets,
    overallUtilization,
    status,
    queriedAt: new Date().toISOString(),
  };

  usageCache = { data: result, fetchedAt: Date.now() };
  logger.info(`Gemini usage: tier=${tier}, utilization=${overallUtilization.toFixed(1)}%, buckets=${activeBuckets.length}`, "gemini");

  return result;
}

/** Clear cached usage and project data */
export function clearGeminiUsageCache(): void {
  usageCache = null;
  discoveredProject = null;
}
