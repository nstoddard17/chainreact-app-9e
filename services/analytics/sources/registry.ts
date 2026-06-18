import type { AnalyticsSourceAdapter, AnalyticsSourceMetric } from "./types";
import { internalAnalyticsSource } from "./internal";
import { githubAnalyticsSource } from "./github";

/**
 * Analytics SOURCE registry (Slice ANALYTICS-SOURCES-1).
 *
 * The single source of truth for which providers + metrics are APPROVED for
 * read-only analytics. SEPARATE from the trigger/action node registries by
 * design: registering a source here grants ONLY read/aggregate access through the
 * adapter's `query()`, never workflow-node execution.
 *
 * Adapters are registered statically (code), so widget config can reference a
 * provider/metric by KEY but can never name an arbitrary provider method, URL, or
 * node. Unknown provider/metric is rejected (`null` / not-approved) — callers
 * surface that as a widget error, never a crash.
 *
 * Registered sources:
 *   - INTERNAL ChainReact reference adapter (real account data, no OAuth).
 *   - GITHUB (connected app, read-only Search API, requesting-user-pinned
 *     personal credential) — ANALYTICS-SOURCES-GITHUB-1.
 *
 * Further connected-app adapters (Stripe, Gmail, Slack, …) get added here in
 * their own security-reviewed slices once their credential-scope + rate-limit +
 * error-normalization behavior is proven.
 */

const SOURCE_LIST: readonly AnalyticsSourceAdapter[] = [
  internalAnalyticsSource,
  githubAnalyticsSource,
];

const REGISTRY: ReadonlyMap<string, AnalyticsSourceAdapter> = new Map(
  SOURCE_LIST.map((a) => [a.providerKey, a]),
);

/** The adapter for `providerKey`, or null when not registered/approved. */
export function getAnalyticsSource(
  providerKey: string,
): AnalyticsSourceAdapter | null {
  return REGISTRY.get(providerKey) ?? null;
}

/** The metric descriptor for `(providerKey, metricKey)`, or null when not approved. */
export function getAnalyticsSourceMetric(
  providerKey: string,
  metricKey: string,
): AnalyticsSourceMetric | null {
  const source = REGISTRY.get(providerKey);
  if (!source) return null;
  return source.metrics.find((m) => m.key === metricKey) ?? null;
}

/** True iff `(providerKey, metricKey)` is a registered, approved analytics source metric. */
export function isApprovedSourceMetric(
  providerKey: string,
  metricKey: string,
): boolean {
  return getAnalyticsSourceMetric(providerKey, metricKey) !== null;
}

/** Catalog of approved sources + their metrics — safe to expose to clients. */
export interface AnalyticsSourceCatalogEntry {
  providerKey: string;
  displayName: string;
  connectedApp: boolean;
  metrics: readonly AnalyticsSourceMetric[];
}

export function listAnalyticsSources(): readonly AnalyticsSourceCatalogEntry[] {
  return SOURCE_LIST.map((a) => ({
    providerKey: a.providerKey,
    displayName: a.displayName,
    connectedApp: a.connectedApp,
    metrics: a.metrics,
  }));
}
