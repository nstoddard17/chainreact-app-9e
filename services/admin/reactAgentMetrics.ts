import {
  aggregateReactAgentMetrics,
  type ReactAgentMetricsFilter,
} from "@/repositories/reactAgent/metrics";
import type { ReactAgentMetrics } from "@/contracts/internalReactAgent";

/**
 * services/admin/reactAgentMetrics.ts (INTERNAL-FEEDBACK-2).
 *
 * Orchestration for the internal React Agent metrics API: validate + normalize
 * the requested date range, invoke the aggregation repository, and assemble the
 * count-only DTO. No DB access here (repository owns that) and no authorization
 * here (the route's `requireInternalAdmin` owns that). Keeps the route thin.
 */

/** Thrown for an invalid date range; the route maps it to a 400. */
export class MetricsRangeError extends Error {}

export interface GetReactAgentMetricsInput {
  from?: string | null;
  to?: string | null;
}

/** Normalize a bound to an ISO string, or null. Rejects unparseable input. */
function normalizeBound(value: string | null | undefined, label: string): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new MetricsRangeError(`Invalid "${label}" date.`);
  }
  return d.toISOString();
}

export async function getReactAgentMetrics(
  input: GetReactAgentMetricsInput,
): Promise<ReactAgentMetrics> {
  const from = normalizeBound(input.from, "from");
  const to = normalizeBound(input.to, "to");
  if (from && to && new Date(from) > new Date(to)) {
    throw new MetricsRangeError('"from" must be on or before "to".');
  }

  const filter: ReactAgentMetricsFilter = { from, to };
  const agg = await aggregateReactAgentMetrics(filter);

  return {
    range: { from, to },
    totals: {
      agentChanges: agg.totalAgentChanges,
      governanceEvents: agg.governance.total,
    },
    previewFunnel: {
      created: agg.preview.created,
      applied: agg.preview.applied,
      keptAsPreview: agg.preview.keptAsPreview,
      discarded: agg.preview.discarded,
      applyFailed: agg.preview.applyFailed,
      undone: agg.preview.undone,
    },
    testOutcomes: { tested: agg.test.tested, testFailed: agg.test.testFailed },
    setupIssues: agg.setupIssues,
    governance: {
      byOutcome: {
        success: agg.governance.success,
        denied: agg.governance.denied,
        failed: agg.governance.failed,
      },
    },
  };
}
