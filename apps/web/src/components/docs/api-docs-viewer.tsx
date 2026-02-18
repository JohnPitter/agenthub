import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  ChevronRight,
  RefreshCw,
  Loader2,
  Code,
  AlertCircle,
} from "lucide-react";
import { cn, api } from "../../lib/utils";
import { EmptyState } from "../ui/empty-state";
import type { ApiEndpoint, ApiEndpointParam } from "@agenthub/shared";

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: "bg-green-100", text: "text-green-700" },
  POST: { bg: "bg-blue-100", text: "text-blue-700" },
  PATCH: { bg: "bg-amber-100", text: "text-amber-700" },
  PUT: { bg: "bg-purple-100", text: "text-purple-700" },
  DELETE: { bg: "bg-red-100", text: "text-red-700" },
};

function MethodBadge({ method }: { method: string }) {
  const colors = METHOD_COLORS[method.toUpperCase()] ?? {
    bg: "bg-neutral-100",
    text: "text-neutral-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        colors.bg,
        colors.text,
      )}
    >
      {method}
    </span>
  );
}

function ParamRow({ param }: { param: ApiEndpointParam }) {
  return (
    <tr className="border-t border-stroke2/50">
      <td className="py-2 pr-3 text-[12px] font-mono text-neutral-fg1">
        {param.name}
        {param.required && (
          <span className="ml-1 text-danger text-[10px]">*</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <span className="rounded bg-neutral-bg2 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-fg3 uppercase">
          {param.in}
        </span>
      </td>
      <td className="py-2 pr-3 text-[12px] font-mono text-neutral-fg2">
        {param.type}
      </td>
      <td className="py-2 text-[12px] text-neutral-fg3">
        {param.required ? "Required" : "Optional"}
      </td>
    </tr>
  );
}

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const hasParams = endpoint.params && endpoint.params.length > 0;

  return (
    <div className="border border-stroke2 rounded-lg overflow-hidden transition-all hover:shadow-2">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left bg-neutral-bg1 hover:bg-neutral-bg-hover transition-colors"
      >
        <MethodBadge method={endpoint.method} />
        <span className="flex-1 truncate text-[13px] font-mono text-neutral-fg1">
          {endpoint.path}
        </span>
        <span className="hidden sm:block text-[12px] text-neutral-fg3 truncate max-w-[300px]">
          {endpoint.description}
        </span>
        {hasParams && (
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-neutral-fg3 transition-transform",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>

      {expanded && (
        <div className="border-t border-stroke2 bg-neutral-bg-subtle px-4 py-3">
          {endpoint.description && (
            <p className="text-[12px] text-neutral-fg2 mb-3">
              {endpoint.description}
            </p>
          )}

          {hasParams ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-semibold text-neutral-fg3 uppercase">
                    <th className="pb-2 pr-3">{t("apiDocs.paramName")}</th>
                    <th className="pb-2 pr-3">{t("apiDocs.paramIn")}</th>
                    <th className="pb-2 pr-3">{t("apiDocs.paramType")}</th>
                    <th className="pb-2">{t("apiDocs.paramRequired")}</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params!.map((param) => (
                    <ParamRow key={`${param.in}-${param.name}`} param={param} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-neutral-fg3 italic">
              {t("apiDocs.noParams")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ApiDocsViewer() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ endpoints: ApiEndpoint[] }>(
        "/docs-gen/api",
      );
      setEndpoints(data.endpoints);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load API docs",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api("/docs-gen/generate-api", { method: "POST" });
      await fetchEndpoints();
    } catch {
      // silent — fetchEndpoints will show error if needed
    } finally {
      setRegenerating(false);
    }
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  // Filter endpoints
  const searchLower = search.toLowerCase();
  const filtered = search
    ? endpoints.filter(
        (e) =>
          e.path.toLowerCase().includes(searchLower) ||
          e.description.toLowerCase().includes(searchLower) ||
          e.method.toLowerCase().includes(searchLower),
      )
    : endpoints;

  // Group by route group
  const groups = new Map<string, ApiEndpoint[]>();
  for (const ep of filtered) {
    const group = ep.group || "Other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(ep);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-danger">
          <AlertCircle className="h-5 w-5" />
          <span className="text-[13px] font-medium">{error}</span>
        </div>
        <button
          onClick={fetchEndpoints}
          className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <EmptyState
        icon={Code}
        title={t("apiDocs.emptyTitle")}
        description={t("apiDocs.emptyDesc")}
        action={{
          label: t("apiDocs.regenerate"),
          onClick: handleRegenerate,
          icon: RefreshCw,
        }}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-stroke2 px-6 py-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-fg3" />
          <input
            type="text"
            placeholder={t("apiDocs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-stroke2 bg-neutral-bg1 py-2 pl-9 pr-3 text-[13px] text-neutral-fg1 placeholder:text-neutral-fg-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <span className="text-[12px] text-neutral-fg3">
          {filtered.length} {t("apiDocs.endpointCount")}
        </span>

        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-2 rounded-lg border border-stroke2 bg-neutral-bg1 px-3 py-2 text-[12px] font-semibold text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", regenerating && "animate-spin")}
          />
          {t("apiDocs.regenerate")}
        </button>
      </div>

      {/* Endpoint groups */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Search className="h-8 w-8 text-neutral-fg-disabled" />
            <p className="text-[13px] text-neutral-fg3">
              {t("common.noResults")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([group, eps]) => {
              const isCollapsed = collapsedGroups.has(group);
              return (
                <div key={group}>
                  <button
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center gap-2 mb-3"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-neutral-fg3 transition-transform",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                    <h3 className="text-[14px] font-semibold text-neutral-fg1 capitalize">
                      {group}
                    </h3>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-neutral-bg2 px-1.5 text-[10px] font-semibold text-neutral-fg3">
                      {eps.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-2 ml-6">
                      {eps.map((ep) => (
                        <EndpointCard
                          key={`${ep.method}-${ep.path}`}
                          endpoint={ep}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
