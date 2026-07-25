# ANALYTICS-CONNECTED-DATA-CD-3B — Bar / table / donut + dashboard customization (outcome)

**Type:** Implementation — additional chart types + dashboard-management
polish. No migration; no `db:push`; no Docker; no Playwright; nothing
pushed/deployed; Stripe still non-public. **Date:** 2026-07-25
**Worktree:** `C:/tmp/cd3b-wt` · **Branch:** `cd3b-charts-dashboard-polish`
**Base:** `ec428c652` (CD-3A integration `d753d32bd` + certification doc)
**Plan:** [analytics-connected-data-audit-1.md](./analytics-connected-data-audit-1.md) ·
builds on [CD-3A](./analytics-connected-data-cd3a-outcome.md) +
[CD-3A cert](./analytics-connected-data-cd3a-integration-cert-1.md)

## Plain-language result

Custom Insights now cover the full launch set of visualizations — **Number,
line, bar, table, and (only where the data honestly adds up) donut** — all
built through the same App → Data → Show → Group by → Only include → Series →
Time → Chart flow, from the same catalog, with the same query route, freshness,
completeness, and error handling. Alongside them, owners/admins can **rename a
dashboard, duplicate a widget, and restore the default layout** through real
dialogs instead of browser prompts.

The headline capability change is that **category groupings are now offerable
at all**: CD-3A deliberately hid them because no shipped chart could draw a
category breakdown. With bar and table shipping, "By status", "By workflow",
"By trigger source" (and any future provider dimension) appear automatically —
no per-provider code.

## Supported chart types

| Chart | Offered when | Notes |
|---|---|---|
| **Number (KPI)** | ungrouped, dataset declares `kpi` | unchanged from CD-3A |
| **Line** | grouped over time, dataset declares `line` | unchanged from CD-3A |
| **Bar** | over time **or** by category, dataset declares `bar` | new |
| **Table** | any shape, dataset declares `table` | new, user-selectable |
| **Donut** | by category **and** that dimension is in `partToWholeDimensions` | new, gated |

Everything comes from `chartChoices(dataset, measure, dimension)` — a pure
function over the client catalog projection. There is no measure-name or
provider allow-list anywhere in React; the same fictional `acme` fixture
catalog drives all five types in tests.

## Bar behavior

One component renders both result shapes: categorical results become one bar
per row (in the server's order — the chart never re-sorts), time-series
results become grouped bars per bucket with up to 8 series in the **same fixed
palette slots the line chart uses**, so switching chart type never repaints a
series. Orientation is automatic: horizontal when labels are long (>14 chars),
numerous (>6 categories), or the widget is narrow (<380px), vertical
otherwise — that rule is what keeps category names readable instead of
truncated at 320px, and it is unit-tested directly (`preferHorizontal`).
Single-series vertical bars carry a direct value label; grouped bars rely on
the tooltip, keyboard announcements, and the accessible table (never
hover-only). `null` draws no bar and reports "—"; zero draws a minimum-height
stub so it reads as a real zero. One measure, one axis, no mixed units or
currencies.

## Selectable table behavior

A real chart type, distinct from the accessibility table attached to graphical
charts. Semantic `<table>` with `<caption>`, `scope="col"`/`scope="row"`
headers, a sticky header row and a **local** `overflow-auto` scroller (so a
wide table never widens the dashboard page). Renders KPI results as one
labeled row, time-series as bucket rows × series columns (+ a previous-period
column when compare is on), and categorical as group rows with the measure,
optional record counts, and the server's total. Only server-provided labels
appear — row ids, raw field names, and provider payload never do (tested).
Row counts stay bounded by the query's `limit` and the dataset's
`maxCategoryRows`; there is no client-side pagination and no export. The
sorted measure column carries `aria-sort`; sorting itself is part of the saved
question (below), not a click-to-resort interaction that would silently
rewrite the query.

## Donut eligibility rules

Donut is the most abusable chart, so it carries the most guardrails:

1. **Catalog gate** — the dataset must declare `donut` **and** list the chosen
   dimension in `partToWholeDimensions`. ChainReact declares `status` (runs are
   exactly succeeded|failed — mutually exclusive and exhaustive); Stripe
   declares `status` (succeeded|pending|failed). Workflow / trigger source /
   currency are deliberately **not** listed — Top-N rows omit an unlabeled
   remainder, and a count-by-currency donut invites reading it as a money split.
2. **Server gate** — `validateQuery.ts` re-checks part-to-whole on every query;
   a crafted donut request on `workflow` is rejected `INVALID_QUERY` (tested).
3. **Denominator gate** — percentages render **only** when
   `completeness.state === "complete"` and no rows were trimmed. Otherwise the
   slices still draw (partial data stays visible, per CD-3A) but shares are
   suppressed and a plain-language warning explains why.
4. **No invented remainder** — an `Other` slice is never synthesized. Beyond 8
   slices the donut shows the 8 largest and says so, without percentages.
5. Identity is never color-only: every slice is a text row with label + value.

## Catalog capability changes

- `supportedCharts` gained `donut` and `partToWholeDimensions` gained
  `["status"]` on both `chainreact.workflow_runs` and `stripe.payments` —
  honest declarations of existing data, not new backend behavior. The registry
  already validated "donut requires part-to-whole", so the two move together.
- No new client-projection fields were needed: `charts` and
  `partToWholeDimensions` were already projected in CD-1.
- `InsightWidgetConfig` gained `sort` (`by: value|label`, `dir: asc|desc`) and
  `limit`, mirroring the connected query contract — the server already
  validated both as categorical-only.
- `DEFAULT_OVERVIEW_WIDGETS` moved from `services/analytics/dashboards.ts` to
  **`contracts/analyticsDefaults.ts`** (pure data) so restore-default can use
  the canonical definitions client-side; the service re-exports it, so every
  existing server import is unchanged.

## Reconciliation behavior

`reconcileInsightDraft` now handles chart-type transitions and ordering. Each
transition preserves everything still valid and clears only what genuinely
broke, with an explanation rendered beside the affected step:

- **Line → Bar / Bar → Table** (same shape): nothing is cleared at all.
- **Line → Number**: time-only config (grain, series) clears with notes;
  filters and range survive.
- **Bar/Table → Donut**: allowed only on a declared part-to-whole; sorting is
  dropped (a whole isn't re-ordered).
- **Donut on a non-part-to-whole grouping**: cleared with the specific reason
  ("needs a breakdown whose parts add up to a meaningful whole").
- **Donut → Line**: measure and filters survive; category-only ordering clears
  with a note.
- **Measure change that invalidates the category**: grouping and chart clear
  together.

One deliberate refinement: when the previous chart no longer fits, the builder
fills the **natural display for the new shape** (kpi ungrouped, line over time,
bar by category) instead of leaving the chart unset. The grouping is the
business question; how it's drawn is a display default — so this preserves
CD-3A's guided feel (the certification praised the instant-preview flow)
without silently changing what is being asked. Every clear still renders its
explanation.

## Dashboard rename

Owner/admin only, in the dashboard tab bar. Opens a real dialog with the
current name prefilled, trims whitespace, disables save on empty, enforces the
contract's 80-character cap client-side, and saves through the **existing**
`PATCH /api/analytics/dashboards/[id]` (`{ name }` only). Pending state on the
button, API errors surface as an inline `role="alert"` with the dialog kept
open, cancel/Escape change nothing, and the new name appears immediately and
persists on reload. Members see no rename action; the server route remains the
real authority.

## Duplicate widget

An owner/admin-only control in each widget's edit-mode chrome. The pure
`duplicateWidgetAt` helper mints a fresh id, deep-copies the config, copies
size/type/icon, titles the copy `"<original> copy"`, and inserts it
**immediately after** its source. Runtime state (results, freshness, errors,
loading, legend visibility) lives in hooks and component state, so it cannot
ride along — asserted by a no-leak test. A widget whose stored config no
longer parses is **refused** rather than cloned, and the 48-widget dashboard
cap is enforced with a friendly message. Persistence rides the existing atomic
"Done editing" PATCH — no new model. Duplicating a preview-source insight
grants nothing: both the original and the copy render the ordinary "settings
need an update" state when the source isn't in the environment's catalog
(tested).

## Restore default layout

Offered on the **default** dashboard only, owner/admin only. Confirmation
dialog states plainly that the board's widgets will be replaced and that other
dashboards and account data are unaffected. On confirm it writes the **current
canonical** `DEFAULT_OVERVIEW_WIDGETS` through the same atomic PATCH — never
an obsolete stored snapshot. Cancel/Escape leave everything untouched; API
errors surface inline with the dialog open. Non-default dashboards simply
don't offer the action (no template infrastructure was invented).

`window.prompt` is gone from the Analytics dashboard flows: create and rename
both use the same name dialog. The delete flow's `window.confirm` was left
alone — out of this batch's scope and unchanged in behavior (noted as a
follow-up).

## Accessibility

- **Bar**: focusable chart region with arrow/Home/End navigation, a polite
  live region announcing "<category>: <series> <value>", a tooltip that
  mirrors it, `aria-pressed` legend buttons, and the shared "View data" table.
- **Table**: semantic markup, `sr-only` caption, correct header scopes,
  `aria-sort` on the sorted column, logical reading order, no pointer-only
  interaction.
- **Donut**: labeled `role="group"` with arrow-key slice traversal, an
  `aria-label`ed SVG, and a text list carrying every label, value and share —
  nothing depends on color or hover.
- **Dialogs**: `role="dialog" aria-modal` with an accessible name, initial
  focus on the primary control, **focus returned to the invoker on close**,
  Escape to dismiss, inline `role="alert"` errors, and a `destructive` variant
  for the restore action.
- Motion: bar fills carry `motion-reduce:transition-none`; nothing animates on
  its own.

## Responsive behavior

Certified deterministically (no browser required this batch): the orientation
rule is unit-tested at desktop/laptop/tablet/390px/320px-equivalent inputs and
the chosen orientation is asserted from the DOM; the table's local scroller is
asserted; bar labels truncate with a `title` fallback rather than overflowing;
donut labels live in a wrapping text list, not on the arc; chart chips and
dashboard action buttons wrap (`flex-wrap`). No touched component introduces
page-level horizontal overflow.

## Existing Analytics compatibility

Untouched and green: Overview widgets, CD-3A KPI and line, the CD-3A
accessibility table, existing fixed connected metrics, existing Stripe
widgets, dashboard roles, create/switch/delete, JSON export, the range
selector, catalog exposure (Stripe still `preview`), cache, coalescing, the
provider limiter, CS-1/CD-1/CD-2, and malformed-widget salvage. No widget was
migrated. Two CD-3A test expectations were intentionally updated because the
capability they asserted changed: "donut is unsupported" became "donut is
rejected on a non-part-to-whole dimension" (server) and the registry guard now
clears the declaration before exercising itself.

## Tests

**New — 65 tests in 3 suites:**

- [insightChartsCd3b.test.tsx](../../../../tests/unit/features/analytics/insights/insightChartsCd3b.test.tsx)
  (25) — bar (single/multi-series, count/percent/currency, null vs zero,
  server order, 8-series legend toggle, keyboard + tooltip, orientation matrix),
  selectable table (categorical/time/KPI, headers, units, null vs zero, empty,
  no-id leak, local scroller), donut (slices, shares, suppressed percentages
  when incomplete, no invented `Other`, keyboard, empty), and `InsightResult`
  dispatch (persisted intent, shared "View data", no redundant toggle on the
  table, freshness/completeness parity).
- [insightChartReconcile.test.ts](../../../../tests/unit/features/analytics/insights/insightChartReconcile.test.ts)
  (18) — catalog-derived availability incl. the donut gate and a dataset that
  doesn't declare donut, every chart transition, sort survival/clearing, no
  silent substitution, locally-invalid pairs never sent, CD-3B config
  round-trip.
- [dashboardActions.test.tsx](../../../../tests/unit/features/analytics/dashboardActions.test.tsx)
  (22) — rename (prefill, trim, empty rejection, 80-cap, cancel, Escape, API
  error, member-hidden, create-without-prompt), duplicate (new id, config
  copy, deep copy, no runtime state, placement, malformed refusal, cap,
  unknown id, dashboard flow + atomic save, member-hidden, preview-exposure
  not bypassed), restore-default (confirm copy, canonical widgets, cancel,
  default-only, member-hidden, API error).

Updated: the CD-3A contract test now asserts all five chart types parse plus
`sort`/`limit` bounds; the reconciliation fixture gained `sort`; the two
capability tests noted above; the fixture catalog gained a part-to-whole
dataset and a `categoricalResult` builder.

## Verification (exact commands run)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run lint` | **0 errors** (27 warnings, all pre-existing at the base) |
| `npm run lint:structure` | fails **only** on the known `docs/slices/phase-5` 51-file baseline |
| `npm run lint:migrations` | **clean** |
| focused + regression: `tests/unit/features/analytics`, `tests/unit/services/analytics`, `tests/unit/app/api/analytics`, `tests/unit/contracts` | **116 suites / 1,562 tests passed** |

That regression scope covers CD-3B, CD-3A direct suites, dashboard lifecycle,
widget contracts, catalog exposure, connected query construction, KPI/line,
existing connected + Stripe widgets, cache/coalescing/limiter, CS-1, CD-1,
CD-2, and dashboard permissions.

**Boundaries honored:** Docker was **not** used and no Supabase stack was
started or recovered. Playwright was **not** run. The full repository
`npm test` was **not** run, under owner direction. CD-3B adds documents only
beneath `docs/slices/phase-5/analytics/`; touched source directories remain
structurally valid (`features/analytics` 22 files, `features/analytics/insights`
23 files — both well under the 50-file cap).

## CD-3A browser-certification debt (unchanged)

Playwright scenarios **2–9** in
[analytics-insight-cd3a-cert.spec.ts](../../../../tests/e2e/analytics-insight-cd3a-cert.spec.ts)
remain **environment-blocked** and are **not** claimed as passed. The spec is
preserved untouched. Scenario 1 (the core creation journey) previously passed
in a real browser. CD-3B's additions are covered deterministically only; they
have never been exercised in a browser.

## Known limitations

- The saved table's ordering is a builder choice, not a click-to-sort
  interaction (clicking headers would silently rewrite the saved query).
- Donut caps at 8 slices; beyond that it shows the largest 8 without shares
  rather than inventing a remainder.
- Bar orientation is automatic with no manual override.
- The dashboard delete flow still uses `window.confirm` (out of scope).
- Categorical grouping by a high-cardinality entity relies on the dataset's
  `maxCategoryRows`; there is no "show more".

## CD-4 / CD-5 boundaries

CD-4: additional provider datasets, currency option sources, live Stripe
certification. CD-5: drill-down, CSV export, advanced range/compare. Neither
was started.

## Files changed

- **Contracts:** `contracts/analytics.ts` (chart enum, sort/limit) ·
  **new** `contracts/analyticsDefaults.ts`
- **Services:** `services/analytics/dashboards.ts` (re-export) ·
  `insights/chainreact.ts`, `insights/stripe/index.ts` (donut + part-to-whole)
- **Insights feature:** `insightCatalog.ts`, `reconcileInsightConfig.ts`,
  `insightQueryFromConfig.ts`, `InsightResult.tsx`, `InsightBuilder.tsx`,
  `InsightPreview.tsx`, `InsightConfigPanel.tsx`, `InsightWidgetBody.tsx` ·
  **new** `InsightBarChart.tsx`, `InsightTableChart.tsx`, `InsightDonutChart.tsx`
- **Dashboard:** `AnalyticsDashboard.tsx`, `Widget.tsx`, `dashboardHelpers.tsx`
  · **new** `DashboardDialogs.tsx`
- **Tests:** 3 new suites + 4 updated (paths above)

## Commits / status

Local commits on `cd3b-charts-dashboard-polish` (worktree `C:/tmp/cd3b-wt`,
base `ec428c652`). **Nothing pushed. No PR. No deploy. No migration. No
`db:push`. No Docker. No Playwright. Stripe not exposed. CD-4/CD-5 not
started.**
