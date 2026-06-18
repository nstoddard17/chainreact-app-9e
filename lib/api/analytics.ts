import type {
  AnalyticsDashboard,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsWidget,
} from "@/contracts/analytics";
import type { NormalizedAnalyticsResult } from "@/services/analytics/sources/types";

/**
 * Typed client for the Analytics API (Slice ANALYTICS-1).
 *
 * Per project-structure-and-module-boundaries.md §5: client code calls this
 * module, never `fetch()` directly. Failures surface as `AnalyticsApiError` so
 * the dashboard UI can render friendly retry/error states.
 */

export type AnalyticsApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class AnalyticsApiError extends Error {
  readonly code: AnalyticsApiErrorCode;
  readonly status: number;
  constructor(message: string, code: AnalyticsApiErrorCode, status: number) {
    super(message);
    this.name = "AnalyticsApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseError(res: Response): Promise<AnalyticsApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    // Non-JSON body — keep default.
  }
  const code: AnalyticsApiErrorCode =
    res.status === 401
      ? "UNAUTHENTICATED"
      : res.status === 403
        ? "FORBIDDEN"
        : res.status === 404
          ? "NOT_FOUND"
          : res.status === 400
            ? "BAD_REQUEST"
            : res.status >= 500
              ? "SERVER_ERROR"
              : "UNKNOWN";
  return new AnalyticsApiError(message, code, res.status);
}

export async function listDashboards(): Promise<readonly AnalyticsDashboard[]> {
  const res = await fetch("/api/analytics/dashboards");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { dashboards: AnalyticsDashboard[] };
  return body.dashboards;
}

export async function createDashboard(input: {
  name: string;
  widgets?: readonly AnalyticsWidget[];
}): Promise<AnalyticsDashboard> {
  const res = await fetch("/api/analytics/dashboards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { dashboard: AnalyticsDashboard };
  return body.dashboard;
}

export async function updateDashboard(
  id: string,
  patch: { name?: string; position?: number; widgets?: readonly AnalyticsWidget[] },
): Promise<AnalyticsDashboard> {
  const res = await fetch(`/api/analytics/dashboards/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { dashboard: AnalyticsDashboard };
  return body.dashboard;
}

export async function deleteDashboard(id: string): Promise<void> {
  const res = await fetch(`/api/analytics/dashboards/${id}`, { method: "DELETE" });
  if (!res.ok) throw await parseError(res);
}

export async function getAnalyticsData(
  range: AnalyticsRange,
): Promise<AnalyticsOverview> {
  const res = await fetch(`/api/analytics/data?range=${encodeURIComponent(range)}`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { overview: AnalyticsOverview };
  return body.overview;
}

/**
 * Connected-app source query (Slice ANALYTICS-SOURCES-GITHUB-UI-1). Returns a
 * discriminated outcome: `{ ok: true, result }` on success, or
 * `{ ok: false, code, message }` for a source-level state (missing credential,
 * rate limit, invalid config, …) so the widget renders a safe state. Throws
 * `AnalyticsApiError` only on request-level failures (401 / 403 / 400 / 500).
 *
 * The browser never calls a provider API directly — this hits the server route,
 * which resolves the caller's own credential server-side.
 */
export type SourceQueryOutcome =
  | { ok: true; result: NormalizedAnalyticsResult }
  | { ok: false; code: string; message: string };

export interface SourceQueryInput {
  provider: string;
  metric: string;
  range: AnalyticsRange;
  /** GitHub `owner/repo` (back-compat convenience for `filters.repo`). */
  repo?: string;
  /** Provider-specific filters (e.g. Slack `channel` / `keyword`). */
  filters?: Readonly<Record<string, string>>;
  groupBy?: string;
  refresh?: boolean;
}

export async function querySourceData(
  input: SourceQueryInput,
): Promise<SourceQueryOutcome> {
  const params = new URLSearchParams({ metric: input.metric, range: input.range });
  if (input.repo) params.set("repo", input.repo);
  if (input.filters) {
    for (const [key, value] of Object.entries(input.filters)) {
      if (value) params.set(key, value);
    }
  }
  if (input.groupBy) params.set("groupBy", input.groupBy);
  if (input.refresh) params.set("refresh", "1");
  const res = await fetch(
    `/api/analytics/sources/${encodeURIComponent(input.provider)}/data?${params.toString()}`,
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SourceQueryOutcome;
}
