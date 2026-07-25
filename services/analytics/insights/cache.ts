import { createHash } from "node:crypto";
import {
  ConnectedAnalyticsError,
  ConnectedAnalyticsResultSchema,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import * as snapshotsRepo from "@/repositories/analyticsSourceSnapshots";

/**
 * Snapshot-cache seam for CONNECTED dataset queries (CD-2).
 *
 * Reuses the existing `analytics_source_snapshots` table + ownership model
 * (account-scoped rows; personal-credential rows carry `source_user_id` and
 * are RLS-isolated per member). Connected entries live in their own key
 * NAMESPACE ("insights:v1:*", and `metric_key = "insights:<dataset>"`), so
 * they can never collide with the legacy fixed-metric widget snapshots.
 *
 * Rules (mirroring sources/cache.ts):
 *   - Fresh hit → served with computed age; provider untouched.
 *   - Cold → the caller-provided `execute` runs (coalescing/limiter wrap it
 *     one level up); the Zod-validated result is stored best-effort (a cache
 *     write failure never fails the query).
 *   - STALE FALLBACK only for transient failures (RATE_LIMITED /
 *     PROVIDER_ERROR): an expired snapshot is served with `stale: true` + a
 *     warning. Credential/validation errors (MISSING_CREDENTIAL /
 *     RECONNECT_REQUIRED / INVALID_QUERY / MIXED_CURRENCY / UNKNOWN_*)
 *     ALWAYS rethrow — revoked access never keeps reading old data.
 */

const NAMESPACE = "insights:v1";

export interface InsightsCacheIdentity {
  accountId: string;
  /** Personal-credential sources: the viewing member. Account-class: null. */
  sourceUserId: string | null;
  sourceId: string;
  datasetId: string;
  query: ConnectedAnalyticsQuery;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** Deterministic, key-order-independent cache key (also the coalescing key). */
export function buildInsightsCacheKey(id: InsightsCacheIdentity): string {
  const payload = JSON.stringify(
    canonical({
      ns: NAMESPACE,
      accountId: id.accountId,
      sourceUserId: id.sourceUserId,
      sourceId: id.sourceId,
      datasetId: id.datasetId,
      query: id.query,
    }),
  );
  return `${NAMESPACE}:${createHash("sha256").update(payload).digest("hex")}`;
}

function rangeKeyOf(query: ConnectedAnalyticsQuery): string {
  return "preset" in query.range
    ? query.range.preset
    : `${query.range.from}..${query.range.to}`;
}

function withFreshness(
  result: ConnectedAnalyticsResult,
  freshness: ConnectedAnalyticsResult["freshness"],
  extraWarning?: string,
): ConnectedAnalyticsResult {
  return {
    ...result,
    freshness,
    warnings: extraWarning ? [...result.warnings, extraWarning] : result.warnings,
  };
}

function parseStored(raw: unknown): ConnectedAnalyticsResult | null {
  const parsed = ConnectedAnalyticsResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null; // corrupt blob = miss
}

const TRANSIENT: ReadonlySet<string> = new Set(["RATE_LIMITED", "PROVIDER_ERROR"]);

export async function queryInsightsWithCache(
  id: InsightsCacheIdentity,
  ttlSeconds: number,
  execute: () => Promise<ConnectedAnalyticsResult>,
  opts: { refresh?: boolean; now?: number } = {},
): Promise<ConnectedAnalyticsResult> {
  const now = opts.now ?? Date.now();
  const cacheKey = buildInsightsCacheKey(id);

  let snapshot: snapshotsRepo.AnalyticsSnapshotRecord | null = null;
  if (ttlSeconds > 0) {
    snapshot = await snapshotsRepo.getByCacheKey(cacheKey);
    if (!opts.refresh && snapshot && Date.parse(snapshot.expiresAt) > now) {
      const stored = parseStored(snapshot.result);
      if (stored) {
        const ageSeconds = Math.max(
          0,
          Math.round((now - Date.parse(snapshot.generatedAt)) / 1000),
        );
        return withFreshness(stored, { mode: "cached", ageSeconds, ttlSeconds });
      }
    }
  }

  try {
    const live = await execute();
    if (ttlSeconds > 0) {
      try {
        await snapshotsRepo.upsertServiceRole({
          accountId: id.accountId,
          sourceUserId: id.sourceUserId,
          providerKey: id.sourceId,
          metricKey: `insights:${id.datasetId}`,
          rangeKey: rangeKeyOf(id.query),
          groupBy: id.query.dimension,
          filtersHash: cacheKey,
          cacheKey,
          result: ConnectedAnalyticsResultSchema.parse(live),
          generatedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
        });
      } catch (writeErr) {
        console.error("insights cache write failed", writeErr);
      }
    }
    return live;
  } catch (err) {
    if (
      err instanceof ConnectedAnalyticsError &&
      TRANSIENT.has(err.code) &&
      snapshot
    ) {
      const stored = parseStored(snapshot.result);
      if (stored) {
        const ageSeconds = Math.max(
          0,
          Math.round((now - Date.parse(snapshot.generatedAt)) / 1000),
        );
        return withFreshness(
          stored,
          { mode: "cached", ageSeconds, ttlSeconds, stale: true },
          "Showing recently saved data — the provider couldn't be reached just now.",
        );
      }
    }
    throw err;
  }
}
