# ANALYTICS-FLEXIBILITY-CS-1 — Typed analytics query foundation (outcome)

**Type:** Implementation — backend only. No UI change; the Analytics page renders
exactly as before. **Nothing pushed, no PR, no deploy.** One forward-only
migration (RPC function only — no table/index/RLS change) applied to the dev DB
via `npm run db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (local)
**Plan:** [analytics-flexibility-audit-1.md](./analytics-flexibility-audit-1.md) (§15–§19, CS-1)

## What shipped

The typed, server-owned analytics query path the audit designed:

```
POST /api/analytics/query                       app/api/analytics/query/route.ts
  → requireAccount()  (session → membership-resolved ACTIVE account; no
    account id accepted from the client — same gate as every analytics route)
  → AnalyticsQuerySchema (.strict())             contracts/analyticsQuery.ts
  → runAnalyticsQuery(accountId, query)          services/analytics/insightQuery.ts
      validateAnalyticsQuery (capability matrix) contracts/analyticsQueryCapabilities.ts
      range/grain resolution (pure, UTC)         services/analytics/insightQueryTime.ts
      workflow-ownership validation              repositories/workflows.listByIdsForAccount
      SQL aggregation                            repositories/analytics/queries.ts
        → analytics_runs_aggregate RPC           supabase/migrations/20260801000000
      measure derivation (shared math)           services/analytics/metricDefinitions.ts
  → bounded AnalyticsQueryResult
```

No raw run rows reach the browser; no JS reduce over thousands of rows; no SQL,
column names, or JSON escape hatches in the contract.

## Query contract (final)

- **Measures:** `runs` · `succeeded_runs` · `failed_runs` · `success_rate` ·
  `avg_duration_ms`. (`tasks_used` deferred per D10; error category deferred per
  D9 pending the `failure_code` slice; no time_saved/cost — rejected.)
- **Dimensions:** `null` (KPI) · `time` · `workflow` · `status` · `trigger_source`.
- **Filters:** `workflowIds` (≤ 20, membership-validated) · `statuses`
  (succeeded/failed; rejected for status-fixed measures) · `triggerSources`
  (canonical `triggered_by` enum) · `includeTests` (default **false**).
- **Range:** presets `today/7d/30d/90d/ytd` (same rolling semantics as the
  overview) or custom `{from,to}` capped at **366 days**. Window is
  **[from, to)** — inclusive start, exclusive end.
- **Grains:** `auto` (≤ 92d → day, ≤ 731d → week, else month) · `day` · `week` ·
  `month` — time dimension only. Buckets are UTC calendar truncations (day /
  ISO-Monday week, matching `date_trunc` / month) — ≤ 400 buckets by contract.
- **Series (time only):** `by: "workflow"` — `explicit` exact ids or `top` N by
  run count (Top-N *within* an optional workflow filter); `by: "status"`.
  **Max 8 series** (D5). Explicit series + separate workflow filter is rejected
  as contradictory.
- **Compare:** `previous_period` — KPI + single-series time only (D6); equal
  adjacent window, `prev.to === main.from` (no overlap/double-count).
- **Sort/limit:** categorical only; ≤ 50 rows (default 25); value-sort puts
  null values last; workflow rows are top-by-runs before sorting (documented).
- **Result:** normalized `AnalyticsQueryResult` — kind (kpi/time_series/
  categorical), resolved grain, normalized range, stable series ids + current
  labels (`state`, "… (deleted)" suffix, "Untitled workflow" fallback), values
  as `number | null`, `warnings`, `truncated`. Empty buckets: counts → **0**,
  rate/duration → **null**.

## Capability matrix

`contracts/analyticsQueryCapabilities.ts` is the ONE canonical definition
(client-safe: no SQL, no authz). Per measure: allowed dimensions, series
dimensions, status-filterability, empty-bucket semantics (`zero`/`null`),
compare support, future stackability (counts only). `validateAnalyticsQuery`
rejects — never silently rewrites — e.g.: success rate by status, series off
the time dimension, grain off the time dimension, sort/limit off categorical,
status filters on status-fixed measures, compare on multi-series, > 8 series,
empty explicit selection, > 366-day ranges. Every rejection is plain-language
copy the future builder UI can surface verbatim.

## Metric definitions (single source)

`services/analytics/metricDefinitions.ts` now owns the math; **the legacy
overview imports it too** (`totalsFor` in `analyticsOverview.ts`):

- success rate = `succeeded / (succeeded + failed)`; **no terminal runs → null
  (canonical)**. The legacy `AnalyticsOverview` contract has a non-nullable
  `successRate`, so it coerces `?? 0` at ONE documented edge — pinned by
  `analyticsQueryParity.test.ts`.
- avg duration = `round(Σ(finished−started)/count)` over rows WITH
  `finished_at`; failed-but-finished included; unfinished excluded; negative
  (clock-skew) durations clamp to 0; none → null.
- Terminal domain is exactly `succeeded|failed`; `running`/`queued` excluded in
  SQL. Retries are ordinary run facts (`triggered_by='retry'`) — no dedup, no
  invented lineage.
- Test runs excluded by default; included only with `includeTests: true`.

**Parity is test-enforced**: one fixture reduced through the real
`buildAnalyticsOverview` AND through a reference reducer mirroring the RPC's
SQL semantics + the real shared `deriveMeasureValue` must agree
(runs/succeeded/failed/rate/avg-duration/test-exclusion). A semantics change on
either side fails the pin.

**Known documented divergence:** the legacy overview's in-range test includes
`until` (`t <= until`); the query path is exclusive (`t < to`). Only a run on
the exact millisecond boundary differs; the parity fixture keeps runs strictly
inside the window so it can't mask real drift. Unifying is a CS-4 option.

## SQL / RPC design

`analytics_runs_aggregate` (migration `20260801000000`, **applied to dev via
`npm run db:push`**): one read-only (`STABLE`) plpgsql function returning BASE
aggregates (`runs/succeeded/failed/dur_sum_ms/dur_count`) grouped by an
allow-listed dimension (+ optional series key for time charts). No measure math
in SQL (prevents SQL↔JS definition drift); no dynamic SQL — typed parameters +
closed `IN (...)` validation with `RAISE EXCEPTION` on anything else; payload
columns (`trigger_event/steps/fatal_error/error_classification`) never
selected. Bounds enforced in SQL as defense in depth: `p_limit` 1–100 and
categorical-only; ≤ 20 workflow ids; **series-by-workflow REQUIRES an id list**
(a grouped series can never fan out per-workflow unbounded).

**Grants:** `SECURITY INVOKER` (deliberate divergence from the billing RPCs'
`SECURITY DEFINER` — this function needs no elevation; its only caller is the
service-role client, which already reads `workflow_runs`). EXECUTE **revoked**
from `public/anon/authenticated`, granted to `service_role` only — proven live
by the gated suite (authenticated + anon calls are denied).

## Authorization path

1. Route: `requireAccount()` → `resolveActiveAccount(user.id)` (membership +
   freeze re-verified; stored pointer never trusted). 401 anon / 403 frozen or
   non-member. No `accountId` field exists in the request contract.
2. Service: every client-named workflow id (filters + explicit series) is
   resolved through `workflows.listByIdsForAccount(accountId, ids)` — session
   client (RLS) **plus** explicit account predicate. Any miss (nonexistent OR
   cross-account — indistinguishable by construction) throws ONE fixed
   `UNKNOWN_WORKFLOW` error **before any id reaches SQL**.
3. Route maps `UNKNOWN_WORKFLOW` to a byte-identical 400 with fixed copy (never
   echoes ids or the thrown message); `INVALID_QUERY` → typed 400; unexpected →
   generic 500 (`ANALYTICS_QUERY_FAILED`), details to server logs only.
4. RPC account predicate + service-role-only EXECUTE are defense in depth.

## Legacy-overview safety fixes (included, behavior-preserving)

- **Exact truncation:** `getAnalyticsOverview` fetches CAP+1 (5001) and trims —
  an exactly-5000-row account is no longer falsely flagged `truncated`.
- **Narrow reads:** new `workflows.listSummariesByAccount` (`id,name,state` —
  no `draft_definition` JSONB) and `integrations.listActiveProvidersByAccount`
  (`provider` only — token/scope/metadata columns never leave the DB) replace
  the two `select('*')` calls in the overview path only. `listByAccount` /
  `listActiveByAccount` are untouched for their other callers.
- **Shared math:** `totalsFor` now derives rate/avg from `metricDefinitions`.
- NOT done here (CS-2 owns UI): rendering `truncated`, dashboard rename UI,
  any widget/library change. The overview was NOT re-expressed through the new
  query service (deliberate — audit CS-6+).

## Structure

`repositories/` hit the 50-file leaf cap, so the new repo starts the analytics
domain split: **`repositories/analytics/queries.ts`** (future analytics repos —
and eventually the dashboard/snapshot repos — belong there).
`insightQuery.ts` split its pure time helpers into `insightQueryTime.ts` to
stay under the 400-line lint cap. Route stays thin (gate → parse → service →
serialize); service holds no SQL; repository holds no business rules; the
capability matrix holds no authz/SQL.

## Performance verification (measured, honest)

Method: scratchpad script (one-off, not committed) seeded a **synthetic
account with 200,000 runs across 40 workflows over 400 days** into the dev DB
(batched `unnest` inserts), ran `ANALYZE`, then `EXPLAIN (ANALYZE, BUFFERS)` on
the RPC's inner query shapes plus 5× timings of the real RPC; the account and
all rows were deleted afterward (verified 0 remaining).

| Shape (200k-run account) | SQL exec | RPC round-trip (5×, incl. network) | Plan |
|---|---|---|---|
| 30d day-bucketed, account-wide | 31.7 ms | 66–68 ms | Index Scan `workflow_runs_account_idx` |
| 90d day series, exact 8 workflows | 70.8 ms | 121–188 ms | Index Scan `workflow_runs_account_idx` |
| 90d workflow categorical (limit 26) | 89.6 ms | 157–165 ms | Index Scan + HashAgg + top-N sort |
| 365d KPI | 165.8 ms | 359–366 ms | Parallel Seq Scan (window ≈ whole table — correct planner choice) |
| 365d month-bucketed | 198.2 ms | 460–472 ms | Parallel Seq Scan |

Result sizes stayed bounded regardless of source rows (1–505 rows; the 505 =
~90 buckets × up to 8 series). All shapes meet the audit's ≤ 500 ms target **at
200k rows**. Honest limitations: (1) 1M rows was not seeded (time-boxed; 200k
is the largest reasonable run here — the ≤500ms@1M target remains a target, to
re-measure before default-on UI); (2) the 365d shapes chose a seq scan because
this synthetic account dominated the table — on a production table where one
account is a small fraction of rows, the account-id index predicate keeps those
windowed too; (3) timings are dev-DB, single-client. **No new index or rollup
table is justified by this evidence** — the audit's rollup stays
budget-triggered.

## Tests (all written this slice; all passing)

- `tests/unit/contracts/analyticsQuery.test.ts` (17) — strict parsing, unknown
  keys, deferred-measure rejection, caps; full valid/invalid capability sweep,
  series/mode rules, compare rules, range caps, normalization defaults.
- `tests/unit/services/analytics/metricDefinitions.test.ts` (10) — duration
  clamp/null, canonical zero-run rate = null, avg rounding, per-measure
  derivation, failed-finished inclusion.
- `tests/unit/services/analytics/insightQuery.test.ts` (20) — preset/custom
  windows, auto-grain thresholds, day/ISO-week/month buckets over [from,to);
  KPI derivation + non-overlapping compare window; zero-fill vs null-fill;
  exact-ids → exact series (order preserved, stray/unselected rows never become
  series); status series; Top-N two-phase resolution (bounded discovery →
  scoped series); index-aligned compare series; non-leaking identical
  UNKNOWN_WORKFLOW for missing vs cross-account (no aggregate I/O after);
  INVALID_QUERY before any I/O; categorical limit+1 truncation + warnings +
  deleted/unknown labels + label/value sort with nulls last; includeTests
  passthrough.
- `tests/unit/services/analytics/analyticsQueryParity.test.ts` (5) — the
  overview↔query-engine parity pin (above) + the documented zero-run coercion.
- `tests/unit/app/api/analytics/query-route.test.ts` (9) — 401; 403 frozen;
  session-derived scope; strict-body 400; invalid JSON; INVALID_QUERY mapping;
  **byte-identical** UNKNOWN_WORKFLOW responses; 200 wrap; generic 500 with no
  table/account leakage.
- `tests/integration/security/analytics-runs-aggregate-rpc.test.ts` (9, gated,
  REAL DB, passing) — hand-computed KPI (7/5/2/17800ms/6) incl. from-boundary
  inclusion + to-boundary exclusion; **two-account isolation**; test-run
  exclusion/inclusion; status/trigger/workflow filters; day-bucketed
  exact-workflow series; categorical p_limit bound; SQL rejection of unbounded
  workflow series; aggregate-only result shape (no payload columns);
  **authenticated + anon EXECUTE denied**.

## Verification commands actually run

- `npx tsc --noEmit` — clean (0 errors).
- `npm run lint` — 0 errors; 0 warnings in files touched by this slice (24
  pre-existing warnings elsewhere unchanged).
- `npm run lint:structure` — clean (after the `repositories/analytics/` split).
- `npm run lint:migrations` — clean.
- `npm run db:push` — applied `20260801000000_analytics_runs_aggregate.sql` to
  the dev DB (target-guard OK; benign supabase-CLI docker catalog-cache warning).
- Focused suites: 5 new unit suites (64 tests) + full analytics unit tree
  (80 suites / 1014 tests → after the helper split re-run: 77 suites / 938 in
  the rerun scope) + gated RPC DB suite (9 tests) — all passing.
- Perf script (scratchpad): seed 200k → EXPLAIN/timings above → cleanup
  verified.
- Full `npm test`: **started but stopped at Marcus's direction after ~40
  minutes without completing — no full-suite result is claimed.** Coverage
  relevant to this slice was proven by the focused runs above (all analytics
  unit suites + the new contract/service/route/parity suites + the gated
  real-DB RPC suite, all passing). Note the repo carried ~20 pre-existing
  failing suites unrelated to analytics (provider field-sensitivity /
  discovery / MCP option-source / activeAccount — recorded in PROJECT_MEMORY
  before this slice), so a future full run should be judged against that
  baseline.

## Known limitations / follow-ups

- 1M-row measurement outstanding (target remains ≤ 500 ms p95; re-measure
  before CS-2 defaults the UI on).
- Boundary divergence (legacy `<= until` vs new `< to`) documented; unify when
  the overview re-expresses through the query service.
- Hour grain intentionally absent (bounded-range guard first).
- No route-level rate limiting on the query endpoint yet (bounded queries +
  session gate; revisit with CS-2's per-widget fan-out).
- `AnalyticsQueryResultSchema` is exported for the future client; the service
  constructs results typed (not re-parsed) — CS-2's client can parse defensively.

## CS-2 starting boundary

CS-2 = the **Custom insight widget**: extend `AnalyticsWidgetConfigSchema` with
an additive `insight` config, widget library card, Measure/Show-over/Filter
builder consuming `ANALYTICS_MEASURE_CAPABILITIES` (grey-out) + live preview
via `POST /api/analytics/query`, line/bar/KPI/table bodies on the existing SVG
primitives (8-color palette, legend toggle, a11y table fallback), per-widget
states incl. `truncated`, dashboard rename UI + dialog cleanup, duplicate
widget. Backend: none beyond what shipped here.
