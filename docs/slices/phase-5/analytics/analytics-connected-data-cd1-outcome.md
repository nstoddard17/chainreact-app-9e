# ANALYTICS-CONNECTED-DATA-CD-1 — Catalog + ChainReact adapter (outcome)

**Type:** Implementation — backend only. No UI change; no migration; no
`db:push`; nothing pushed/deployed. **Date:** 2026-07-24 · **Branch:** `v2-main`
**Plan:** [analytics-connected-data-audit-1.md](./analytics-connected-data-audit-1.md) (CD-1)

## What shipped

The provider-agnostic connected-analytics foundation:

- **Catalog contracts** — [contracts/analyticsCatalog.ts](../../../../contracts/analyticsCatalog.ts):
  client-safe `.strict()` Zod for sources (internal/account/personal credential
  modes) and datasets (curated typed fields, date fields, named measures,
  charts, part-to-whole donut gating, series capabilities, compare, query
  limits, freshness, execution mode, previewSafe, friendly `scopeNote`).
  Field invariants make bad analytics unrepresentable (only `number` +
  `measurable` fields aggregate; only bounded category/entity/boolean fields
  dimension; text is display-only; `optionsSource` is entity-only; currency
  behavior requires the currency unit). Sensitive fields are excluded by
  policy — no "sensitive flag" escape hatch exists.
- **Mechanical derivation** — [contracts/analyticsCatalogDerive.ts](../../../../contracts/analyticsCatalogDerive.ts):
  pure `deriveDatasetCapabilities` → count (suppressible), sum/avg/min/max
  over allow-listed measurable fields (sum→0-empty, avg/extrema→null-empty),
  distinct-count only where declared, dimensions (time iff a historical date
  field exists), typed filters with picker metadata. Named provider measures
  merge after collision checks.
- **Connected query + result contracts** — [contracts/connectedAnalytics.ts](../../../../contracts/connectedAnalytics.ts):
  `ConnectedAnalyticsQuery` (source/dataset/measure/dimension/dateField/grain/
  filters/series ≤8/range ≤366d/compare/chart/sort/limit; `.strict()`, no
  account/user/connection ids) and `ConnectedAnalyticsResult` with structured
  `valueMeta` (unit + currency), `freshness` (live/cached/age/ttl/stale),
  `completeness` (complete/scan_capped/row_capped/provider_sampled/
  partially_synced — partial data is never only a warning sentence), source
  attribution, series/buckets/rows with `number|null`, optional opaque
  `drilldown` token, plus typed `ConnectedAnalyticsError`.
- **Registry** — [services/analytics/insights/registry.ts](../../../../services/analytics/insights/registry.ts):
  static (no runtime/dynamic registration, no override), load-time validation
  (duplicate ids, dangling references, options-source existence via the REAL
  options registry, donut-needs-part-to-whole, current-state datasets cannot
  declare time charts), adapter binding per dataset. **Raw OAuth scopes live
  on the adapter registration (server-only), never in the client contract.**
- **Validation** — [validateQuery.ts](../../../../services/analytics/insights/validateQuery.ts):
  one canonical capability check (measure/dimension/date-field/grain/chart/
  filters incl. typed values and per-measure incompatibilities/series incl.
  measure-compatibility and modes/compare/range span/limits) with
  customer-safe copy; never a silent rewrite.
- **Client projection** — [clientProjection.ts](../../../../services/analytics/insights/clientProjection.ts):
  deterministic runtime projection (no generated-artifact build step — none
  exists in the repo) that CD-3 will consume; excludes scopes, execution
  modes, adapters, and all server internals. The existing hand-maintained
  widget catalog is untouched — old widgets and all 25 provider metrics keep
  working; providers migrate individually (no big-bang).
- **ChainReact source** — [chainreact.ts](../../../../services/analytics/insights/chainreact.ts):
  `chainreact.workflow_runs` dataset (named measures runs/succeeded/failed/
  success_rate/avg_duration; dimensions time/workflow/status/trigger_source;
  filters workflows/statuses/sources/include-tests default-off; series
  workflow explicit/top ≤8 + status auto; kpi/line/bar/table; compare;
  live/0-TTL; `local_sql`). The **workflow filter's `optionsSource` is null**
  — no registered internal resolver exists; CD-3 uses the existing account
  workflow listing (documented; no client-invented list).
- **Adapter** — thin translation → CS-1 `AnalyticsQuery` (schema-parsed) →
  the UNTOUCHED `runAnalyticsQuery` → connected result. CS-1's RPC, metric
  definitions, membership validation, non-leaking unknown-workflow behavior
  (mapped to `UNKNOWN_ENTITY` with identical copy), null-vs-zero, date and
  compare semantics, and bounds all pass through. Internal datasets never
  touch provider-credential resolution.
- **Route** — [app/api/analytics/insights/query/route.ts](../../../../app/api/analytics/insights/query/route.ts):
  `POST /api/analytics/insights/query` — `requireAccount` → strict parse →
  orchestrator ([runConnectedQuery.ts](../../../../services/analytics/insights/runConnectedQuery.ts))
  → serialize; typed 400s (UNKNOWN_SOURCE/UNKNOWN_DATASET generic copy,
  UNKNOWN_ENTITY fixed non-leaking copy, INVALID_QUERY), generic 500.
  **CS-1's `POST /api/analytics/query` is unchanged.**

## Drift guard

The ChainReact catalog is **parity-pinned** to CS-1's
`ANALYTICS_MEASURE_CAPABILITIES` (per-measure dimensions, empty-bucket
semantics, status-filterability, compare) by
[registryAndProjection.test.ts](../../../../tests/unit/services/analytics/insights/registryAndProjection.test.ts) —
a capability change on either side fails the pin. Divergence from the audit's
conceptual sketch: catalog scopes moved server-side onto adapter
registrations; `credentialMode: "internal"` added rather than pretending
ChainReact has a credential; runtime projection chosen over checked-in
generated source.

## Security

No account/user/connection id in any client contract (schema-tested); scope
always the session-resolved active account; catalog/measure/filter ids
validated server-side against the registry (crafted ids → typed 400s with no
registry leak); options-source references allow-listed at load; adapter
results contain no `trigger_event`/`steps`/`fatal_error`/definitions
(no-payload test); client projection excludes `requiredScopes`/execution
internals (tested); CS-1 grants/RLS untouched (no migration in this slice);
personal snapshot isolation untouched (sources layer not modified).

## Tests & verification (all actually run)

- New suites (45 tests, all passing): field-model invariants + derivation
  ([analyticsCatalog.test.ts](../../../../tests/unit/contracts/analyticsCatalog.test.ts)),
  registry validation + parity pin + projection safety, connected-query
  validation (15 invalid-combination cases, no-I/O) + **adapter↔CS-1 parity**
  (KPI value/compare, explicit-series buckets/labels/deleted, categorical
  rows/truncation→structured completeness, UNKNOWN_ENTITY non-leak, test
  filter passthrough), route gate/mapping
  ([insights-query-route.test.ts](../../../../tests/unit/app/api/analytics/insights-query-route.test.ts)).
- Regression: full analytics tree green — **85 suites / 1,077 tests** (CS-1
  suites, overview, dashboards, sources registry/routes/cache, features/
  analytics UI suites) — no existing behavior changed.
- `npx tsc --noEmit` clean · `npm run lint:structure` clean (after moving the
  phase-5 analytics docs into `docs/slices/phase-5/analytics/` — the phase-5
  folder hit the 50-file cap) · `npm run lint:migrations` clean · eslint on
  all touched files clean.
- **Full `npm test` NOT run this slice** (Marcus directed the previous
  slice's full run to be stopped after ~40 minutes; the repo carries ~20
  known pre-existing failing suites unrelated to analytics). Coverage claims
  here rest on the focused + regression runs listed above only.
- **No migration created; `db:push` not run; nothing pushed or deployed.**

## Known limitations / CD-2 boundary

Value-semantics fields (`currency` codes on results, scan-capped
completeness) have no producer yet — Stripe (CD-2) is the first. **CD-2 =**
Stripe Payments dataset behind this contract (fields amount/status/customer,
derived + named measures, structured currency, declared scan caps →
`scan_capped` completeness), plus the platform's in-flight request coalescing
and the per-account+provider rate limiter (that slice's only migration).
CD-3 consumes `buildClientAnalyticsCatalog()` for the builder UI. No UI, no
provider calls, no cache changes happened in CD-1.
