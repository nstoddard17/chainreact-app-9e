import type {
  AnalyticsDashboard,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsWidget,
} from "@/contracts/analytics";

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
