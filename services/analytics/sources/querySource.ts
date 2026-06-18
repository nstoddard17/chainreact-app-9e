import {
  AnalyticsSourceError,
  type AnalyticsSourceContext,
  type NormalizedAnalyticsResult,
} from "./types";
import { getAnalyticsSource, getAnalyticsSourceMetric } from "./registry";

/**
 * Server-side analytics source query path (Slice ANALYTICS-SOURCES-GITHUB-1).
 *
 * The single safe entry point for running a registered analytics source. It
 * validates EVERYTHING against the registry + the metric descriptor before
 * touching an adapter, then delegates to the adapter's read-only `query()`.
 *
 * It NEVER executes a workflow node and NEVER lets widget JSON name an arbitrary
 * provider method / URL: `providerKey` + `metricKey` must resolve in the registry,
 * `groupBy` must be in the metric's `supportedGroupBy`, and every `filters` key
 * must be in `supportedFilters`. Anything else → typed `AnalyticsSourceError`.
 *
 * AUTH CONTRACT: `ctx` MUST be resolved from the CALLER'S OWN session
 * (`requireAccount` / `resolveActiveAccount`) — `accountId` is the account scope
 * and, for personal-credential providers (e.g. GitHub), `userId` selects the
 * caller's OWN connection. This service does not have a request and does not
 * re-authenticate; the future HTTP route owns `requireAccount` + membership before
 * calling it (mirrors how `getAnalyticsOverview` trusts its resolved accountId).
 *
 * Errors are typed (`AnalyticsSourceError`) so the caller maps them to a widget
 * warning/error — they are never unhandled page crashes.
 */

export interface QueryAnalyticsSourceInput {
  providerKey: string;
  metricKey: string;
  range: { since: string; until: string };
  groupBy?: string;
  filters?: Readonly<Record<string, string | number | boolean>>;
  context: AnalyticsSourceContext;
}

export async function queryAnalyticsSource(
  input: QueryAnalyticsSourceInput,
): Promise<NormalizedAnalyticsResult> {
  const source = getAnalyticsSource(input.providerKey);
  if (!source) {
    throw new AnalyticsSourceError(
      `Unknown analytics source: ${input.providerKey}`,
      "UNKNOWN_SOURCE",
    );
  }

  const metric = getAnalyticsSourceMetric(input.providerKey, input.metricKey);
  if (!metric) {
    throw new AnalyticsSourceError(
      `Unknown metric for ${input.providerKey}: ${input.metricKey}`,
      "UNKNOWN_METRIC",
    );
  }

  // Date range.
  const since = Date.parse(input.range.since);
  const until = Date.parse(input.range.until);
  if (Number.isNaN(since) || Number.isNaN(until) || until <= since) {
    throw new AnalyticsSourceError("Invalid date range.", "INVALID_QUERY");
  }

  // group-by must be one the metric declares.
  if (input.groupBy !== undefined && !metric.supportedGroupBy.includes(input.groupBy)) {
    throw new AnalyticsSourceError(
      `Unsupported group-by for ${input.metricKey}: ${input.groupBy}`,
      "INVALID_QUERY",
    );
  }

  // Every filter key must be allow-listed by the metric (values validated by adapter).
  if (input.filters) {
    for (const key of Object.keys(input.filters)) {
      if (!metric.supportedFilters.includes(key)) {
        throw new AnalyticsSourceError(
          `Unsupported filter for ${input.metricKey}: ${key}`,
          "INVALID_QUERY",
        );
      }
    }
  }

  return source.query(
    {
      metricKey: input.metricKey,
      range: input.range,
      ...(input.groupBy !== undefined ? { groupBy: input.groupBy } : {}),
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
    },
    input.context,
  );
}
