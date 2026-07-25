# ANALYTICS-FLEXIBILITY-AUDIT-1 — Flexible Analytics: Audit + Redesign Plan

**Type:** Audit / planning only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed, deployed, or migrated.**
**Date:** 2026-07-24
**Branch:** `v2-main` (local)

**Doc location note:** the prior Analytics arc docs live in
[`docs/slices/phase-4/analytics/`](../../phase-4/analytics/) (ANALYTICS-1 closeout +
observability decision). Current planning work lands in `docs/slices/phase-5/`
alongside the other active phase-5 plans, so this doc lives here and links back to
the phase-4 analytics docs as parents.

**Source of truth (verified current state):**
[analyticsOverview.ts](../../../../services/analytics/analyticsOverview.ts) (internal metric engine) ·
[data/route.ts](../../../../app/api/analytics/data/route.ts) + [_shared.ts](../../../../app/api/analytics/_shared.ts) (overview route + gates) ·
[dashboards.ts](../../../../services/analytics/dashboards.ts) + [repositories/analyticsDashboards.ts](../../../../repositories/analyticsDashboards.ts) (dashboard CRUD) ·
[contracts/analytics.ts](../../../../contracts/analytics.ts) (widget/range/overview contracts) ·
[AnalyticsDashboard.tsx](../../../../features/analytics/AnalyticsDashboard.tsx) · [WidgetConfigPanel.tsx](../../../../features/analytics/WidgetConfigPanel.tsx) · [widgetBodies.tsx](../../../../features/analytics/widgetBodies.tsx) · [charts.tsx](../../../../components/analytics/charts.tsx) (UI) ·
[querySource.ts](../../../../services/analytics/sources/querySource.ts) + [registry.ts](../../../../services/analytics/sources/registry.ts) + [cache.ts](../../../../services/analytics/sources/cache.ts) (connected-app sources) ·
[repositories/workflowRuns.ts](../../../../repositories/workflowRuns.ts) (`listForAnalytics`) ·
[20260507000001_workflow_runs.sql](../../../../supabase/migrations/20260507000001_workflow_runs.sql) + successors (run schema) ·
[engineTypes.ts](../../../../services/execution/engineTypes.ts) (`RunTriggerSource`, `RunFailureCode`) ·
[analytics-closeout.md](../../phase-4/analytics/analytics-closeout.md) · [analytics-observability-product-decision.md](../../phase-4/analytics/analytics-observability-product-decision.md) (prior decisions)

---

## 1. Executive summary

The Analytics page is **not** a static hardcoded page — ANALYTICS-1 already shipped a
real account-scoped widget dashboard (8 widget types, 10 internal metrics, 5 range
presets, multiple dashboards, add/remove/resize/reorder, role-gated authoring, a
connected-app source registry with ~25 providers). The stiffness Marcus feels comes
from **what a widget is allowed to say**, not from the dashboard shell:

1. **One metric, one hardcoded series.** Only `stat` and `bar` widgets offer any
   metric choice; the line chart always renders exactly [Successful, Failed]
   account-wide; a widget can bind to *one* workflow or *all*, never a chosen set.
2. **No user control of grouping, granularity, or comparison.** Bucketing is fixed
   daily/UTC (weekly only when the server decides), the previous-period trend is
   computed but not user-controllable, and there is no compare UI.
3. **No drill-down.** Widgets are display-only; no click-through to the runs behind
   a point.
4. **The data engine can't support flexibility.** The server fetches up to 5,000 raw
   run rows and reduces them in JS per request — fine for today's fixed overview,
   wrong for arbitrary filters/series/grains and for accounts beyond 5,000 runs per
   window (silent undercount).

The recommended direction is a **two-layer model**: keep the opinionated Overview
dashboard as-is (Layer A), and add a **typed, server-owned analytics query contract**
(`measure / show-over / filter / series / range / grain / display / compare`) that
powers a new "Insight" widget type (Layer B) — plain-language chart building with
exact-workflow multi-select series, SQL-side aggregation, bounded results, and
drill-down links. No SQL, no JSON, no new dashboard shell, no Power BI.

The first implementation slice (CS-1/CS-2) is deliberately small: the query
contract + SQL aggregation service, then one new widget type that uses it with
workflow multi-select line/bar/KPI/table. Everything else (custom ranges, compare
UI, task-usage measure, error dimension, rollup tables) stacks on top in order.

---

## 2. Context & prior decisions

- **ANALYTICS-1** built the current page ([closeout](../../phase-4/analytics/analytics-closeout.md)):
  backend engine `c76f5499e`, UI `9505eb2ee`. ANALYTICS-SOURCES-1/-GITHUB-1/-CACHE-1
  added the connected-app source registry, GitHub adapter, snapshot cache, and UI
  exposure.
- **Observability decision (2026-06-26, durable):**
  [analytics-observability-product-decision.md](../../phase-4/analytics/analytics-observability-product-decision.md)
  bars customer-facing "Workflow Health" widgets (`runs_by_status`, `p95_duration`,
  `failures_by_workflow`, reconnect counts, provider-wide failure rates). **Tension:**
  this brief's examples ("Which workflows fail most often?", "Which providers are
  producing the most errors?") overlap that ban. This doc treats the brief as
  *provisionally reopening user-scoped failure analysis* (a user asking about their
  own workflows' failures is a business question, not an SRE console), but ships it
  as an explicitly flagged product-owner decision (§25 D9) rather than assuming it.
  Provider-**wide** (cross-account) failure rates remain out of scope regardless.
- **Task billing:** live billing is still flat 1-task-per-run pre-deduct;
  reserve/reconcile columns exist on the run row as foundation
  ([20260525000002](../../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql) header notes).
  This constrains how honestly "tasks used" can be charted today (§7).

---

## 3. Current user experience (verified)

A user lands on `/analytics` ([page.tsx](../../../../app/analytics/page.tsx)) and gets a
server-seeded default "Overview" dashboard (11 widgets,
[dashboards.ts:25-47](../../../../services/analytics/dashboards.ts)). They can:

- Switch a **global range**: Today / 7 days / 30 days / 90 days / Year — 5 presets,
  no custom range ([dashboardHelpers.tsx:42-48](../../../../features/analytics/dashboardHelpers.tsx)).
- Create/switch/delete **multiple dashboards** (tab bar,
  [AnalyticsDashboard.tsx:311-359](../../../../features/analytics/AnalyticsDashboard.tsx));
  the default board can't be deleted; boards cap at 48 widgets
  ([contracts/analytics.ts:141](../../../../contracts/analytics.ts)).
- In **edit mode** (owner/admin only): add one of 8 widget types, remove, drag-reorder
  (HTML5 DnD, no touch), resize via a size `<select>` (6 fixed footprints,
  [Widget.tsx:13-29](../../../../features/analytics/Widget.tsx)), rename widgets inline,
  save atomically ("Done editing" → one PATCH).
- Configure a widget: metric (only `stat`: 4 choices, `bar`: 2 — every other type is
  single-metric, [WidgetConfigPanel.tsx:41-58](../../../../features/analytics/WidgetConfigPanel.tsx));
  workflow binding **"All workflows" or exactly one** (scalar metrics only,
  [WidgetConfigPanel.tsx:60-64,436-454](../../../../features/analytics/WidgetConfigPanel.tsx));
  or switch the data source to a connected app (stat/line/bar only).
- **Refresh** (manual), **Export** (client JSON, excludes connected-app data,
  [dashboardHelpers.tsx:19-40](../../../../features/analytics/dashboardHelpers.tsx)).

They cannot: select several workflows, choose what becomes a series, change
granularity, compare periods, filter (status/source/test), click into runs, or
rename a dashboard (API exists — [contracts/analytics.ts:170](../../../../contracts/analytics.ts),
[lib/api/analytics.ts:80](../../../../lib/api/analytics.ts) — but no UI control calls it;
creation uses `window.prompt`).

Members (non-owner/admin) get a clean read-only view (`canManage` computed
server-side, [page.tsx:83,90](../../../../app/analytics/page.tsx)); route enforcement is
authoritative regardless (§8).

---

## 4. Current architecture & full data path

### Internal (workflow) analytics — one shared payload

```
GET /api/analytics/data?range=7d
  → requireAccount()                         app/api/analytics/_shared.ts:42-69
      auth.getUser() → 401
      resolveActiveAccount(user.id)          services/accounts/activeAccount.ts:105
        (stored active-account pointer, membership + freeze re-verified;
         NO accountId accepted from the request)
  → getAnalyticsOverview(accountId, range)   services/analytics/analyticsOverview.ts:311-341
      Promise.all:
        workflowRunsRepo.listForAnalytics    repositories/workflowRuns.ts:543-585
          service-role; SELECT id,workflow_id,status,started_at,finished_at,is_test
          WHERE account_id = X AND status NOT IN (running,queued)
            AND started_at >= fetchSince
          ORDER BY started_at DESC LIMIT 5000 (hard cap 20000)
        workflowsRepo.listByAccount          repositories/workflows.ts:177-189  (RLS; SELECT *)
        integrationsRepo.listActiveByAccount repositories/integrations.ts:515-527 (service-role; SELECT *)
  → buildAnalyticsOverview (pure, JS in-memory reduce)  analyticsOverview.ts:268-303
  → { overview }  — bucketed series, totals, prev totals, heatmap, recent runs, apps
```

- **All aggregation is JS in-memory over raw rows.** No SQL GROUP BY anywhere in
  this path. Every range change re-fetches and re-reduces.
- The fetch window is always `min(prevSince, heatmapStart)` — enough history for the
  previous-period trend *and* the 16-week heatmap regardless of selected range
  ([analyticsOverview.ts:107-111](../../../../services/analytics/analyticsOverview.ts)).
- One payload is fetched per range and **shared by every internal widget**
  ([AnalyticsDashboard.tsx:97-121,413](../../../../features/analytics/AnalyticsDashboard.tsx));
  the client never aggregates runs, only maps arrays to chart props.
- `truncated: runs.length >= 5000` ([analyticsOverview.ts:339](../../../../services/analytics/analyticsOverview.ts))
  is delivered in the contract but **never rendered anywhere in the UI** — an
  over-cap account silently under-counts. Also a `>=` false-positive at exactly
  5,000 rows.

### Connected-app analytics — per-widget fetch

`GET /api/analytics/sources/[provider]/data` → `requireAccount()` → allow-listed
filter params (25 fixed keys, [route.ts:57](../../../../app/api/analytics/sources/%5Bprovider%5D/data/route.ts)) →
`queryAnalyticsSource` (registry+metric validation *before* I/O,
[querySource.ts:50-108](../../../../services/analytics/sources/querySource.ts)) →
TTL snapshot cache with personal-credential isolation baked into the cache key
([cache.ts:114-230](../../../../services/analytics/sources/cache.ts)) → typed errors map
to HTTP 200 `{ok:false,code,message}` safe widget states. Each `connected_app`
widget fetches independently (N widgets = N requests,
[ConnectedAppWidgetBody.tsx:81-108](../../../../features/analytics/ConnectedAppWidgetBody.tsx)).
25 provider adapters are registered and exposed (~110 metric options). This layer
matches its closeout description and is **worth preserving as-is**; the stale
"NOT exposed in the UI yet" comment at
[contracts/analytics.ts:76-77](../../../../contracts/analytics.ts) should be fixed.

### Charts

All custom inline SVG, no chart library
([charts.tsx](../../../../components/analytics/charts.tsx)): `MetricNumber`,
`Sparkline`, `LineChart` (already accepts `series: LineSeries[]` — N-series capable,
:104-118), `BarChart`, `DonutChart`, `Heatmap`. Blockers for a series model: only 3
rotating `SERIES_COLORS` (:25), `preserveAspectRatio="none"` distortion (:144), no
tooltips/legend interactivity/axis config.

### Adjacent services (not user-facing)

`services/analytics/taskUsageStats.ts`, `ownerAiStats.ts`, `aiAnalyticsReport.ts`
are owner/admin observability folds. Their headers state the access model is
**documented but not yet enforced** — the cross-user service-role readers have no
admin gate in V2 yet. Not part of this redesign, but flagged (§8, §24).

---

## 5. Current metric & visualization inventory

Range presets: `today | 7d | 30d | 90d | ytd`
([AnalyticsRangeSchema](../../../../contracts/analytics.ts)). All internal metrics:
account-scoped to the session's active account; **test runs excluded**
(`is_test`, [analyticsOverview.ts:271-272](../../../../services/analytics/analyticsOverview.ts));
`running`/`queued` excluded at SQL; retries are just normal runs
(`triggered_by='retry'`, not surfaced); server-calculated; per-widget
customization = title/size/(sometimes metric)/(sometimes one-workflow binding).

| Widget (type → metric) | Question answered | Source data | Calculation | Date field | Customizable |
|---|---|---|---|---|---|
| Stat → `runs` | How many runs? | `workflow_runs` (capped window) | count of in-range real runs; trend vs equal previous window | `started_at` | metric ✓, 1-workflow bind ✓ |
| Stat → `success_rate` | How often do runs succeed? | same | `succeeded / total` (total = succeeded+failed; only 2 terminal statuses exist) | `started_at` | metric ✓, bind ✓ |
| Stat → `active_workflows` | How many automations are on? | `workflows` | count `state='active'` (not run-derived) | n/a | metric ✓ |
| Stat → `avg_duration` | How long do runs take? | `workflow_runs` | mean of `finished_at−started_at` (clamped ≥0; unfinished rows skipped; **failed runs included**) | `started_at` | metric ✓, bind ✓ |
| Line → `runs_over_time` | Trend of success vs failure | same | UTC daily buckets (weekly iff span >92 days), pre-seeded contiguous, series hardcoded [Successful, Failed] | `started_at` | none |
| Donut → `outcomes` | Outcome split | same | client-derived from `totals.succeeded/failed` | `started_at` | none |
| Bar → `top_workflows` / `by_app` | Which workflows run most / which apps connected | runs grouped by `workflow_id` / active `integrations` by provider | rank by run count desc / **connection count, NOT per-run app attribution** (honestly labeled) | `started_at` / n/a | metric ✓ (2) |
| Table → `top_workflows` | Per-workflow numbers | same grouping | runs/succeeded/successRate/avgDuration per workflow | `started_at` | none |
| Heatmap → `by_time` | When do runs happen? | all fetched real runs | 16 weeks × 7 UTC days, **ignores selected range** | `started_at` | none |
| Activity → `events` | What ran recently? | first 8 in-range runs | newest-first feed | `started_at` | none |
| Note | free text | — | — | — | text ✓ |

Declared-but-unbacked metrics (deliberately not offered): `time_saved`, `by_owner`,
`errors` ([contracts/analytics.ts:43-45](../../../../contracts/analytics.ts)).

**Ambiguity check on "meaningful numbers" (§6 confirmed definitions):**

- **"Success rate"** — `succeeded/(succeeded+failed)`, honest, because V2's terminal
  status domain is exactly `succeeded|failed` (no canceled state;
  [workflowRuns.ts:29](../../../../repositories/workflowRuns.ts)). "Failed" therefore
  means "every non-succeeded terminal run".
- **"Avg run time"** — includes failed runs (any row with `finished_at`); excludes
  never-finished rows from the denominator. Reasonable; should be stated in UI copy
  eventually.
- **"Active automations"** — workflow *state* count, not "workflows that ran". Fine,
  but the tile sits among run metrics; label is accurate.
- **"Tasks used"** — not on this page at all today. If added: per-run
  `actual_task_cost` is nullable (test/legacy/fatal-before-exec rows are NULL) and
  live billing is still flat 1-per-run, so a "tasks" chart must be labeled as
  recorded task charges, not inferred cost (§7).
- **"Time saved"** — does not exist in V2 (good). V1's `hoursSaved` summed *runtime*
  as "time saved" — explicitly rejected (§10).
- **Heatmap** — the one widget whose window (16 fixed weeks) silently ignores the
  global range selector; minor honesty gap worth a label fix.

---

## 6. Confirmed definitions — where computed

All in the pure `buildAnalyticsOverview`
([analyticsOverview.ts:268-303](../../../../services/analytics/analyticsOverview.ts)):
`totalsFor` :135-158 (rate, durations), `buildRunsOverTime` :160-187 (UTC buckets;
note the no-op weekly-alignment ternary at :168 — weekly buckets start at `since`'s
day, not a week boundary), `buildWorkflowStats` :189-218, `buildHeatmap` :232-251,
`buildRecentRuns` :253-266, `buildApps` :220-230. Range windows
(`computeRangeWindow` :82-104): `until = now` (ms precision); `7d/30d/90d` are
**rolling N×24h windows, not calendar-aligned**; in-range test is inclusive on both
ends; previous window is half-open (no seam double-count). Bucketing entirely UTC —
per-account timezone is a documented follow-up (:33-34).

---

## 7. Available-data catalog

Sources: `workflow_runs`
([20260507000001](../../../../supabase/migrations/20260507000001_workflow_runs.sql) +
~10 successor migrations), `workflows`
([20260506000000](../../../../supabase/migrations/20260506000000_workflows.sql)),
`task_usage_events` ([20260525000000](../../../../supabase/migrations/20260525000000_task_usage_events.sql)),
`integrations`, `workflow_run_stats` view
([20260529000000](../../../../supabase/migrations/20260529000000_workflow_run_stats_view.sql),
[20260604000000](../../../../supabase/migrations/20260604000000_workflow_run_stats_account.sql)).

Classification: **1 = available & trustworthy now · 2 = available, needs
normalization · 3 = derivable · 4 = missing but collectable · 5 = not appropriate ·
6 = sensitive/misleading.**

| Concept | Field(s) | Class | Notes |
|---|---|---|---|
| Time | `started_at`, `finished_at` (nullable), `created_at` | 1 | duration derived, not stored |
| Account | `account_id` NOT NULL, FK RESTRICT | 1 | authoritative scope |
| Workflow | `workflow_id` FK CASCADE; `workflows.name/state` | 1 | soft delete (`state='deleted'`, row kept) → history survives; hard delete only at account purge |
| Run status | enum `succeeded/failed/running/queued` | 1 | only 2 terminal states; no canceled |
| Test vs production | `is_test` boolean | 1 | already excluded everywhere; make it a *filter* not a hard rule |
| Execution source | `triggered_by` CHECK: `manual/test/webhook/scheduled/retry/api_key/unknown` | 1 | poll triggers are NOT a distinct value (arrive as webhook/scheduled/unknown) — label as "trigger source", not "trigger type" |
| Manual vs automated | derivable from `triggered_by` | 3 | manual+test vs rest |
| Retry | `triggered_by='retry'` on the new run | 2 | no `parent_run_id`/count — "includes retries" is the only honest framing |
| Duration | `finished_at − started_at` | 3 | clamp ≥0; skip unfinished |
| Task usage / run | `actual_task_cost`, `estimated_task_cost` (nullable) | 2 | NULL for test/legacy/fatal-early rows; live billing still flat 1/run — chart as "recorded task charges" with that caveat, or defer |
| Task usage / node+provider | `task_usage_events` (`provider`, `node_id`, `tasks_charged`, indexed by workflow) | 2 | richest provider attribution that exists; append-only ledger |
| Provider (per run) | — | 4 | NOT on the run row; trigger provider only inside `trigger_event` jsonb; per-action needs `steps[].nodeId`→definition join or the ledger. Collectable later as denormalized columns |
| Error category | `fatal_error.code` / `steps[].error.code` / `error_classification` — all jsonb | 2/4 | canonical `RunFailureCode` union exists ([engineTypes.ts:16-107](../../../../services/execution/engineTypes.ts)) but no queryable column; needs a normalized `failure_code text` column (backfillable from jsonb) before an error dimension is honest |
| Node-level status | `steps[].status` jsonb | 2 | not independently queryable |
| Node-level durations | — | 4 | `steps[]` has no timestamps |
| Triggering user | `triggered_by_user_id` (NULL for non-human) | 1/6 | **provenance, not ownership**; member-level analytics is a privacy/product decision (§25 D7) |
| API key attribution | `triggered_by_api_key_id/_prefix` | 1 | prefix survives key deletion |
| Historical workflow-name snapshot | — | 4 | rename retroactively relabels history (live join to `workflows.name`); acceptable at launch if documented; snapshot column is a later option |
| Cost (money) | — | 5 | not genuinely recorded; do not invent |
| Time saved | — | 5/6 | not recorded; V1's runtime-sum version rejected |
| Run payloads (`trigger_event`, `steps[].output`) | jsonb on the run row | 5/6 | never enter analytics scans or aggregate responses |
| Integration/connected app | `integrations` rows | 1 | connection-level only (as today's `by_app` honestly labels) |

**Join-vs-snapshot ruling:** analytics can safely join runs → current `workflows.name`
because deletes are soft and FKs keep ids stable; renamed workflows relabel history
(current-name semantics), deleted ones remain visible (label with a "(deleted)"
suffix from `state`). No snapshot table is required for launch; note it as a later
enhancement if users complain about rename history.

---

## 8. Account isolation & authorization findings

Verified strong (details in the tests audit, §22):

- **No analytics route accepts an account or workflow id for scoping.** Scope is
  always `requireAccount()` → `resolveActiveAccount(user.id)` with membership +
  freeze re-verified server-side ([_shared.ts:37-69](../../../../app/api/analytics/_shared.ts),
  [activeAccount.ts:87-140](../../../../services/accounts/activeAccount.ts)). URL/body
  tampering cannot cross accounts.
- **Dashboard writes** resolve the dashboard's owning account server-side
  (`authorizeDashboardWrite` → 404 non-member no-leak, 403 member-without-role);
  reads are any-member via RLS. Writes are service-role only (no authenticated
  write grant) — proven by the gated DB suite
  [analytics-dashboards-account.test.ts](../../../../tests/integration/security/analytics-dashboards-account.test.ts).
- **`workflow_runs` is locked down**: authenticated SELECT grant revoked
  (V2-READY-51, [20260701000000](../../../../supabase/migrations/20260701000000_revoke_authenticated_workflow_runs_select.sql));
  service-role readers + membership-gated repos are the only path; cross-account
  reads proven denied ([workflow-runs-account-rls.test.ts](../../../../tests/integration/security/workflow-runs-account-rls.test.ts)).
- **Personal-credential connected-app snapshots** are per-user in both cache key and
  RLS — co-members can't read them
  ([analytics-source-snapshots-account.test.ts](../../../../tests/integration/security/analytics-source-snapshots-account.test.ts)).
- **Manual-run attribution** (`triggered_by_user_id`) is provenance only; nothing in
  analytics treats it as ownership. Background runs have NULL user and aggregate
  fine.
- **Gaps/flags:**
  - No live two-account **HTTP-level** isolation test through `/api/analytics/data`
    (gate is unit-tested; RLS is DB-tested; the glue is untested).
  - A widget's `source` workflow-uuid is not membership-checked at save time
    (harmless today — the overview just won't match it — but the future query
    contract must validate workflow ids against the account, since they become SQL
    filters).
  - `refresh=1` on the sources route is an un-throttled live-provider fetch lever
    for any member.
  - `taskUsageStats`/`ownerAiStats`/`aiAnalyticsReport` cross-user service-role
    readers have **no enforced admin gate yet** (documented-only) — any future route
    over them must gate first.
  - Future saved views/insights must stay **account-owned** (like
    `analytics_dashboards`), not user-owned, with the same owner/admin authoring
    gate; personal views are a separate explicit decision (§25 D2).

---

## 9. Why the page feels rigid (causes, ranked)

**Data-model/API limitations (the real ceiling):**
1. One shared overview payload with fixed shape — every internal widget is a view
   over the same 10 precomputed aggregates; no widget can ask a different question.
2. No filters anywhere (status, trigger source, test-inclusion, workflow set).
3. Series are hardcoded in widget bodies ([widgetBodies.tsx:98-105,116-119](../../../../features/analytics/widgetBodies.tsx));
   the N-series-capable `LineChart` is never fed user-chosen series.
4. Workflow binding is one-or-all, single `<select>`; only for 3 scalar metrics.
5. Granularity is server-fixed (daily; weekly only past 92 days); heatmap fixed 16
   weeks; no hour/month grains.
6. Compare-period exists in data (`previousTotals`) but has no UI control and no
   series-level compare.
7. No drill-down anywhere; widgets aren't clickable.
8. The 5,000-row JS reduce makes all of the above expensive to bolt on — each new
   degree of freedom multiplies recompute cost, so flexibility was (correctly)
   deferred.

**Visual/UX issues (fixable without data-model work):**
9. Widget↔metric maps duplicated in 3 places (config panel / defaults / body
   switch) — adding a metric touches 4+ files.
10. `truncated` never surfaced; heatmap ignores the range silently.
11. Dashboard rename API exists with no UI; create/delete use
    `window.prompt`/`confirm`.
12. Resize is a dropdown, reorder is desktop-only HTML5 DnD (no touch); `xl`/`w`
    spans clamp awkwardly on 1–2-column mobile grids
    ([Widget.tsx:13-20](../../../../features/analytics/Widget.tsx),
    [AnalyticsDashboard.tsx:396](../../../../features/analytics/AnalyticsDashboard.tsx)).
13. 3-color series palette; no tooltips/legend toggling/hover detail.
14. `WidgetConfigPanel.tsx` (458 lines, ~23 `useState`s, ~50-prop drill into
    `WidgetConnectedAppConfig`) is the monolith where per-provider filter logic
    lives — adding one provider filter touches 5 files.

---

## 10. V1 behavior worth preserving / rejecting

V1 (`nstoddard17/chainreact-app-9e`) has a full analytics page
(`components/new-design/AnalyticsContent.tsx`, `GET /api/analytics/dashboard?days=`):
4 tabs (Overview / Executions / Workflows / Failures), period filter, CSV export.

**Preserve (proven behavior):**
- Period filter + one server endpoint doing all aggregation (V2 already does this).
- Honest execution-derived metrics; **Avg Duration instead of fabricated "time
  saved"**.
- A **Failures view** grouped by workflow and error type — V1 proved users want
  "which workflows fail and why" as a *user-value* question. This is evidence for
  reopening user-scoped failure analytics (§25 D9).
- p95 duration existed in V1 — cheap to include as a secondary stat once
  aggregation is SQL-side (note: p95 as a *user* stat is not the banned
  ops-observability widget when scoped to the user's own selected workflows —
  Marcus's call in D9).
- Honest empty states ("No failures — great!").
- CSV export from already-fetched data.

**Reject:**
- `hoursSaved = total runtime / 3600000` presented as savings (V1
  `app/api/dashboard/route.ts`) and hardcoded-zero metrics routes — fake analytics.
- Unbounded fetch (`days=0` pulled every session ever, aggregated in JS).
- N+1 per-workflow count loops (`workflow-stats`: 4 queries per workflow).

---

## 11. Proposed product model — two layers

**Layer A — Overview (keep, polish).** The seeded default dashboard already answers
the common questions with zero setup. Changes are additive polish: surface
`truncated`, label the heatmap's fixed window, expose compare-period on stat tiles
(data already computed), add drill-down links, dashboard-rename UI, custom date
range. Default widgets stay opinionated.

**Layer B — Custom insights ("Insight" widget).** One new widget type backed by a
typed server query contract (§15). Plain-language builder controls:

- **Measure** ("What do you want to count?"): Runs · Successful runs · Failed runs ·
  Success rate · Average duration · *(later)* Tasks used.
- **Show over** ("How should it be broken down?"): Time · Workflow · Status ·
  Trigger source · *(none → single number/KPI)*.
- **Filter to**: specific workflows (multi-select), statuses, trigger sources,
  include-test-runs toggle (default off).
- **Series** (line/bar over time only): the selected workflows (or statuses) each
  become their own line — see §13.
- **Date range**: existing presets + custom from/to (bounded ≤ 366 days).
- **Time grouping**: Auto · Day · Week · Month (Hour deferred — see §18).
- **Display as**: Line · Bar · KPI · Table at launch. Stacked bar / area / donut
  for custom insights deferred; donut remains in the default widgets where its
  single-breakdown math is honest.
- **Compare**: previous period (KPI + single-series first; multi-series compare
  deferred).
- **Name & save**: the widget title *is* the saved name; saving = the existing
  dashboard save path (widgets JSONB) — **no new persistence surface needed**.

Terminology recommendation (plain-language mapping): *Measure* = what is measured;
*Show over* = grouping; *Filter to* = filtering; *Series* = "each of these gets its
own line." Never expose column names, SQL, or raw JSON.

**Deliberately NOT:** a freeform canvas, a pivot/Tableau surface, cross-account
anything, arbitrary metrics math, or a second source of truth for run semantics —
the query service reuses the same status/test/terminal-state rules the overview
uses today.

---

## 12. Custom-chart experience (user flow)

1. Edit mode → "Add widget" → library gains one new card: **Custom insight**.
2. Config panel (replacing today's per-type metric dropdowns for this widget type)
   walks Measure → Show over → Filter → Display → Compare, with a live preview
   rendered from the real query endpoint (debounced; same bounded response).
3. Invalid combinations are **not silently fixed**: the client greys out invalid
   options via a shared capability matrix (exported constant, same module the
   server validates with), and the server independently rejects with a typed
   `INVALID_QUERY` error surfaced in the panel ("Success rate can't be split by
   status"). No silent fallback (product guardrail).
4. Save → widget persists as `config.insight` (additive Zod schema in
   [contracts/analytics.ts](../../../../contracts/analytics.ts), same JSONB column, no
   migration — the ANALYTICS-1 closeout's forward path).
5. The widget body fetches `POST /api/analytics/query` per widget (like
   connected-app widgets today), renders via the existing SVG chart primitives fed
   by a normalized result shape, and offers a "View runs" drill-down (§13.9).

---

## 13. Exact-item multi-series line charts (central requirement)

Reusable **dimension-and-series model**, not a workflow-specific component: a series
is "one value of the series dimension," and workflow is simply the first supported
series dimension (status/trigger-source get it for free).

1. **Selection UI:** multi-select combobox listing the account's workflows
   (server-listed, so membership-scoped), with search (name substring), Select
   all-in-filter / Clear, and the current one-`<select>` replaced. Recent/frequent
   ordering: sort by run count in the current range (already computed by
   `buildWorkflowStats`-equivalent), then name. Similar names disambiguated by
   state suffix ("(paused)", "(deleted)") + stable ordering.
2. **Top N vs explicit:** default mode "Top 5 by runs" (auto-follows the data);
   switching to "Choose workflows" pins an explicit id list. Both persist in the
   widget config; Top-N re-resolves per query (stable *rank* semantics, labeled).
3. **Max series: 8** (recommended; hard server cap). Selecting more → the client
   blocks with "Up to 8 lines per chart — remove one or split into two charts";
   the server rejects >8 with `INVALID_QUERY` (never silently truncates).
4. **Stable legends/labels:** server returns `{id, label, state}` per series;
   labels are current workflow names (rename = relabel, §7); deleted → "Name
   (deleted)"; missing workflow row → "Untitled workflow" (existing fallback).
5. **Color consistency:** deterministic assignment by position in the *saved
   selection order* (explicit mode) or rank (Top-N mode) over an 8-step categorical
   palette (extend `SERIES_COLORS` from 3 → 8, accessibility-checked). Same visit
   to visit because the order is persisted.
6. **Missing vs zero:** the server pre-seeds contiguous buckets (as
   `buildRunsOverTime` already does) and returns explicit `0`s within the range; a
   bucket outside a workflow's existence is still 0 (runs are facts; absence = 0).
   "No data" is only the whole-result-empty state. `avg_duration` series use `null`
   for empty buckets (0 would be a lie) and the line renders gaps — this is why
   the normalized result carries per-cell `number | null`.
7. **Legend toggling + hover:** legend chips toggle series visibility
   (client-only); hover shows a tooltip with bucket label + per-series values.
   These are additions to `LineChart` (which already takes `LineSeries[]`).
8. **Incompatible units:** one measure per chart at launch (no dual-axis). Mixing
   runs and duration = two charts. This dodges the classic misleading-dual-axis
   trap.
9. **Drill-down:** clicking a point (or a bar / the KPI) navigates to the Runs
   surface pre-filtered to the same slice: workflow ids, status, source, test
   flag, and the bucket's [start, end) window. *Unverified:* whether the current
   Runs page accepts all of these as URL query params — CS-3 must first verify and,
   if needed, add param support to the Runs list (its own small slice). The
   guarantee to test: **drill-down filters reproduce exactly the aggregated
   count.**
10. **Auto granularity:** `auto` grain picks day ≤ 92 days, week ≤ ~2 years, month
    beyond (server-owned rule, shared with validation so the client can display
    "grouped by week").
11. **Stacked vs independent:** independent lines for counts; stacked bar available
    later only for additive count measures (never for rates/averages — the
    capability matrix encodes "stackable: counts only").

---

## 14. Dashboard customization recommendation

Most of the brief's §8 list **already exists**: add / edit / remove / rename widget,
reorder, resize (6 footprints), multiple saved dashboards, default board, role-gated
shared authoring. Recommendation:

- **Keep:** multiple account-shared dashboards, owner/admin authoring, member
  read-only, 48-widget cap, atomic save.
- **Add at launch:** duplicate widget (trivial — copy JSONB entry), dashboard rename
  UI (API exists), replace `window.prompt/confirm` with proper dialogs.
- **Add soon after:** "Restore default layout" (re-seed `DEFAULT_OVERVIEW_WIDGETS`
  into a board on confirm — pure client+existing PATCH).
- **Defer:** personal (per-member) dashboards, dashboard-level ACLs, templates
  gallery, drag-resize handles, freeform canvas/grid-packing libraries. The audit
  found no evidence the current fixed-footprint grid materially hurts; a freeform
  canvas is explicitly not justified.

---

## 15. Server query contract (proposed)

`POST /api/analytics/query` (POST — the filter arrays don't fit querystrings well).
Zod `.strict()`, conceptually:

```ts
type AnalyticsQuery = {
  measure: "runs" | "succeeded_runs" | "failed_runs" | "success_rate"
         | "avg_duration_ms" /* later: | "tasks_used" */;
  dimension: "time" | "workflow" | "status" | "trigger_source" | null; // null = KPI
  timeGrain?: "auto" | "day" | "week" | "month";       // only with dimension:"time"
  series?: { by: "workflow" | "status"; mode: "top" | "explicit";
             ids?: string[]; topN?: number };           // ≤ 8; only with dimension:"time"
  filters: { workflowIds?: string[];                    // ≤ 20, membership-validated
             statuses?: ("succeeded"|"failed")[];
             triggerSources?: RunTriggerSource[];
             includeTests?: boolean };                  // default false
  range: { preset: "today"|"7d"|"30d"|"90d"|"ytd" } | { from: string; to: string }; // ≤ 366d
  compare?: "previous_period" | null;                   // KPI/single-series first
  sort?: { by: "value" | "label"; dir: "asc" | "desc" }; // categorical dims
  limit?: number;                                       // categorical dims, ≤ 50
};
```

Server obligations (all already precedented in the codebase):

- **Account scope is never client-supplied** — same `requireAccount()` gate; the
  service applies `account_id` itself (pattern of
  [_shared.ts](../../../../app/api/analytics/_shared.ts)).
- **Membership-validate `workflowIds`/series ids** against the account's workflows
  before they reach SQL (closes the §8 gap).
- **Validate the measure×dimension×display matrix** from one exported capability
  module (client greys out; server rejects `INVALID_QUERY` — typed error like
  `AnalyticsSourceError`, no silent fallback).
- **No arbitrary columns/SQL** — every measure and dimension maps to a hand-written
  SQL fragment in the analytics repository; nothing is interpolated from input
  except bound parameters.
- **Bounded results:** ≤ 8 series × ≤ 400 buckets, or ≤ 50 categorical rows;
  zero-filled buckets; per-cell `number | null`.
- **Stable labels + ids** for every series/row (id, label, state).
- **Time:** UTC at launch (documented), inclusive-start/exclusive-end bucket
  boundaries, range presets identical to `computeRangeWindow` semantics; per-account
  timezone is a later enhancement with a single conversion point in the SQL
  (`date_trunc(grain, started_at AT TIME ZONE $tz)`).
- **No payload leakage:** aggregates only; `trigger_event`/`steps`/outputs never
  selected.
- **Result shape:** reuse/extend the existing `NormalizedAnalyticsResult` concept
  (kind/dimensions/measures/rows/totals/truncated/warnings,
  [sources/types.ts](../../../../services/analytics/sources/types.ts)) so internal and
  connected-app widgets converge on one renderable shape.

**Where it computes (recommendation):** a dedicated
`repositories/analyticsQueries.ts` (service-role) issuing **SQL aggregates** — either
PostgREST aggregate queries or, more likely, one Postgres **RPC**
(`analytics_runs_aggregate(...)`, SECURITY DEFINER, service-role-grant-only, explicit
`account_id` parameter passed by the server) following the precedent of the billing
RPCs. Existing repositories stay the source of run semantics for *lists*; the RPC
encodes the same status/test rules (assert parity in tests). **Not** materialized
views or pre-aggregated tables at launch (§18). The existing `workflow_run_stats`
view already covers lifetime per-workflow tallies and stays as-is.

---

## 16. Frontend component boundaries (proposed)

- `features/analytics/insight/InsightConfigPanel.tsx` — the Measure/Show-over/Filter
  builder (new, isolated; does NOT grow `WidgetConfigPanel` further).
- `features/analytics/insight/InsightWidgetBody.tsx` — per-widget fetch + states
  (mirrors `ConnectedAppWidgetBody` patterns: loading/error/empty/stale, abortable).
- `features/analytics/insight/useAnalyticsQuery.ts` — fetch + cancellation
  (AbortController; stale responses from a superseded filter change are dropped).
- `components/analytics/charts.tsx` — extend, don't replace: 8-color palette,
  legend-toggle + tooltip support on `LineChart`, null-gap rendering. All widgets
  keep consuming these primitives.
- `contracts/analytics.ts` — additive `config.insight` Zod schema + the shared
  capability matrix module (single source for client greying and server
  validation).
- Business rules (bucket math, validation, capability matrix) live in
  `services/`/`core`-side modules, not components — `WidgetConfigPanel`'s per-provider
  sprawl is the anti-pattern not to repeat.

## 17. Backend/service/repository boundaries (proposed)

- `app/api/analytics/query/route.ts` — gate (`requireAccount`), Zod parse,
  serialize. Nothing else.
- `services/analytics/insightQuery.ts` — the brain: capability validation,
  workflow-membership validation, grain resolution, compare-window derivation,
  bounded-result assembly. Pure helpers exported for tests (like
  `buildAnalyticsOverview` today).
- `repositories/analyticsQueries.ts` — service-role SQL/RPC access only.
- `services/analytics/analyticsOverview.ts` — unchanged at first; later slices may
  re-express overview widgets through the query service (one source of truth), but
  that refactor is intentionally NOT in the first slice.
- Connected-app sources: untouched; still validated/cached through
  `querySource.ts`. A later convergence can present internal insights and app
  sources through one renderable result shape (already aligned via
  `NormalizedAnalyticsResult`).

## 18. Database / index / aggregation recommendations

- **No migration in the first slices.** `workflow_runs_account_idx (account_id,
  started_at DESC)` serves `WHERE account_id = $1 AND started_at >= $2 AND status
  IN (...) GROUP BY date_trunc(...)`; per-workflow filters additionally ride
  `workflow_runs_workflow_idx (workflow_id, started_at DESC)`. Measure this before
  adding indexes.
- **Hour grain deferred** until there's a bounded-range guard (hour × 366 days =
  8,784 buckets > budget; allow hour only for ranges ≤ 14 days when it lands).
- **Daily pre-aggregated rollup table** (`analytics_daily_rollups`: account_id,
  workflow_id, day, counts, duration sum/count, task sum): a **later enhancement**,
  cron-filled, only when live SQL aggregates measurably exceed budget (§19). Do not
  build speculative infrastructure; the design keeps the query service as the
  single consumer so a rollup can be swapped in behind it without contract change.
- **`failure_code text` column** (backfillable from `fatal_error`/`steps` jsonb, or
  a generated column) is the prerequisite for an error-category dimension — its own
  migration-bearing slice, gated on §25 D9.
- **RLS:** no change — the query path is service-role behind membership-gated
  routes, same as `listForAnalytics` today; `workflow_runs` keeps zero authenticated
  grants.

## 19. Performance & scaling analysis

**Today:** 100 runs — trivial. 10,000 runs — the 5,000 cap truncates silently (flag
never rendered); JS reduce still fast but wrong. 1,000,000 runs — permanently
capped at the newest 5,000 in the fetch window; heatmap/top-workflows quietly
lie. Team account, many workflows — the `/data` payload's `workflows` array is
unbounded and `listByAccount` does `SELECT *` including `draft_definition` jsonb
(over-fetch). One-year range — weekly buckets, same single capped fetch. Multiple
widgets — internal ones share one fetch (good); connected-app ones fan out
per-widget (bounded by TTL cache). Nothing downloads raw runs to the browser
(good; keep as an invariant).

**Future model:** SQL aggregation removes the cap-lying problem (counts are exact
regardless of row count); result size is bounded by the contract, not by data
volume. Per-insight-widget fetches fan out like connected-app widgets — acceptable
with request cancellation + per-account rate limiting if needed.

**Recommended budgets (measurable, launch-sized):**
- `POST /api/analytics/query` p95 ≤ 500 ms at 1M-run accounts (measured via EXPLAIN
  + a seeded load test before enabling by default).
- Response payload ≤ 100 KB (bounded by contract: 8×400 cells).
- Dashboard initial paint: internal overview ≤ 1 fetch; ≤ 6 concurrent insight
  fetches (queue beyond).
- Client: stale-response cancellation mandatory (no last-write-wins flicker).

**Fix-now regardless of redesign:** render `truncated`, narrow the
`listByAccount`/`listActiveByAccount` column lists, fix the `>=` truncation
heuristic (fetch cap+1).

## 20. Accessibility & responsive behavior

- Charts are custom SVG with no text alternative today. Insight widgets must ship:
  `role="img"` + generated `aria-label` summary ("Runs by day, 3 series, Jul 1–24"),
  a "View as table" toggle (the table display already planned — reuse it as the
  accessible fallback), and keyboard-reachable legend toggles.
- Color: 8-step palette validated for contrast + colorblind distinguishability
  (follow the dataviz skill palette guidance when implementing); never encode
  meaning by color alone (legend labels + tooltips).
- Responsive: size spans must clamp to available columns (fix `col-span-4` on
  1-col mobile); config panel becomes a bottom sheet on narrow widths; DnD reorder
  gains an accessible fallback (move up/down buttons) which also fixes touch.
- Reduced-motion: skip pulse/shimmer loading animations under
  `prefers-reduced-motion`.

## 21. Error / empty / loading / partial-data states

Adopt the connected-app widget's proven state machine
([ConnectedAppWidgetBody.tsx](../../../../features/analytics/ConnectedAppWidgetBody.tsx))
for insight widgets: loading (skeleton, reduced-motion-aware) · error (typed code →
safe message + Retry; one failing widget never crashes the board) · empty ("No runs
match these filters yet" — honest zero vs no-data distinction per §13.6) · partial
(`truncated`/`warnings` → visible badge, not silence) · stale (a failed refetch
keeps prior data ONLY with an explicit "Couldn't refresh — showing previous
results" banner; never silently presents stale as current). Config-panel preview
errors render inline with the plain-language invalid-combination copy. Global
`ErrorBanner` remains for dashboard-CRUD failures only.

## 22. Testing strategy (required tests for the implementation slices)

Follow [testing-strategy.md](../../../rules/testing-strategy.md): mock only external
boundaries; prove the calculation and authorization rules themselves.

**Query service (pure + DB-gated):**
- Account-scoped aggregation correctness: seeded two-account dataset → each account
  sees only its own aggregates; cross-account request impossible by construction
  (no account param) — extend the gated DB suite pattern of
  [workflow-run-stats-account.test.ts](../../../../tests/integration/security/workflow-run-stats-account.test.ts).
- A live two-account HTTP test through the new route (closes today's route-level
  gap found in §8).
- Exact selected workflows → exact series (ids in = series out, order preserved);
  unselected workflows excluded; >8 series rejected `INVALID_QUERY`; workflow id
  not in account rejected (no-leak: same error as nonexistent).
- Date boundaries: bucket edges inclusive-start/exclusive-end; range caps (>366d
  rejected); day/week/month grouping counts proven against hand-computed fixtures;
  `auto` grain thresholds.
- UTC bucketing pinned by fixed-clock tests (and a timezone test the moment tz
  support lands).
- Success-rate formula parity with `buildAnalyticsOverview` (one source of truth
  guard).
- `includeTests` default-off proven; on includes `is_test` rows.
- Zero vs null: count measures zero-fill; `avg_duration_ms` yields null cells.
- Deleted/renamed workflows: seeded run with soft-deleted workflow → "(deleted)"
  label; missing workflow row → "Untitled workflow" (covers the currently untested
  fallback).
- Invalid measure×dimension combos: each invalid cell of the capability matrix
  rejected (drives the currently-never-executed `INVALID_QUERY` class of paths).
- Bounded results: large seeded dataset returns capped rows + `truncated: true`.

**Route:** unauth 401; frozen/non-member 403; strict-schema unknown keys rejected.

**Drill-down:** the runs-page filter for a clicked bucket returns exactly the rows
the aggregate counted (equality assertion, not smoke).

**UI (RTL):** config panel greys invalid combos and never silently rewrites a
selection; widget states (loading/error/empty/partial/stale banner) each rendered;
legend toggle hides a series without refetch; stale-response cancellation (resolve
out of order → latest filter wins); saved insight round-trips through dashboard
save/load (Zod).

**Authz on saved objects:** insight configs live in `analytics_dashboards.widgets`,
so the existing gated dashboard suite already covers ownership; extend it only if a
separate saved-view table is ever introduced.

## 23. Alternatives considered

| Approach | Security | Perf at 1M runs | Effort | Flexibility | Verdict |
|---|---|---|---|---|---|
| **Typed query contract + SQL aggregation (chosen)** | server-owned scope, allow-listed everything | exact counts, index-backed | medium | high, evolves | ✅ |
| Extend `AnalyticsOverview` with more precomputed fields per request | same as today | still 5k-cap JS reduce; payload grows per feature | low each, unbounded total | low — every question is a new hardcoded field/endpoint (violates guardrail) | ❌ |
| Client-side aggregation over fetched runs | payload = raw runs (leak surface, PII-adjacent) | downloads runs to browser — prohibited by brief | low | high but unsafe | ❌ |
| Arbitrary client-defined query (columns/SQL/JSON) | unacceptable | — | — | maximum | ❌ guardrail |
| Pre-aggregated rollup tables first | fine | best | high (migration, cron, backfill, dual-write drift) | same as chosen | ⏭ later, behind the same contract, only if budgets miss |
| Per-chart hardcoded endpoints | fine | fine | high forever | none | ❌ guardrail |

## 24. Risks & unresolved questions

1. **Observability-decision overlap** — failure/error analytics needs Marcus's
   explicit reopening (§25 D9). Until then, slices avoid error-category work.
2. **`tasks_used` honesty** — nullable per-run costs + flat-1-per-run live billing
   means a tasks chart could read as cost telemetry it isn't. Recommendation: defer
   the measure until reconcile is the live path, or label strictly as "recorded
   task charges" (D10).
3. **Drill-down target unverified** — Runs-page URL-filter support was not
   inspected in this audit; CS-3 starts with that verification.
4. **RPC vs PostgREST aggregates** — the exact mechanism for SQL aggregation
   (single RPC vs supabase-js aggregate queries) is an implementation-time choice;
   both satisfy the contract. Precedent (billing RPCs) favors an RPC.
5. **Query cost at high volume unmeasured** — budgets are targets; CS-1 includes an
   EXPLAIN/seeded-volume check before default-on.
6. **Un-throttled `refresh=1`** on sources route (pre-existing) — piggyback a
   per-account throttle when convenient.
7. **Admin-gate debt** on `taskUsageStats`/`ownerAiStats` cross-user readers
   (pre-existing, documented-only) — must not be forgotten if any future analytics
   surface touches them.
8. **Rename-relabels-history** semantics — acceptable and documented, but a user
   may someday expect point-in-time names; snapshotting is a later option, not a
   launch need.
9. **No migrations planned for CS-1..CS-4** — if EXPLAIN results force an index or
   rollup earlier, that becomes its own migration-bearing slice (never snuck in).

## 25. Product-owner decisions (recommendations — Marcus decides)

| # | Decision | Recommendation |
|---|---|---|
| D1 | One customizable dashboard vs multiple saved | **Keep multiple** — already shipped and working; no reason to regress |
| D2 | Saved dashboards private vs account-shared | **Account-shared only (status quo)**; defer personal views until a concrete ask — avoids a second ACL model now |
| D3 | Reorder-only vs also resizable | **Keep both** (both exist); upgrade resize UX from dropdown→handles later; add move-up/down buttons for touch/a11y at launch |
| D4 | First custom chart types | **Line, bar, KPI, table.** Defer stacked/area; donut stays default-widgets-only |
| D5 | Max simultaneous line series | **8** (hard server cap, client copy explains) |
| D6 | Previous-period compare in first implementation | **Yes for KPI + single-series** (data already computed today); multi-series compare deferred |
| D7 | Member-level analytics on team accounts | **Defer.** `triggered_by_user_id` is provenance; per-member charts raise surveillance/privacy questions not worth opening at launch |
| D8 | Plan-level entitlement for advanced analytics | **No gating at launch** — analytics drives activation; revisit (e.g. insight-widget count or history depth by plan) when billing tiers firm up |
| D9 | **Reopen user-scoped failure analytics?** ("which of my workflows fail most", error-category dimension, p95) | **Recommend yes, narrowly**: user-selected-workflow failure counts/rates are business value (V1's Failures tab proved demand) and distinct from the banned ops console; provider-wide/platform metrics stay banned. If reopened, the `failure_code` column slice unlocks the error dimension |
| D10 | Ship `tasks_used` measure at launch? | **Defer** until task billing reconcile is live, or ship clearly labeled "recorded task charges" — recommend defer |

## 26. Recommendation classification

| Recommendation | Class |
|---|---|
| Dashboard shell (multi-dashboard, roles, JSONB widgets, atomic save) | Preserve |
| Connected-app source registry + cache + typed errors | Preserve |
| Server-owned account scope (no accountId params) | Preserve |
| Opinionated seeded default dashboard | Preserve |
| SVG chart primitives (extended, not replaced) | Preserve |
| Render `truncated`; fix `>=` heuristic | Fix now |
| Narrow `SELECT *` in workflows/integrations list readers | Fix now |
| Label heatmap's fixed 16-week window | Fix now |
| Stale "not exposed in UI" comment in contracts/analytics.ts | Fix now |
| Dashboard rename UI; replace `window.prompt/confirm` | Fix now (bundled with CS-2 UI work) |
| Typed query contract + SQL aggregation service | Launch enhancement (CS-1) |
| Insight widget: measure/dimension/filter/multi-series (line/bar/KPI/table) | Launch enhancement (CS-2) |
| Membership-validate workflow ids in configs/queries | Launch enhancement (CS-1) |
| Drill-down to Runs | Launch enhancement (CS-3) |
| Custom date range + granularity + compare UI | Launch enhancement (CS-4) |
| Legend toggle, tooltips, 8-color palette, a11y table fallback | Launch enhancement (CS-2) |
| Duplicate widget; restore-default layout | Launch enhancement (small, with CS-2/CS-4) |
| Hour grain (bounded ranges) | Later enhancement |
| `failure_code` column + error dimension + p95 | Later enhancement (gated on D9) |
| `tasks_used` measure | Later enhancement (gated on D10) |
| Per-account timezone bucketing | Later enhancement |
| Daily rollup table / materialized aggregates | Later enhancement (budget-triggered) |
| Workflow-name snapshots on runs | Later enhancement (demand-triggered) |
| Personal dashboards / dashboard ACLs / templates | Later enhancement |
| Overview widgets re-expressed through the query service | Later enhancement (refactor) |
| Freeform canvas / grid-packing layout | Reject |
| Client-side aggregation over raw runs | Reject |
| Arbitrary SQL / raw JSON config / column exposure | Reject |
| "Time saved" as runtime sum (V1) | Reject |
| Per-chart hardcoded endpoints | Reject |
| Dual-axis mixed-unit charts | Reject |

## 27. Implementation slices (dependency order)

**CS-1 — Analytics query contract + service (backend only).**
User-visible: none yet. Backend: `AnalyticsQuery` Zod contract + capability matrix
module; `services/analytics/insightQuery.ts`; `repositories/analyticsQueries.ts`
(SQL aggregation; RPC if chosen — that variant adds a migration for the function
only, no table/index); `POST /api/analytics/query` route. Security:
`requireAccount` gate; workflow-id membership validation; bounded results; no
payload columns touched. Tests: the full §22 service/route battery incl. gated
two-account DB suite + EXPLAIN/volume check. Migrations: none (or RPC-function-only).
Dependencies: none. Risk: low-medium (read-only, additive). Scope: medium.

**CS-2 — Insight widget (UI).**
User-visible: "Custom insight" in the widget library; Measure/Show-over/Filter
builder with live preview; workflow multi-select series (Top-5 default, explicit
mode, 8 max); line/bar/KPI/table; legend toggle + tooltips + 8-color palette +
a11y table fallback; per-widget states incl. truncated badge; dashboard rename UI +
dialog cleanup; render `truncated` on internal widgets; duplicate-widget. Backend:
none beyond CS-1. Security: config is `.strict()` additive JSONB (no migration);
server re-validates everything at query time. Tests: §22 UI battery + config
round-trip. Dependencies: CS-1. Risk: medium (largest UI surface). Scope: large —
may split into CS-2a (widget+line/KPI) / CS-2b (bar/table+polish).

**CS-3 — Drill-down.**
User-visible: click a point/bar/KPI → Runs filtered to that exact slice. Backend:
verify/extend Runs-page URL filter params (workflowIds, status, source, test,
from/to). Security: Runs page already membership-scoped; no new exposure. Tests:
aggregate↔list equality. Dependencies: CS-2. Risk: low. Scope: small-medium.

**CS-4 — Range, grain, compare controls.**
User-visible: custom from/to date picker (dashboard-level + per-insight override),
explicit Day/Week/Month control, previous-period compare on KPI/single-series,
restore-default-layout. Backend: custom-range support in `/api/analytics/data`
(the overview path) reusing CS-1's validated range type. Tests: boundary + compare
math. Dependencies: CS-1 (CS-2 for per-insight UI). Risk: low. Scope: medium.

**CS-5 (gated on D9) — `failure_code` normalization + error dimension.**
User-visible: "Show over: error type", "failed most often" insights, optional p95.
Backend/data: migration adding `failure_code text` (backfill from jsonb) + engine
write-through; new dimension in the capability matrix. Security: codes are enum
values, no messages/payloads. Tests: backfill correctness, dimension math,
classifier parity. Dependencies: CS-1, Marcus reopening D9. Risk: medium
(migration + engine write path). Scope: medium.

**CS-6+ (later, individually):** tasks_used measure (D10) · hour grain · timezone ·
rollup table (budget-triggered) · overview-through-query refactor · personal views.

## 28. Explicit non-goals

No Tableau/Power BI/pivot builder; no SQL or JSON configuration surfaces; no
cross-account or platform-wide metrics (observability decision stands); no
member-surveillance analytics; no estimated/invented metrics ("time saved", money
cost); no freeform canvas; no speculative telemetry, rollup tables, or indexes
ahead of measured need; no second implementation of run-status/test semantics; no
public dashboard sharing (still its own security-reviewed slice); no change to
connected-app source architecture.

## 29. Acceptance criteria

**This planning slice:** this doc exists, every current-state claim traces to a
cited file, no source/test/migration/UI change, docs-only local commit, nothing
pushed. ✔ by construction.

**The implementation (later slices) must meet:** exact-selection series charts
(chosen workflows in = those series out, nothing else); no client-side raw-run
aggregation; server-validated measure/dimension matrix with typed rejection (no
silent fallback); account scope never client-supplied; bounded responses; honest
truncation/partial states; drill-down equality; budgets in §19 measured before
default-on.

## 30. Hard boundaries — what this slice did NOT change

No source code, tests, migrations, schema, indexes, RLS, routes, UI, flags,
telemetry, or production behavior. No push, no PR, no deploy, no `db:push`. The
only change is this document.

## 31. Files inspected & commands run

**Read directly by the author:** `docs/slices/phase-4/analytics/analytics-closeout.md`,
`docs/slices/phase-4/analytics/analytics-observability-product-decision.md`,
`docs/PROJECT_MEMORY.md` (analytics-relevant sections), `CLAUDE.md`,
`docs/slices/phase-5/advanced-branching-routing-and-entitlement-plan.md` (house style).

**Inspected via four delegated audit passes over this repo** (findings cited inline
throughout; every specific claim carries its file:line): `app/analytics/page.tsx`;
`features/analytics/*` (AnalyticsDashboard, Widget, WidgetConfigPanel, WidgetLibrary,
widgetBodies, dashboardHelpers, ConnectedAppWidgetBody, widgetFilterKeys,
widgetConfigParts, connectedAppSources*, WidgetConnectedApp*);
`components/analytics/charts.tsx`, `icons.tsx`; `contracts/analytics.ts`;
`lib/api/analytics.ts`; `app/api/analytics/**` (routes + `_shared.ts`);
`services/analytics/**` (analyticsOverview, dashboards, taskUsageStats,
ownerAiStats, aiAnalyticsReport, sources/{types,registry,querySource,cache,internal,github});
`repositories/{analyticsDashboards,analyticsSourceSnapshots,workflowRuns,workflows,integrations}.ts`;
`services/execution/engineTypes.ts`, `classifyHandlerError.ts`;
`services/accounts/{activeAccount,accountAuthz}.ts`; supabase migrations
`20260506000000`, `20260507000001`, `20260507000005`, `20260523000000`,
`20260525000000/2/4`, `20260529000000`, `20260530000001/4`, `20260531000005/6`,
`20260604000000`, `20260609000000`, `20260626000000`, `20260701000000`,
`20260702000001`, `20260704000000`, `20260713000000`; analytics test suites
(`tests/integration/security/analytics-*`, `workflow-runs-account-rls`,
`workflow-run-stats-account`, `tests/unit/app/api/analytics/*`,
`tests/unit/services/analytics/*`, `tests/unit/features/analytics/*`). A fifth pass
inspected V1 (`c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`) read-only:
`app/(app)/analytics/page.tsx`, `components/new-design/AnalyticsContent.tsx`,
`stores/analyticsStore.ts`, `app/api/analytics/dashboard/route.ts`,
`app/api/dashboard/route.ts`, `app/api/analytics/metrics/route.ts`.

**Commands actually run:** ChainReactV2 MCP `get_project_memory`,
`search_project_docs("analytics")`, `repo_file_search("analytics")`; `ls`/`wc -l`
directory listings; `git rev-parse`/`git add`/`git commit` for this doc. **No**
`tsc`, lint, or test commands were run — nothing was implemented, so the testing
gates do not apply to this docs-only batch. No check is claimed beyond these.

## 32. Recommended next step

**CS-1** (query contract + SQL aggregation service, backend-only, no migration) —
it unblocks every user-visible flexibility feature, carries no UI risk, and its
volume/EXPLAIN check settles the rollup-table question with data instead of
speculation. Decisions D9 (failure analytics) and D10 (tasks measure) can be made
in parallel without blocking CS-1..CS-4.
