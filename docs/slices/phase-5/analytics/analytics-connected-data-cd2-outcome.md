# ANALYTICS-CONNECTED-DATA-CD-2 — Stripe Payments dataset + pipeline (outcome)

**Type:** Implementation — backend only. No UI change. One forward-only
migration (limiter, `20260802000000`) **applied to the dev DB** via
`npm run db:push`. Nothing pushed/deployed. **Date:** 2026-07-24 · `v2-main`
**Plan:** [analytics-connected-data-audit-1.md](./analytics-connected-data-audit-1.md) (CD-2) ·
builds on [analytics-connected-data-cd1-outcome.md](./analytics-connected-data-cd1-outcome.md)

## What shipped

**Stripe → Payments** as the first external connected dataset, plus the
provider-query safeguards (snapshot cache integration, in-flight coalescing,
protective rate limiter) the Custom Insight UI requires.

### Dataset (`stripe.payments`) — [insights/stripe/index.ts](../../../../services/analytics/insights/stripe/index.ts)

- **Fields**: amount (currency, per-record, deliberately NOT mechanically
  measurable — honest monetary measures need the succeeded-only domain),
  status (low-cardinality, dim+filter), currency (bounded, dim+filter),
  customer (entity, **filter-only**, `maxSelections: 1` → maps to Stripe's
  server-side single-customer list param via the existing `stripe:customers`
  resolver), created (historical date). No PII fields exist in the catalog
  (no email/description/receipt/card/metadata — excluded, not flagged).
- **Measures** (named; exact semantics in
  [aggregate.ts](../../../../services/analytics/insights/stripe/aggregate.ts)):
  Payments (all returned charges) · Successful payments (`status=succeeded`) ·
  Failed payments (`status=failed`) · **Gross payment amount** (Σ original
  amount of succeeded charges — refunds/fees NOT subtracted; labeled gross,
  never "revenue"/net) · Average payment amount (gross domain ÷ succeeded
  count; null when none). Refund-adjusted measures deferred (no partial-refund
  amounts in the projection — decision 14).
- **Dimensions**: KPI/time/status/currency for counts; monetary measures are
  KPI/time only (no dishonest cross-status or cross-currency monetary
  grouping). Series: by status (≤3, auto). Charts kpi/line/bar/table;
  compare (KPI + single-series; a second bounded scan covers the previous
  window). Limits: 366d / 400 buckets / 50 rows / **2,000-charge scan cap**
  declared as `queryLimits.maxRecordsScanned`.
- **Scan behavior**: reuses the bounded `scanChargesWindow` (extended with the
  server-side `customer` param — facts stay the same 4 non-identifying
  fields), `created` bounds derived from the [from, to) window (no
  post-fetch-only date filtering), cursor pagination ≤20×100. Cap hit →
  structured `completeness: scan_capped` + warning disclosing the
  **newest-first bias** ("the 2,000 most recent matching payments").

### Money correctness

Integer minor-unit accumulation; ONE conversion at emit through the existing
zero-decimal-aware helper (`minorToMajor`; JPY-class currencies never ÷100);
values are major-unit decimals with `valueMeta.currency` (uppercase ISO).
**Mixed currencies on a monetary measure throw typed `MIXED_CURRENCY`**
("Filter to one currency or chart Payment count instead") — never a silent
dominant currency; an explicit single-currency filter resolves it; counts may
group/filter by currency freely; compare windows must match the main window's
currency. Proven for 2-decimal, zero-decimal, large-total precision, and
empty-domain (gross→0, avg→null) cases.

### Pipeline — [runConnectedQuery.ts](../../../../services/analytics/insights/runConnectedQuery.ts)

For `freshness.mode: "cached"` datasets: **cache → coalesce → limiter →
adapter**.

- **Cache** ([insights/cache.ts](../../../../services/analytics/insights/cache.ts)):
  reuses `analytics_source_snapshots` (+ its RLS/ownership) under a new
  namespace — `cache_key = "insights:v1:" + sha256(canonical identity)`,
  `metric_key = "insights:<dataset>"` — collision-free vs legacy fixed-metric
  snapshots (untouched). Key covers account + personal source-user + source +
  dataset + full normalized query, canonicalized (object key order
  irrelevant). TTL from the catalog (Stripe 600 s). Stale fallback ONLY on
  transient `RATE_LIMITED`/`PROVIDER_ERROR` (served with `stale: true` +
  warning); `MISSING_CREDENTIAL`/`RECONNECT_REQUIRED`/`INVALID_QUERY`/
  `MIXED_CURRENCY` always rethrow — revoked access never reads old data.
- **Coalescing** ([coalesce.ts](../../../../services/analytics/insights/coalesce.ts)):
  process-local in-flight map keyed by the SAME cache key (so cross-account/
  cross-user coalescing is impossible); leader executes, followers await;
  entries removed on settle (failures shared once, never poisoning retries);
  defensive 120 s abandonment sweep. **Per-instance only — documented; the
  Postgres limiter is the cross-instance guard.**
- **Limiter** (migration
  [20260802000000](../../../../supabase/migrations/20260802000000_analytics_provider_rate_limits.sql) ·
  policy [insightsRateLimitPolicy.ts](../../../../core/analytics/insightsRateLimitPolicy.ts) ·
  repo [providerRateLimits.ts](../../../../repositories/analytics/providerRateLimits.ts) ·
  service [rateLimit.ts](../../../../services/analytics/insights/rateLimit.ts)):
  mirrors the MCP/api-key fixed-window pattern — `analytics_provider_rate_limits`
  system table (RLS deny-all, service_role-only grants + RPC) with atomic
  two-dimension increments: per-account (30/min) and per-account+source
  (10/min), with an optional `:u:<userId>` segment ready for personal
  providers (no schema change needed later). **Cost model: logical cold
  queries** — consumed ONLY by the coalescing leader on a cache miss (a cold
  Stripe query ≤20 provider GETs ⇒ worst case ≤200 Stripe requests/acct/min);
  cache hits and followers are free. Over-limit → typed `RATE_LIMITED` with
  `retryAfterSeconds` (route: HTTP 429); an expired snapshot still serves
  stale under the protective limit. Buckets embed derived ids only. Rows
  self-expire (60 s windows) — no purge coupling needed for transient
  counters (documented in the migration header). This is ChainReact's
  protective limit, not a mirror of Stripe's global limits.

### Route & errors

`POST /api/analytics/insights/query` unchanged in shape; adds `?refresh=1`
(explicit bypass) and maps `RATE_LIMITED → 429 {retryAfterSeconds}`,
`MIXED_CURRENCY/MISSING_CREDENTIAL/RECONNECT_REQUIRED → 400` with fixed safe
copy. No account/integration ids, tokens, or Stripe payload data accepted or
emitted; unexpected → generic 500.

## Existing fixed Stripe widgets — unchanged

The legacy adapter, metric ids, route, cache keys, and UI catalog are
untouched; `scanChargesWindow`'s extension is additive (new optional param).
The full legacy suite (sources registry/adapters/routes/cache + features/
analytics) passes unchanged — 99 suites / 1,308 tests in the regression run.

## Security

Session-derived account only; account-class credential via
`getActiveForExecution(accountId, "stripe", null)` (never user-pinned, never
client-selected); cache/coalescing/limiter all keyed per-account (+ per-user
for future personal sources); catalog ids re-validated per query; client
projection carries no scopes (`read_write` lives on the adapter registration,
test-pinned); facts are transient 4-field projections — charge/customer ids
never enter results (no-payload test bans `ch_*/cus_*/receipt/description/
token` strings); snapshot rows store only schema-validated normalized
aggregates; limiter table unreachable by anon/authenticated (gated DB-proven).

## Tests & verification (all actually run)

- **New**: [stripePayments.test.ts](../../../../tests/unit/services/analytics/insights/stripePayments.test.ts)
  (18 — catalog/projection safety, money incl. zero-decimal + mixed-currency +
  precision, semantics incl. [from,to) boundaries + series + compare +
  scan-cap, adapter incl. customer param + pagination cursor + error
  classification + no-payload) ·
  [pipeline.test.ts](../../../../tests/unit/services/analytics/insights/pipeline.test.ts)
  (9 — cache hit/miss/keys/stale rules, 10-concurrent→1-execution coalescing +
  failure/retry + isolation, limiter policy/deny/stale-degrade) · route 429/
  MIXED_CURRENCY mapping (in the CD-1 route suite) ·
  **gated live-DB** [analytics-provider-rate-limits.test.ts](../../../../tests/integration/security/analytics-provider-rate-limits.test.ts)
  (3 — atomic concurrent increments 1..8 with no lost updates, bucket
  isolation, anon/authenticated denied) — all passing.
- **Regression**: analytics + contracts tree **99 suites / 1,308 tests
  green** (one CD-1 listing pin updated intentionally: sources now
  `["chainreact","stripe"]`). `npm run lint:migrations` clean; eslint on all
  touched files clean; `npm run db:push` applied `20260802000000`.
- **Baseline breakage at HEAD, not from this slice**: `lint:structure` fails
  because parallel arcs (HELP-CENTER-1 `9bf381ca7`, TEAM-INVITATION-EMAIL-1
  `cf371554f`) refilled `docs/slices/phase-5/` to 51 files; repo `tsc` has 4
  errors confined to `tests/unit/features/apps/AppCardHelpLinks.test.tsx`
  (same parallel arc) plus in-flight uncommitted `AppCard.tsx` WIP. CD-2
  files typecheck clean and add nothing to phase-5 root. Left for the owning
  arc — not reorganized mid-slice.
- **Performance/concurrency evidence (fixture-based)**: 10 identical
  concurrent cold requests → exactly 1 provider execution + 1 budget unit;
  10 distinct requests → 10 executions; warm hits → 0 provider calls/budget;
  compare = 2 bounded scans; results bounded by contract (≤400 buckets/≤50
  rows). **No live-latency claims** — fixture timings only.
- **Live Stripe certification: BLOCKED** — the dev database has **0 active
  Stripe connections** (verified via service-role count). A connected Stripe
  test account is required; all provider-boundary behavior is fixture-proven
  and the limiter is live-DB-proven. Do not expose the dataset in CD-3 UI
  defaults before a live pass.
- **Full `npm test`: launched after the CD-2 commit; totals reported in the
  Owner Report** (repo baseline: ~20 known unrelated failing suites +
  the parallel-arc breakage above).

## CD-3 boundary

The App → Data → Show → Group by builder can now render both sources from
`buildClientAnalyticsCatalog()` and query them through one route with real
freshness (`cached/age/stale`), completeness (`scan_capped`/`row_capped`),
typed connect/reconnect/rate-limit/mixed-currency states, and `?refresh=1`.
Remaining for CD-3: the UI itself (+ widget `insight` config persistence);
for CD-4: next datasets; live Stripe certification when a test account exists.
