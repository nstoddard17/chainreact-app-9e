# ANALYTICS-CONNECTED-DATA-CD-5A — CSV export, date ranges and previous-period comparison

**Status:** implemented locally. Per-chart CSV export, the finished catalog-driven
date-range experience, and previous-period comparison across every compatible chart
type.
**Base branch/commit:** `analytics-stripe-payments-live-cert` @ `e4defc546`
(parent HubSpot blocked-cert `f2bb2b054`; Analytics reconciliation `fb39f3834`).
**Worktree:** `C:/Users/marcu/source/repos/ChainReactV2-wt-cd5a` · **Branch:** `analytics-cd5a-export-time-compare`
**Push/deploy/migration status:** local commits only — no push, no PR, no deploy, no
migration, no `db:push`, no scope change, no provider exposure change, no Docker, no
Playwright, no full repository test suite.

---

## 1. Plain-language result

A non-technical user can now pick a date range in words they recognise ("Last month",
"Year to date"), see exactly which dates the chart covers, compare that period with
the equivalent one before it in a number, line, bar or table, and download the exact
data the chart is showing as a CSV — with the file itself recording whether the data
was complete and how fresh it was.

Two real defects were fixed along the way, both found by auditing rather than assumed:

1. **The end date was silently excluded.** A custom range sent the picked date onto a
   half-open `[from, to)` wire unchanged, so "to July 31" dropped all of July 31 — and
   because the default custom range ended *today*, a freshly-opened custom range showed
   **none of today's data**. The end date is now inclusive, translated once.
2. **Bar charts threw comparison data away.** A time bar chart with comparison enabled
   drew nothing, while its own "View data" table showed a Previous-period column from
   the same result. Bars now render it.

## 2. Existing behavior audited (and deliberately not rebuilt)

Already complete before this slice, and left alone: range presets and custom ranges
existed; the grain selector existed; the compare checkbox existed and was correctly
gated by catalog capability; KPI comparison copy was already neutral and already
handled a zero or missing baseline; line-chart comparison already drew a dashed muted
series with a legend, tooltip and accessible summary; the selectable table already had
a Previous-period column; freshness and completeness were already rendered; the
`[from, to)` UTC engine, its bucketing, and the previous-period scan were already
correct and already tested.

**No backend contract was widened.** Comparison is representable only as `compare`
(a KPI scalar) and `compareSeries` (time-series values index-aligned to the current
buckets), and the server already restricted comparison to a KPI or a single-series
time chart. Everything in Part C fits inside that existing shape.

## 3. Date ranges

| Concern | Behavior |
|---|---|
| Presets | today · yesterday · last 7/30/90 days · this month · last month · year to date · last 12 months |
| Legacy presets | Unchanged in meaning; `InsightRangePresetSchema` is a **superset** of the legacy enum, so every saved Insight keeps parsing |
| Legacy dashboard enum | Deliberately **not** widened — it drives the internal overview path, which has its own resolver |
| Per-dataset filtering | A preset whose widest window exceeds the dataset's `maxRangeDays` is never offered, and is now rejected server-side too |
| Custom range | Start/End date inputs, **both dates included**, single day allowed, backwards and over-long ranges blocked before any query |
| Resolved window | Echoed under the control ("Showing Jul 1, 2026 – Jul 31, 2026 (UTC)") and stated in the accessible chart summary |
| Timezone | UTC throughout, unchanged, and now named in the UI. No timezone guess is ever stored in widget config |

**The inclusive-end translation** lives in exactly one place —
`insightQueryFromConfig` — converting the stored calendar date to the next exclusive
UTC instant. The saved config keeps the date the person picked, which is what makes a
saved widget readable; the wire keeps the boundary the engine needs.

**Behavior change worth naming:** an existing saved widget with a custom range now
includes its end date, where before it excluded it. This is the bug fix, and it will
shift such a widget's numbers by one day's data.

## 4. Time grain

Automatic remains the default and is explained in the UI ("Automatic picks a readable
grouping for the dates you chose"). Only grains that suit the chosen span are offered:
a grain **coarser than the range** (Monthly over a single day) would collapse the chart
into one bucket pretending to describe a month, so it is withheld. An explicit grain
that stops fitting after a range change falls back to Automatic **with an explanation**
rather than silently. The chart and CSV both label from the result's **resolved** grain,
not the requested one. Current-state measures never see a grain selector, because the
whole time step is hidden when a dataset declares no historical date field.

## 5. Previous-period comparison

**Definition** (one canonical implementation, `previousPeriodWindow`): the window
immediately before the current one, the **same duration**, non-overlapping, same UTC
boundaries — exactly what every provider adapter already scans.

> **Divergence from the brief, stated plainly.** The brief's illustration says "July
> 1–July 31 compares with June 1–June 30". Equal-duration shifting gives **May 31 –
> June 30** for a 31-day July, because June has only 30 days. The two requirements
> ("the same duration" and "July → June") cannot both hold. We kept **equal duration**:
> it is what the shipped engine and all four provider aggregators already implement,
> changing it would mean rewriting backend comparison semantics this slice was told not
> to expand, and comparing 31 days of data against 30 would understate the previous
> period by a whole day. Calendar-month comparison is a separate product decision.

| Chart | Comparison |
|---|---|
| **KPI** | Current value + neutral sentence. Zero baseline is *stated* ("Up from zero"), never divided by; a missing side yields no percentage |
| **Line** | Dashed muted previous series, legend entry, tooltip row, accessible summary (pre-existing; unchanged) |
| **Bar** | **New.** Paired previous bar per bucket — muted **and hatched**, so the periods separate without relying on color — plus legend toggle, tooltip row, keyboard announcement, and correct y-scaling |
| **Table** | Previous period column, plus **new** Change and Change % columns |
| **Donut** | **Unavailable by design.** Two periods in one ring would misstate every share, and the contract carries no per-row previous value. Choosing a donut clears comparison with a donut-specific explanation, leaving grouping and filters intact |

Bar and table comparison appear only for the single-series **time** shape the contract
can actually carry a previous value for. A categorical bar or table is never given an
invented comparison, and the table omits Change columns for multi-series results rather
than computing a misleading change against the first series.

Both the current and the comparison window are now displayed — the result has always
carried them and nothing ever showed them.

**Neutrality is deliberate and test-locked:** no green/red, no "good"/"better"/"worse".
More failed runs is not good; less spend is not bad. An increase is an increase.

## 6. CSV export

**Shape.** One long-form table with a stable column order:
`source, dataset, measure, range_start, range_end, resolved_grain, dimension, category,
series, period, bucket_start, bucket_end, value, value_label, unit, currency, freshness,
updated_at, completeness, warning`. A KPI is one row; a time series is one row per
bucket per series; a categorical result is one row per category. Query metadata repeats
on every row so each row is independently interpretable.

**Values are machine-usable.** Counts are numbers; currency is a numeric major-unit
amount beside its ISO code; a percent is the decimal fraction it is stored as (`0.42`);
durations export their canonical numeric value plus the unit; dates and the export
timestamp are ISO. **Null is an empty cell, zero is `0`** — the distinction survives.
The human-formatted string is offered *alongside* in `value_label`, never instead.

**Comparison rows** get their own rows tagged `period = current | previous`, with the
previous row carrying the previous window in its range columns. Nothing is flattened
into an ambiguous duplicate row; consumers compute their own deltas.

**Injection safety.** Text cells beginning `=`, `+`, `-`, `@`, tab or CR are prefixed
with an apostrophe. Routing is by **declared column type**, not by inspecting strings,
so a legitimate negative number (`-12.5`) stays a number — blanket-prefixing would have
corrupted real data. RFC-4180 quoting handles commas, quotes, newlines and unicode.

**Authorization and exposure.** The only input is the bounded aggregate the server
already returned to an authorized browser. Export issues **no request**, so it cannot
re-query a provider, spend the rate limiter, mutate the snapshot cache, widen a scan,
or reveal a field the chart was not already showing — pinned by a test asserting the
query count does not change on click. Category **ids** are deliberately not exported;
only display labels are. There is no column that could hold an account, user,
integration, token, cursor, scope or cache identifier, and no new endpoint was added.

**Partial and stale data.** Export is never blocked for being incomplete or cached; the
condition travels *in the file* (`completeness`, `freshness`, `warning` columns, with
structured values like `scan_capped`), and the success message says so
("This data is partial or cached — the file records that."). The filename never implies
completeness.

**Filenames** are built only from source/dataset labels, the widget title and the date:
`acme-orders-monthly-orders-2026-07-25.csv` — lowercase, filesystem-safe, length-bounded,
never an account or provider record id.

**Placement.** A header action on saved Insight widgets, outside edit mode, available to
read-only members — matching the precedent that the dashboard's own Export button is not
role-gated. It appears only once the widget actually has data.

**Distinct from the dashboard JSON export**, which is unchanged: that saves the
dashboard's *configuration*; this saves one widget's *data*.

## 7. Accessibility

Preset chips are a labelled `fieldset` with `aria-pressed`; date inputs carry
`aria-describedby` and `aria-invalid`, with the range error in an `alert`; the export
action has an accessible name including the widget title; the export outcome is
announced through an `aria-live="polite"` status region (no `alert()`, no silent
failure); comparison is distinguishable by pattern and text label, not color alone; and
both comparison values appear in the accessible data table.

## 8. Persistence and compatibility

No export state is persisted — no last-export time, filename, download status, hidden
legend state or generated rows. Legend visibility remains local presentation state, and
**the CSV exports the full returned result regardless of hidden series**, because the
saved insight is the business question. Date and comparison config stay strict and
backward-compatible. No provider behavior, scope, limit, TTL or scan cap changed; no
provider HTTP call is made beyond the widget's normal query.

## 9. Tests and verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | **0 errors, 27 warnings — identical to the `e4defc546` baseline** |
| `npm run lint:structure` | 1 pre-existing violation (`docs/slices/phase-5` root at 51 files); this doc went under `analytics/` |
| `npm run lint:migrations` | OK — no migration added |
| Focused: `tests/unit/features/analytics/`, `tests/unit/services/analytics/`, `tests/unit/core/analytics/`, `tests/unit/contracts/`, `tests/unit/app/api/analytics` | **129 suites / 1,949 tests passed** |

New tests (99): `tests/unit/core/analytics/insightRange.test.ts` (30),
`tests/unit/core/analytics/insightCsv.test.ts` (39),
`tests/unit/features/analytics/insights/insightCompareCd5a.test.tsx` (20),
`tests/unit/features/analytics/insights/insightTimeControlsCd5a.test.tsx` (30) — minus
overlap, totalling 119 across the four files. All prior Analytics, contracts, chart,
dashboard, QuickBooks, Shopify, Stripe, CD-1/2/3A/3B and CS-1 suites remain green.

**Verification boundaries — stated explicitly:** Docker was not used; Playwright was not
run; the full repository test suite (`npm test` with no path) was not run; only the
directly targeted focused suites above were run. The structure baseline remains
unchanged from `e4defc546`.

## 10. Known limitations

- Comparison remains **previous period only** — no previous-year, custom baseline,
  forecast or goal comparison (each is a separate product decision).
- Comparison stays unavailable for multi-series, categorical and donut shapes, because
  the result contract carries no previous value for them.
- `compareSeries` is aligned by **relative bucket position**, so an uneven previous
  month pairs bucket-to-bucket rather than date-to-date. This is the approved behavior
  (position, not pretending previous dates are current dates), and the previous window
  is now displayed so the dates are never implied.
- Equal-duration previous period, as discussed in §5.
- Grain remains auto/day/week/month; no quarterly or yearly grain (unsupported server-side).
- The a11y table still labels categorical rows under a "Period" header (pre-existing
  cosmetic wart, untouched).

## 11. CD-5B boundary (not started)

Drill-down is untouched: no query-refinement drill-in, no navigation to matching runs,
no provider record drill-through, no drill-down tokens, no record-level projection, no
"save explored segment". No record-level provider data was added anywhere in CD-5A.

## 12. Remaining Analytics blockers

- **Stripe → Payments** stays `preview`: no connected Stripe test account exists
  (`analytics-stripe-payments-live-cert-blocked.md`).
- **HubSpot → Deals** absent: the connected portal has 2 deals and 0 usable amounts
  (`analytics-connected-data-cd4d-hubspot-deals-blocked.md`).
- **Motive → Fuel purchases** absent: CD-4A blocked on fuel history, unmerged branch.
- Browser-certification debt for CD-3B remains.

## 13. Files and commits

Local commits on `analytics-cd5a-export-time-compare`:

1. `cf7d11c34` — date-range experience (`core/analytics/insightRange.ts`, contracts,
   `insightQueryTime`, `validateQuery`, `reconcileInsightConfig`,
   `insightQueryFromConfig`, `InsightTimeControls`).
2. `d65a6da6a` — comparison (`insightCompare.ts`, `InsightBarChart`,
   `InsightTableChart`, `InsightKpi`, `InsightResult`, donut reconciliation).
3. `91e80fa1e` — CSV export (`core/analytics/insightCsv.ts`, `exportInsightCsv.ts`,
   `Widget`, `AnalyticsDashboard`, `InsightWidgetBody`).
4. `4f4add6b3` — the four new test suites.
5. This outcome document.

No migration, no `db:push`, no push, no PR, no deployment, no scope change, no Stripe /
HubSpot / Motive exposure change, and no production change.
