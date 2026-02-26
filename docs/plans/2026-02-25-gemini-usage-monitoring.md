# Gemini Usage Monitoring via Google Cloud Monitoring API

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time Gemini API usage tracking to the sidebar and settings provider card, using the Google Cloud Monitoring API (same approach as `b3nw/gemini-cli-usage`).

**Architecture:** Backend route `GET /api/gemini/usage` queries Google Cloud Monitoring API with the user's OAuth token to fetch `api/request_count` metrics. Results are cached for 2 minutes. Frontend displays usage bars (session + daily) in the sidebar widget and detailed report in the settings provider card. Supports plan detection (free=1000, pro=1500, ultra=2000 req/day).

**Tech Stack:** Express route, Google Cloud Monitoring REST API (`monitoring.googleapis.com/v3`), Zustand store, React components, i18n.

---

## Task 1: Backend — Gemini Usage Service

**Files:**
- Create: `apps/orchestrator/src/services/gemini-usage.ts`

**Step 1: Create the usage service**

This service queries the Google Cloud Monitoring API using the user's Gemini OAuth credentials (from `~/.gemini/oauth_creds.json`). It follows the exact same pattern as the `b3nw/gemini-cli-usage` project.

```typescript
import { logger } from "../lib/logger.js";
import { getGeminiOAuthToken } from "./gemini-oauth.js";

// Plan limits (requests per day)
const PLAN_LIMITS: Record<string, { limit: number; label: string }> = {
  free: { limit: 1000, label: "Free" },
  pro: { limit: 1500, label: "Pro" },
  ultra: { limit: 2000, label: "Ultra" },
  standard: { limit: 1500, label: "Standard" },
  enterprise: { limit: 2000, label: "Enterprise" },
};

export interface GeminiUsageData {
  totalRequests: number;
  plan: string;
  planLabel: string;
  limit: number;
  remaining: number;
  utilization: number; // 0-100
  status: "ok" | "low" | "warning" | "over_limit";
  periodDays: number;
  queriedAt: string;
}

// Cache usage data for 2 minutes
let usageCache: { data: GeminiUsageData; fetchedAt: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export function getGeminiPlanLimits(): typeof PLAN_LIMITS {
  return PLAN_LIMITS;
}

/**
 * Query Google Cloud Monitoring API for Gemini API request count.
 * Uses the same approach as gemini-cli-usage extension.
 */
async function queryMonitoringApi(
  projectId: string,
  accessToken: string,
  days: number = 7,
): Promise<number> {
  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    filter: `metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.labels.project_id="${projectId}"`,
    "interval.startTime": startTime.toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": `${days * 86400}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
  });

  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error(`Permission denied for project '${projectId}'. Ensure you have 'monitoring.viewer' role.`);
    }
    if (res.status === 404) {
      throw new Error(`Project '${projectId}' not found.`);
    }
    throw new Error(`Monitoring API error (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    timeSeries?: Array<{
      points?: Array<{
        value?: { int64Value?: string; doubleValue?: number };
      }>;
    }>;
  };

  let totalRequests = 0;
  if (data.timeSeries) {
    for (const ts of data.timeSeries) {
      if (ts.points) {
        for (const point of ts.points) {
          if (point.value?.int64Value) {
            totalRequests += parseInt(point.value.int64Value, 10);
          } else if (point.value?.doubleValue) {
            totalRequests += Math.round(point.value.doubleValue);
          }
        }
      }
    }
  }

  return totalRequests;
}

/**
 * Fetch Gemini usage for a GCP project.
 * Returns cached data if fresh enough.
 */
export async function fetchGeminiUsage(
  projectId: string,
  plan: string = "free",
): Promise<GeminiUsageData> {
  // Return cache if fresh
  if (usageCache && Date.now() - usageCache.fetchedAt < CACHE_TTL) {
    return usageCache.data;
  }

  const token = await getGeminiOAuthToken();
  if (!token) {
    throw new Error("Gemini OAuth not connected. Run 'gemini' CLI to authenticate.");
  }

  const planInfo = PLAN_LIMITS[plan.toLowerCase()] ?? PLAN_LIMITS.free;
  const totalRequests = await queryMonitoringApi(projectId, token, 7);

  const remaining = planInfo.limit - totalRequests;
  const utilization = planInfo.limit > 0
    ? Math.min(100, Math.max(0, (totalRequests / planInfo.limit) * 100))
    : 0;

  let status: GeminiUsageData["status"] = "ok";
  if (remaining < 0) status = "over_limit";
  else if (utilization >= 90) status = "warning";
  else if (utilization >= 75) status = "low";

  const result: GeminiUsageData = {
    totalRequests,
    plan: plan.toLowerCase(),
    planLabel: planInfo.label,
    limit: planInfo.limit,
    remaining: Math.max(0, remaining),
    utilization: Math.round(utilization * 10) / 10,
    status,
    periodDays: 7,
    queriedAt: new Date().toISOString(),
  };

  usageCache = { data: result, fetchedAt: Date.now() };
  logger.info(`Gemini usage: ${totalRequests}/${planInfo.limit} requests (${utilization.toFixed(1)}%)`, "gemini");

  return result;
}

/** Clear cached usage data */
export function clearGeminiUsageCache(): void {
  usageCache = null;
}
```

---

## Task 2: Backend — Usage Route on gemini.ts

**Files:**
- Modify: `apps/orchestrator/src/routes/gemini.ts`

**Step 1: Add GET /api/gemini/usage route**

Add after the existing `/disconnect` route (line 126):

```typescript
// Add import at top:
import { fetchGeminiUsage, clearGeminiUsageCache, getGeminiPlanLimits } from "../services/gemini-usage.js";

// GET /api/gemini/usage — fetch API usage from Google Cloud Monitoring
geminiRouter.get("/usage", async (req, res) => {
  const projectId = (req.query.projectId as string) || "";
  const plan = (req.query.plan as string) || "free";

  if (!projectId) {
    res.status(400).json({ error: "projectId query parameter is required" });
    return;
  }

  try {
    const usage = await fetchGeminiUsage(projectId, plan);
    res.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Gemini usage";
    logger.warn(`Gemini usage fetch failed: ${message}`, "gemini");
    res.status(502).json({ error: message });
  }
});

// GET /api/gemini/plans — return available plan limits
geminiRouter.get("/plans", (_req, res) => {
  res.json(getGeminiPlanLimits());
});
```

**Step 2: Update /status to detect GCP project ID from user info**

Enhance the OAuth branch of the `/status` route to attempt extracting the user's default GCP project. Add a `gcpProject` field to the response when OAuth is connected:

```typescript
// In the OAuth block (around line 23-35), add after getting token:
// After `const oauthToken = await getGeminiOAuthToken();`
// Try to fetch user info to extract default project
let gcpProject: string | null = null;
let email: string | null = null;
try {
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${oauthToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (userInfoRes.ok) {
    const userInfo = await userInfoRes.json() as { email?: string };
    email = userInfo.email ?? null;
  }
} catch { /* ignore */ }

res.json({
  connected: true,
  source: "oauth",
  email,
  gcpProject,
});
```

---

## Task 3: Frontend — Usage Store Updates

**Files:**
- Modify: `apps/web/src/stores/usage-store.ts`

**Step 1: Add Gemini usage types and state**

Add the new interface and state fields:

```typescript
// New interface (add near other interfaces at top):
export interface GeminiUsageData {
  totalRequests: number;
  plan: string;
  planLabel: string;
  limit: number;
  remaining: number;
  utilization: number;
  status: "ok" | "low" | "warning" | "over_limit";
  periodDays: number;
  queriedAt: string;
}

// Add to UsageState interface:
geminiUsage: GeminiUsageData | null;
geminiUsageFetched: boolean;
geminiUsageLastFetched: number | null;
// Add to actions:
fetchGeminiUsage: (projectId: string, plan?: string) => Promise<void>;

// Add to initial state:
geminiUsage: null,
geminiUsageFetched: false,
geminiUsageLastFetched: null,

// Add action implementation:
fetchGeminiUsage: async (projectId: string, plan = "free") => {
  const { geminiUsageLastFetched } = get();
  if (geminiUsageLastFetched && Date.now() - geminiUsageLastFetched < 120_000) return;
  try {
    const data = await api<GeminiUsageData>(`/gemini/usage?projectId=${encodeURIComponent(projectId)}&plan=${plan}`);
    set({ geminiUsage: data, geminiUsageFetched: true, geminiUsageLastFetched: Date.now() });
  } catch {
    set({ geminiUsageFetched: true, geminiUsageLastFetched: Date.now() });
  }
},
```

**Step 2: Enhance geminiConnection type to include email and gcpProject**

Update the state type (line 115):

```typescript
geminiConnection: { connected: boolean; source?: string; masked?: string; email?: string; gcpProject?: string | null } | null;
```

---

## Task 4: Frontend — Sidebar UsageWidget Gemini Section

**Files:**
- Modify: `apps/web/src/components/layout/app-sidebar.tsx`

**Step 1: Add Gemini usage bars to sidebar**

Replace the current Gemini section (lines 387-407) with full usage display:

```tsx
{/* Gemini section */}
{geminiLoading ? (
  <div className="mt-2.5 pt-2.5 border-t border-stroke2 animate-pulse">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="h-3.5 w-3.5 rounded-full bg-neutral-bg1" />
      <div className="h-3 w-14 rounded bg-neutral-bg1" />
    </div>
  </div>
) : geminiConnection?.connected ? (
  <div className="mt-2.5 pt-2.5 border-t border-stroke2">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={2} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Gemini</span>
      </div>
      {geminiUsage && (
        <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-500 uppercase tracking-wider">
          {geminiUsage.planLabel}
        </span>
      )}
    </div>
    {geminiConnection.email && (
      <p className="text-[10px] text-neutral-fg-disabled truncate mb-2">
        {geminiConnection.email}
      </p>
    )}
    {geminiUsage ? (
      <div className="flex flex-col gap-2.5">
        <UsageBar
          label={t("usage.daily")}
          utilization={geminiUsage.utilization}
          resetsAt={null}
          color="bg-blue-500"
        />
      </div>
    ) : (
      <p className="text-[10px] text-neutral-fg-disabled">{t("providers.noUsageData")}</p>
    )}
  </div>
) : null}
```

Add `geminiUsage` to the store selectors at the top of `UsageWidget`:

```tsx
const geminiUsage = useUsageStore((s) => s.geminiUsage);
const fetchGeminiUsage = useUsageStore((s) => s.fetchGeminiUsage);
```

Add to the `useEffect` — fetch Gemini usage when connected with a gcpProject:

```tsx
// Inside the existing useEffect, after fetchGeminiConnection():
// Then conditionally fetch usage once connection is known
```

Separate `useEffect` for fetching usage once connection is loaded:

```tsx
useEffect(() => {
  if (geminiConnection?.connected && geminiConnection.gcpProject) {
    fetchGeminiUsage(geminiConnection.gcpProject);
  }
}, [geminiConnection, fetchGeminiUsage]);
```

---

## Task 5: Frontend — Settings Provider Card Gemini Usage

**Files:**
- Modify: `apps/web/src/routes/settings.tsx`

**Step 1: Replace the noUsageData placeholder with real usage display**

In the Gemini provider card's `usage` prop (line 887-889), replace with:

```tsx
usage: geminiConnected && geminiUsage ? (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-3">{t("providers.usageLimits")}</p>
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-neutral-fg2">{t("providers.daily")}</span>
          <span className={cn(
            "text-[10px] font-semibold tabular-nums",
            geminiUsage.utilization >= 80 ? "text-danger" : "text-neutral-fg1"
          )}>
            {geminiUsage.totalRequests.toLocaleString()} / {geminiUsage.limit.toLocaleString()}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-neutral-bg1 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              geminiUsage.utilization >= 90 ? "bg-danger" : geminiUsage.utilization >= 75 ? "bg-warning" : "bg-blue-500"
            )}
            style={{ width: `${Math.min(100, geminiUsage.utilization)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-neutral-fg-disabled">
            {geminiUsage.remaining.toLocaleString()} {t("providers.remaining")}
          </span>
          <span className="text-[9px] text-neutral-fg-disabled">
            {t("providers.plan")}: {geminiUsage.planLabel}
          </span>
        </div>
      </div>
    </div>
  </div>
) : geminiConnected && geminiConnection?.gcpProject ? (
  <div className="flex items-center gap-2">
    <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-fg-disabled" />
    <span className="text-[11px] text-neutral-fg-disabled">{t("common.loading")}</span>
  </div>
) : geminiConnected ? (
  <GeminiProjectInput onFetch={(projectId, plan) => {
    setGeminiProjectId(projectId);
    fetchGeminiUsageAction(projectId, plan);
  }} />
) : (
  <p className="text-[11px] text-neutral-fg-disabled">{t("providers.noUsageData")}</p>
),
```

**Step 2: Add inline GeminiProjectInput component**

Inside `ProvidersSection`, add a small input for the GCP Project ID when no project is auto-detected:

```tsx
function GeminiProjectInput({ onFetch }: { onFetch: (projectId: string, plan: string) => void }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState("");
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!projectId.trim()) return;
    setLoading(true);
    try {
      await onFetch(projectId.trim(), plan);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-stroke bg-neutral-bg3/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">{t("providers.gcpUsage")}</p>
      <p className="text-[10px] text-neutral-fg-disabled mb-2">{t("providers.gcpProjectHint")}</p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="my-gcp-project-id"
          className="w-full input-fluent text-[11px]"
        />
        <div className="flex gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="flex-1 input-fluent text-[11px]"
          >
            <option value="free">Free (1,000/day)</option>
            <option value="pro">Pro (1,500/day)</option>
            <option value="ultra">Ultra (2,000/day)</option>
          </select>
          <button
            onClick={handleCheck}
            disabled={!projectId.trim() || loading}
            className="btn-primary rounded-lg px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
            {t("providers.checkUsage")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add state for geminiUsage in ProvidersSection**

```tsx
// Add to ProvidersSection state:
const geminiUsage = useUsageStore((s) => s.geminiUsage);
const fetchGeminiUsageAction = useUsageStore((s) => s.fetchGeminiUsage);
const [geminiProjectId, setGeminiProjectId] = useState("");

// Also add to details section (geminiStatus connected block):
// After the models line, add plan badge if available:
{geminiUsage && (
  <div className="flex items-center justify-between">
    <span className="text-[11px] text-neutral-fg3">{t("providers.plan")}</span>
    <span className="text-[11px] font-medium text-neutral-fg1">{geminiUsage.planLabel}</span>
  </div>
)}
```

---

## Task 6: i18n — Add New Translation Keys

**Files:**
- Modify: `apps/web/src/i18n/locales/pt-BR.json`
- Modify: `apps/web/src/i18n/locales/en-US.json`
- Modify: `apps/web/src/i18n/locales/es.json`
- Modify: `apps/web/src/i18n/locales/zh-CN.json`
- Modify: `apps/web/src/i18n/locales/ja.json`

**Step 1: Add keys to providers and usage sections**

**pt-BR:**
```json
// In "providers" section, add:
"daily": "Diário",
"remaining": "restantes",
"checkUsage": "Ver Uso",
"gcpUsage": "Uso da API (Google Cloud)",
"gcpProjectHint": "Informe o ID do projeto GCP para ver as métricas de uso"

// In "usage" section, add:
"daily": "Diário"
```

**en-US:**
```json
// In "providers" section, add:
"daily": "Daily",
"remaining": "remaining",
"checkUsage": "Check Usage",
"gcpUsage": "API Usage (Google Cloud)",
"gcpProjectHint": "Enter your GCP Project ID to view usage metrics"

// In "usage" section, add:
"daily": "Daily"
```

**es / zh-CN / ja:** equivalent translations for the same keys.

---

## Task 7: Build & Verify

**Step 1: Build all packages**

```bash
pnpm build
```

Expected: Clean build, no TypeScript errors.

**Step 2: Test the flow**

1. Start dev: `pnpm dev`
2. Go to Settings → Providers → Gemini
3. With OAuth connected, enter a GCP Project ID and click "Check Usage"
4. Verify usage bar appears with requests/limit
5. Check sidebar — Gemini section should show usage bar when gcpProject is set
6. Verify cache works (second check returns instantly)

**Step 3: Commit**

```bash
git add apps/orchestrator/src/services/gemini-usage.ts apps/orchestrator/src/routes/gemini.ts apps/web/src/stores/usage-store.ts apps/web/src/components/layout/app-sidebar.tsx apps/web/src/routes/settings.tsx apps/web/src/i18n/locales/
git commit -m "feat: add Gemini usage monitoring via Google Cloud Monitoring API

- Add gemini-usage service querying monitoring.googleapis.com for request counts
- Add GET /api/gemini/usage route with 2min cache
- Add GET /api/gemini/plans route for plan limit info
- Update sidebar UsageWidget with Gemini usage bars
- Update settings provider card with usage display and GCP project input
- Add plan detection: free (1000/day), pro (1500/day), ultra (2000/day)
- Add i18n keys for all 5 locales"
```

---

## Dependency Graph

```
Task 1 (service) → Task 2 (route) → Task 3 (store) → Task 4 (sidebar) + Task 5 (settings)
                                                          ↘                 ↙
                                                           Task 6 (i18n)
                                                               ↓
                                                          Task 7 (build)
```

Tasks 4 and 5 can run in parallel after Task 3.
Task 6 can run in parallel with Tasks 4-5.
