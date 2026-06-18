import { hashPayload } from "@/core/workflows/idempotency";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import * as repo from "@/repositories/analyticsSourceSnapshots";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type NormalizedAnalyticsResult,
} from "./types";

/**
 * Analytics source cache layer (Slice ANALYTICS-SOURCES-CACHE-1).
 *
 * Wraps a source adapter's `query()` with a TTL, account-scoped snapshot cache
 * (`analytics_source_snapshots`). Cache-first by default; `refresh` bypasses the
 * read. On a transient provider failure (rate limit / provider error) an expired
 * snapshot is served as a stale fallback with a warning, rather than failing.
 *
 * PERSONAL-CREDENTIAL ISOLATION: for personal-credential providers (e.g. GitHub)
 * the cache key includes `source_user_id = ctx.userId`, so each member's snapshot
 * is distinct and never shared account-wide. Account-shared providers cache with
 * `source_user_id = null` (account-visible). This pairs with the table's RLS.
 *
 * Only NormalizedAnalyticsResult is ever stored, and it is Zod-validated on both
 * read and write — a corrupt/legacy blob is treated as a miss, never rendered.
 */

function utcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** UTC-day-bucketed range key, so repeated loads in the same window share a row. */
export function computeRangeKey(range: { since: string; until: string }): string {
  return `${utcDate(range.since)}..${utcDate(range.until)}`;
}

/** Deterministic SHA-256 of the (canonicalized) filters. */
export function computeFiltersHash(
  filters: Readonly<Record<string, string | number | boolean>> | undefined,
): string {
  return hashPayload(filters ?? {});
}

export interface CacheKeyParts {
  accountId: string;
  sourceUserId: string | null;
  providerKey: string;
  metricKey: string;
  rangeKey: string;
  groupBy: string | null;
  filtersHash: string;
}

/** Stable cache key over the full scoped tuple (account + source user included). */
export function computeCacheKey(parts: CacheKeyParts): string {
  return hashPayload({
    account: parts.accountId,
    sourceUser: parts.sourceUserId,
    provider: parts.providerKey,
    metric: parts.metricKey,
    range: parts.rangeKey,
    groupBy: parts.groupBy,
    filters: parts.filtersHash,
  });
}

export function resolveTtlSeconds(source: AnalyticsSourceAdapter): number {
  const ttl = source.cacheTtlSeconds;
  return typeof ttl === "number" && ttl > 0 ? ttl : 0;
}

export interface CacheQueryParams {
  context: AnalyticsSourceContext;
  metricKey: string;
  range: { since: string; until: string };
  groupBy?: string;
  filters?: Readonly<Record<string, string | number | boolean>>;
}

function withFreshness(
  result: NormalizedAnalyticsResult,
  freshness: NormalizedAnalyticsResult["freshness"],
): NormalizedAnalyticsResult {
  return { ...result, freshness };
}

function ageSeconds(generatedAtIso: string, nowMs: number): number {
  const g = Date.parse(generatedAtIso);
  if (Number.isNaN(g)) return 0;
  return Math.max(0, Math.floor((nowMs - g) / 1000));
}

/** Read + Zod-validate a snapshot; corrupt/missing → null. */
async function readValidSnapshot(
  cacheKey: string,
): Promise<{ result: NormalizedAnalyticsResult; generatedAt: string; expiresAt: string } | null> {
  const snap = await repo.getByCacheKey(cacheKey);
  if (!snap) return null;
  const parsed = NormalizedAnalyticsResultSchema.safeParse(snap.result);
  if (!parsed.success) return null;
  return { result: parsed.data, generatedAt: snap.generatedAt, expiresAt: snap.expiresAt };
}

/**
 * Query a source through the cache. `source`, `params` are already validated by
 * `queryAnalyticsSource`. Returns a NormalizedAnalyticsResult with cache-aware
 * `freshness`.
 */
export async function queryWithCache(
  source: AnalyticsSourceAdapter,
  params: CacheQueryParams,
  options: { refresh?: boolean } = {},
): Promise<NormalizedAnalyticsResult> {
  const adapterQuery = {
    metricKey: params.metricKey,
    range: params.range,
    ...(params.groupBy !== undefined ? { groupBy: params.groupBy } : {}),
    ...(params.filters !== undefined ? { filters: params.filters } : {}),
  };

  const ttl = resolveTtlSeconds(source);
  // No TTL → never cache (cheap internal sources): always live.
  if (ttl <= 0) {
    return source.query(adapterQuery, params.context);
  }

  const sourceUserId = isPersonalCredentialProvider(source.providerKey)
    ? params.context.userId
    : null;
  const rangeKey = computeRangeKey(params.range);
  const filtersHash = computeFiltersHash(params.filters);
  const groupBy = params.groupBy ?? null;
  const cacheKey = computeCacheKey({
    accountId: params.context.accountId,
    sourceUserId,
    providerKey: source.providerKey,
    metricKey: params.metricKey,
    rangeKey,
    groupBy,
    filtersHash,
  });
  const nowMs = Date.now();

  // Cache-first (unless a manual refresh was requested).
  if (!options.refresh) {
    const snap = await readValidSnapshot(cacheKey);
    if (snap && Date.parse(snap.expiresAt) > nowMs) {
      return withFreshness(snap.result, {
        cached: true,
        ageSeconds: ageSeconds(snap.generatedAt, nowMs),
        ttlSeconds: ttl,
        stale: false,
      });
    }
  }

  // Live query (refresh, miss, or stale).
  let result: NormalizedAnalyticsResult;
  try {
    result = await source.query(adapterQuery, params.context);
  } catch (err) {
    // Stale-with-warning fallback for TRANSIENT provider failures only. A
    // MISSING_CREDENTIAL / INVALID_QUERY / UNKNOWN_* is not transient → rethrow.
    if (
      err instanceof AnalyticsSourceError &&
      (err.code === "RATE_LIMITED" || err.code === "PROVIDER_ERROR")
    ) {
      const snap = await readValidSnapshot(cacheKey);
      if (snap) {
        return withFreshness(
          {
            ...snap.result,
            warnings: [
              ...snap.result.warnings,
              "Showing recently cached data — the source couldn't be reached just now.",
            ],
          },
          {
            cached: true,
            ageSeconds: ageSeconds(snap.generatedAt, nowMs),
            ttlSeconds: ttl,
            stale: true,
          },
        );
      }
    }
    throw err;
  }

  // Persist (best-effort + validated). A cache-write failure must not fail the
  // query — the freshly-computed result is still returned.
  if (NormalizedAnalyticsResultSchema.safeParse(result).success) {
    try {
      await repo.upsertServiceRole({
        accountId: params.context.accountId,
        sourceUserId,
        providerKey: source.providerKey,
        metricKey: params.metricKey,
        rangeKey,
        groupBy,
        filtersHash,
        cacheKey,
        result,
        generatedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + ttl * 1000).toISOString(),
      });
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: "analytics.cache.write_failed",
          provider: source.providerKey,
          metric: params.metricKey,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  return withFreshness(result, {
    cached: false,
    ageSeconds: 0,
    ttlSeconds: ttl,
    stale: false,
  });
}
