# ANALYTICS-CONNECTED-DATA-CD-3A — Catalog-driven Custom Insight builder (outcome)

**Type:** Implementation — first customer-facing connected-data UI. No migration;
no `db:push`; nothing pushed/deployed. **Date:** 2026-07-25 · worktree
`C:/tmp/cd3a-wt`, branch `cd3a-insight-builder`, based on `v2-main` @ `7cf122d16`
**Plan:** [analytics-connected-data-audit-1.md](./analytics-connected-data-audit-1.md) (CD-3A) ·
builds on [CD-1](./analytics-connected-data-cd1-outcome.md) / [CD-2](./analytics-connected-data-cd2-outcome.md)

## Plain-language result

Owners/admins can add a **Custom insight** widget to any Analytics dashboard and
build a chart through *App → Data → Show → Group by → Only include → Series →
Time → Chart*, with a real live preview, then save it like any other widget.
CD-3A ships two chart types — **Number (KPI)** and **Line** — and one publicly
eligible source: **ChainReact → Workflow runs**. Stripe → Payments is fully
wired through the same builder but remains **non-public (preview exposure)**
pending live certification.

## Customer flow

Edit dashboard → Add a widget → Custom insight → panel opens with "Where is the
data from?" → choose app (connection state shown; connect CTA when needed) →
choose data → choose measure (a guided default of "no grouping — one number"
completes immediately) → optionally group over time, filter, split into up to 8
lines (automatic / top-N / choose exact), pick range/grain/compare → preview
loads the real query (debounced, aborted when superseded) → Apply → Done
editing persists the layout in the existing atomic PATCH. Reload rebuilds the
identical query from the saved config through the same code path the preview
used.

## Catalog-driven control generation

Every list the builder renders comes from `buildClientAnalyticsCatalog()`
(CD-1's client projection), via pure selectors in
[insightCatalog.ts](../../../../features/analytics/insights/insightCatalog.ts).
No handwritten source/dataset/measure/filter/series/chart lists exist in the
UI, and no component branches on a provider name — tests drive the whole
builder with fictional "acme"/"internal_app" sources. Two small catalog
contract additions this slice:

- **`exposure: "hidden" | "preview" | "public"`** (required) on the source
  definition — see below.
- **`values: [{id,label}]`** (optional) on bounded category fields, so status /
  trigger-source filters render real labeled choice lists. Account-specific
  bounded sets (Stripe currencies) legitimately omit `values` and fall back to
  a generic typed-chip entry.

Dependency edits run through the pure `reconcileInsightDraft` — the smallest
invalid portion is cleared, surviving choices are preserved, and every clear
renders an explanation beside the affected step (including when the step
itself disappears). Nothing is ever silently rewritten; the server
(`validateQuery.ts`) stays authoritative.

## Insight persistence

New widget type `insight` with `config.insight` =
`InsightWidgetConfigSchema` ([contracts/analytics.ts](../../../../contracts/analytics.ts)):
source/dataset/measure/dimension/dateField/timeGrain/filters/series/range/
compare/chart — the user's question and nothing else. `.strict()` at every
level makes account/user/integration ids, tokens, provider responses, rows,
freshness, errors, and colors unrepresentable (contract-tested). Existing
widgets and dashboards parse unchanged; saved configs are re-validated at
render (schema + catalog lookup) and again server-side on every query.
`toDashboard` now salvages **per widget**: one malformed blob costs that
widget, never the board (previously the whole board degraded to empty).
No config version was needed — the field is additive and strict.

## Exposure / certification handling

`exposure` is the declarative certification boundary, enforced in TWO places
with zero provider-name conditionals:

- `buildClientAnalyticsCatalog({environment})` — production receives only
  `public` sources; development/tests also receive `preview` sources, marked
  with a Preview badge in the source card.
- `runConnectedAnalyticsQuery` — a `preview` source in production (or `hidden`
  anywhere) throws `UNKNOWN_SOURCE` with byte-identical copy to a genuinely
  unknown source (no existence leak). A crafted request cannot reach an
  uncertified provider.

ChainReact = `public`. **Stripe = `preview`** — invisible and unqueryable for
production users; fully exercised by tests and local dev. The later read-only
certification batch flips one literal (`"preview"` → `"public"`) and touches
nothing in the builder. **If this commit were deployed today, production users
would see exactly one new thing: the Custom insight widget with the ChainReact
source. No Stripe surface changes.**

## Connection states

Internal sources show no connection chrome at all. Account sources resolve the
account connection server-side (`app/analytics/page.tsx` now unions catalog
providerIds into `resolveConnectedProviders`); missing → connect CTA in the
source card, the preview, and the saved widget (no query is sent while
disconnected). `RECONNECT_REQUIRED` from the route renders a reconnect action.
Personal-source plumbing is generic (viewer's own connection; friendly copy in
the source card) but no personal source ships yet.

## Preview & saved-widget lifecycle

One hook owns the request lifecycle for both paths
([useInsightQuery.ts](../../../../features/analytics/insights/useInsightQuery.ts)):
debounce (500 ms for previews), AbortController cancellation of superseded
requests, monotonic-sequence stale-response protection, cache-first loads,
explicit `?refresh=1` refresh (ignored while one is in flight — no request
storms; CD-2 coalescing/limiter untouched), retry, and prior-result retention:
a failed refresh keeps the previous result on screen with **"Couldn't refresh —
showing previously saved data."** — never silently fresh-looking. Preview is
gated: no request for incomplete/locally-invalid drafts, none while
disconnected, and non-`previewSafe` datasets require an explicit "Run preview".
Preview results never enter persistence (asserted in tests).

## KPI & line chart

- **KPI** ([InsightKpi](../../../../features/analytics/insights/InsightKpi.tsx)):
  unit-aware via `valueMeta` — counts whole, percents from 0..1 fractions,
  durations humanized, currency via the result's ISO code (zero-decimal
  correct; unknown currency → plain number, never assumed USD), generic units
  suffixed; null = em dash + "No data to measure", never zero. Comparison is
  **neutral** ("↑ Up 12.4% vs previous period", muted color) — no good/bad
  semantics, zero-previous handled without division.
- **Line** ([InsightLineChart](../../../../features/analytics/insights/InsightLineChart.tsx)):
  a focused new component (the legacy `LineChart` primitive — kept untouched
  for existing widgets — supports none of: null gaps, 8 series, legend
  toggles, tooltips, keyboard access, unstretched geometry). Up to 8 series in
  deterministic server order; fixed-slot colors from new `--insight-series-1..8`
  theme tokens (light + dark steps validated with the dataviz palette
  validator against the app's real surfaces; sub-3:1 light slots are covered
  by the text legend + table view). Nulls are gaps (no interpolation), zeros
  are points; legend toggles are local view state (no refetch, no query
  change); dashed muted previous-period line; hover crosshair + tooltip;
  measured-container width (no SVG distortion); single axis; no mixed units.

## Accessibility

Chart region is keyboard-focusable: arrows/Home/End move a reading crosshair
whose values are announced via a polite live region; Escape clears. Every line
chart has a generated text summary and a **"View data"** toggle rendering an
accessible table with exactly the chart's buckets/values (correct headers,
units, currency; null stays "—", zero stays 0) — nothing is hover-only. Legend
entries are real buttons with `aria-pressed`. Series identity never relies on
color alone (labels + table). Loading pulses are `motion-reduce:animate-none`;
the chart itself does not animate. Native inputs/buttons throughout the
builder.

## Freshness & completeness

Driven by structured result fields only (never parsed warnings):
live → "Live ChainReact data"; cached → "Updated 5 minutes ago" + Refresh
button; server stale-fallback → "Stripe couldn't refresh. Showing data from 18
minutes ago."; client-retained prior → the couldn't-refresh line above.
Non-complete completeness states (`scan_capped` / `row_capped` /
`provider_sampled` / `partially_synced`) render a visible warning badge with
plain-language copy, the server's detail (incl. the newest-first scan bias
disclosure) as tooltip + SR text, while the data stays visible.

## Typed errors

[insightErrorCopy.ts](../../../../features/analytics/insights/insightErrorCopy.ts)
maps every route code to fixed customer-safe copy + action (connect /
reconnect / retry / edit / none): missing connection, reconnect, rate limit
("…refreshed several times recently. Try again shortly."), mixed currency
("Filter to one currency or choose a count instead."), provider unavailable,
unknown entity, unknown source/dataset & invalid saved config ("This insight
uses settings that are no longer available. Edit the widget to update it."),
generic fallback. Raw server text renders only for builder-context
`INVALID_QUERY`, whose sentences are validateQuery's designed fix-it copy.
`MISSING_PERMISSION` / plan-restriction codes don't exist in the backend yet;
they fall to the generic mapping until a producer exists (no fabricated
states). `scopeNote` from the catalog renders under the dataset step.

## Dashboard & existing-Analytics compatibility

Insights ride the existing lifecycle end-to-end: library entry ("Custom
insight" — one generic entry, no per-provider entries), add/configure/apply/
Done-editing atomic PATCH, reload, re-edit (rehydrates the saved question),
resize/reorder/remove/rename, dashboard switching, owner/admin gating with
member read-only (members see data, no controls), default dashboards, and a
failed dashboard save keeps the draft (existing behavior). No new persistence
table, no saved-query entity, no auto-save, no widget migration. Insight
widgets show their own range/freshness — the dashboard's global range pill is
suppressed for them. Untouched and passing: Overview, all legacy widget types,
connected fixed-metric widgets (incl. Stripe), sources cache, CS-1 route,
insights route shape, CD-2 cache/coalescing/limiter, exports, roles.

## Tests & verification (all actually run, in the worktree)

- **New (87 tests across 9 suites):** insight widget contract
  ([analyticsInsightWidget.test.ts](../../../../tests/unit/contracts/analyticsInsightWidget.test.ts)) ·
  exposure filtering + query-gate no-leak ([exposure.test.ts](../../../../tests/unit/services/analytics/insights/exposure.test.ts)) ·
  reconciliation + query construction ([reconcileInsightConfig.test.ts](../../../../tests/unit/features/analytics/insights/reconcileInsightConfig.test.ts)) ·
  formatting ([formatInsightValue.test.ts](../../../../tests/unit/features/analytics/insights/formatInsightValue.test.ts)) ·
  query-lifecycle hook incl. stale-response, debounce, abort-on-unmount,
  refresh-retains-prior ([useInsightQuery.test.tsx](../../../../tests/unit/features/analytics/insights/useInsightQuery.test.tsx)) ·
  KPI/line/table/freshness/completeness rendering ([insightRendering.test.tsx](../../../../tests/unit/features/analytics/insights/insightRendering.test.tsx)) ·
  saved-widget states incl. widget isolation ([InsightWidgetBody.test.tsx](../../../../tests/unit/features/analytics/insights/InsightWidgetBody.test.tsx)) ·
  entity picker ([InsightEntityPicker.test.tsx](../../../../tests/unit/features/analytics/insights/InsightEntityPicker.test.tsx)) ·
  full builder flow on a fictional-source catalog ([InsightBuilderFlow.test.tsx](../../../../tests/unit/features/analytics/insights/InsightBuilderFlow.test.tsx)) ·
  dashboard lifecycle integration ([insightDashboardIntegration.test.tsx](../../../../tests/unit/features/analytics/insights/insightDashboardIntegration.test.tsx)).
  Plus per-widget-salvage cases added to the dashboards service suite and the
  exposure field added to the catalog contract suite.
- **Regression:** full analytics + contracts tree green — **113 suites /
  1,494 tests** (CS-1, CD-1, CD-2, dashboards, sources registry/adapters/
  routes/cache, features/analytics incl. legacy Stripe widgets, roles/authz
  routes) — two intentional test updates only (exposure fixture field;
  dashboards salvage expectations).
- `npx tsc --noEmit` clean (whole worktree — the parallel-arc breakage noted
  in CD-2 is resolved at this base) · `npm run lint` 0 errors (remaining
  warnings pre-exist at base, incl. two >400-line legacy analytics files) ·
  `npm run lint:structure` clean · `npm run lint:migrations` clean.
- **Full `npm test` NOT run — per Marcus's standing direction** for this arc
  (repo carries known unrelated failing suites). Coverage claims rest on the
  focused + regression runs above.
- **No migration; no `db:push`; nothing pushed or deployed.**

## Known limitations

- Bar/table/donut, dashboard rename, duplicate-widget, restore-default layout
  → CD-3B. Drill-down / CSV / advanced compare → CD-5.
- Category grouping (e.g. "by status" as rows) is catalog-supported but not
  offerable until a chart that can render it ships (CD-3B bar/table) — the
  Group-by step offers "one number" / "over time" only.
- Valueless bounded category filters (Stripe currency) use typed-chip entry;
  a connection-derived currency option source is a natural CD-4 improvement.
- The internal workflow entity list is supplied from the page's existing
  overview payload (CD-1's documented decision — no registered internal
  options resolver yet); the picker itself is fully generic.
- Line-chart x-axis uses server bucket labels; very long custom ranges thin
  labels rather than scroll.

## Stripe live-certification status

**Unchanged and still BLOCKED** on a connected Stripe test account (dev DB has
0 active Stripe connections — CD-2). Nothing in this slice fabricates
certification; `exposure: "preview"` keeps Stripe out of production UI and
queries until the live pass flips it.

## Files changed

- **Contracts:** `contracts/analytics.ts` (insight type + config, range moved
  up) · `contracts/analyticsCatalog.ts` (exposure, category values) ·
  `contracts/analyticsCatalogDerive.ts` (values passthrough)
- **Services:** `services/analytics/insights/exposure.ts` (new) ·
  `clientProjection.ts` (exposure filter + values) · `runConnectedQuery.ts`
  (exposure gate) · `chainreact.ts` / `stripe/index.ts` (exposure + values
  declarations) · `services/analytics/dashboards.ts` (per-widget salvage)
- **Client plumbing:** `lib/api/analytics.ts` (`queryInsight`) ·
  `app/analytics/page.tsx` (catalog + connection union) · `app/globals.css`
  (8 series tokens, light+dark)
- **Feature (new):** `features/analytics/insights/` — 18 files (catalog
  selectors, reconcile, query-from-config, formatting, error copy, 2 hooks,
  builder + 5 control components, entity picker, preview, panel, widget body,
  KPI, line chart, data table, states)
- **Dashboard integration:** `AnalyticsDashboard.tsx`, `WidgetLibrary.tsx`,
  `dashboardHelpers.tsx`, `WidgetConfigPanel.tsx` (one map entry)
- **Tests:** 9 new suites + 2 extended (paths above)

## Commit / push status

One local commit on `cd3a-insight-builder` (worktree `C:/tmp/cd3a-wt`, base
`7cf122d16`). **Not pushed. No PR. No deploy. No migration. No `db:push`. No
production change. CD-3B not started.**
