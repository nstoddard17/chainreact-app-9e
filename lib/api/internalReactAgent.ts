import type { ReactAgentMetrics } from "@/contracts/internalReactAgent";

/**
 * Typed client for the internal React Agent metrics API (INTERNAL-FEEDBACK-2).
 *
 * Per project-structure-and-module-boundaries.md §5: feature hooks/components call
 * this module, never `fetch()` directly. Same-origin cookie carries the session
 * (the route re-verifies internal-admin server-side). A non-admin / signed-out
 * caller gets a 404 here, surfaced as an `InternalReactAgentApiError`.
 */

export class InternalReactAgentApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InternalReactAgentApiError";
    this.status = status;
  }
}

export interface ReactAgentMetricsQuery {
  from?: string | null;
  to?: string | null;
}

export async function fetchReactAgentMetrics(
  query: ReactAgentMetricsQuery = {},
): Promise<ReactAgentMetrics> {
  const qs = new URLSearchParams();
  if (query.from) qs.set("from", query.from);
  if (query.to) qs.set("to", query.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const res = await fetch(`/api/internal/react-agent/metrics${suffix}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new InternalReactAgentApiError(
      `React Agent metrics request failed (HTTP ${res.status}).`,
      res.status,
    );
  }
  return (await res.json()) as ReactAgentMetrics;
}
