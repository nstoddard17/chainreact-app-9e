# ANALYTICS-FINAL-CERTIFICATION-1 — Final verification and release closeout

**Status:** focused deterministic certification **PASSED**; automated browser
certification **ENVIRONMENT-BLOCKED** (no loopback Supabase; Docker prohibited).
**Release recommendation: READY WITH DOCUMENTED BROWSER LIMITATION.**
**Branch:** `analytics-cd5b-drilldown` @ `f95fdd3c5` ·
**Worktree:** `C:/Users/marcu/source/repos/ChainReactV2-wt-cd5b`
**Push/deploy status:** local only — no push, no PR, no deploy, no migration, no
`db:push`, no scope change, no exposure change, no production change. Docker was
never started.

---

## 1. Product completed

The connected-data Analytics upgrade is feature-complete for launch:

- **Connected-data Custom Insights** — a generic, catalog-driven builder
  (App → Data → Show → Group by → Only include → Series → Time → Chart) with no
  provider-specific React anywhere in the chart or exploration UI.
- **Five launch chart types** — Number/KPI, line, bar, table, and donut (donut only
  where the catalog declares a genuine part-to-whole dimension).
- **QuickBooks → Invoices** and **Shopify → Orders**, each live-certified in their
  own slices and publicly exposed.
- **Date presets and custom ranges** — today, yesterday, last 7/30/90 days, this
  month, last month, year to date, last 12 months, plus custom ranges, all filtered
  per dataset by its own `maxRangeDays`.
- **Inclusive end dates** — a custom range now includes the end date the user picked
  (see the release-note warning in §3).
- **Previous-period comparison** — across Number, line, bar and table, with neutral
  language and no good/bad coloring; unavailable on donut by design.
- **CSV export** — per widget, client-side from the aggregate already on screen.
- **Aggregate drill-down** — click or keyboard-select a value carrying a
  server-issued refinement to narrow the question in place.
- **Save explored question** — editors can persist an exploration as a new widget.
- **Dashboard-management additions** — create, switch, rename, delete, duplicate
  widget, restore default layout, resize, reorder, remove, JSON export,
  malformed-widget salvage, member read-only behavior.

## 2. Provider inventory — verified from the real registry

Read directly out of `listInsightSources()` and `buildClientAnalyticsCatalog()` (not
from a fixture) during this batch:

| Source | Registry exposure | In production projection |
|---|---|---|
| `chainreact.workflow_runs` | public | **yes** |
| `quickbooks.invoices` | public | **yes** |
| `shopify.orders` | public | **yes** |
| `stripe.payments` | preview | no (development only) |
| HubSpot → Deals | *not registered* | no |
| Motive → Fuel purchases | *not registered* | no |

Production projection contains exactly `chainreact, quickbooks, shopify`; development
additionally shows `stripe(preview)`. The projection carries no `requiredScopes`, no
`executionMode`, and no internal scan/bucket limits.

Every dataset supports all five chart types, each declaring its own part-to-whole
dimensions (`status`, `paid_status`, `financial_status`/`fulfillment_status`) so
donut is offered only where the parts genuinely sum to the whole.

**Drillability, as derived from the real catalogs:**

| Dataset | Drillable dimensions | Dimension but deliberately NOT drillable |
|---|---|---|
| chainreact.workflow_runs | workflow (entity), status, trigger_source | — |
| quickbooks.invoices | paid_status | **customer** (per-account one-way surrogate), currency |
| shopify.orders | financial_status, fulfillment_status, cancellation_state | currency |
| stripe.payments | status | currency |

This is the intended CD-5B security posture holding in production code: QuickBooks
customer rows and every account-specific currency domain stay non-drillable because
no canonical filter value can be proven for them.

## 3. Release-note warning (must ship with the release)

> **Existing Custom Insights with a custom date range will now correctly include the
> selected end date. Because the previous behavior accidentally excluded that final
> day, some existing chart totals may increase after release.**

Scope: affects only saved Insights using a **custom** date range (presets are
unchanged). The previous behavior sent the picked end date straight onto a half-open
`[from, to)` window, silently dropping that whole day — and because the default
custom range ended "today", a freshly-opened custom range showed none of today's data.

## 4. Testing evidence

### Static checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | **0 errors, 27 warnings** — identical to the arc baseline |
| `npm run lint:structure` | 1 violation: `docs/slices/phase-5` root holds 51 files (limit 50) |
| `npm run lint:migrations` | OK — no migration exists or was added |

**Structure baseline verified, not assumed.** The violating folder is the phase-5
*root*. `git diff --name-only fb39f3834 HEAD -- docs/slices/phase-5/` shows the entire
Analytics arc added **zero** files there; all 16 arc documents live in
`docs/slices/phase-5/analytics/`. No Analytics code folder is near the cap (largest:
`features/analytics/insights` at 28 files). The violation is pre-existing and
parallel-owned; nothing in Analytics introduces a new one, and no unrelated baseline
offender was touched.

### Focused Analytics/contracts regression tree

Run in four bounded batches (targeted paths only — never the repository suite):

| Command | Suites | Tests |
|---|---|---|
| `npm test -- tests/unit/contracts/analyticsCatalog.test.ts tests/unit/contracts/analyticsInsightWidget.test.ts tests/unit/contracts/analyticsQuery.test.ts tests/unit/core/analytics/` | 6 | 138 |
| `npm test -- tests/unit/services/analytics/` | 82 | 1,124 |
| `npm test -- tests/unit/features/analytics/` | 24 | 397 |
| `npm test -- tests/unit/app/api/analytics/` | 5 | 51 |
| **Total** | **117** | **1,710** |

**All passed. 0 failures. 0 skipped.** Coverage spans every area required by this
batch: connected query/result/refinement contracts, catalog validation, registry and
client projection, query validation, the Insights route, cache, coalescing, provider
limiter, the CS-1 engine, insight widget contract, builder flow, reconciliation,
presets, custom ranges, inclusive end-date translation, grains, comparison, preview
and saved-widget lifecycle, query-result identity, exposure, all five renderers, the
accessible data table, comparison rendering, drill interactions, deterministic
responsive assertions, the CSV serializer (including formula-injection protection,
explored-result export, no-refetch, freshness/completeness metadata), refinement
attachment, pure refinement, exploration state/Back/Reset/depth/failed-child,
save-as-new with permissions and widget cap, account isolation, all four provider
adapters plus the QuickBooks customer resolver and the legacy fixed widgets, and
dashboard lifecycle/rename/duplicate/restore/persistence/salvage/member behavior.

### Browser certification — ENVIRONMENT-BLOCKED

All ten required browser scenarios are classified **Blocked — environment
unavailable**. None is claimed as passed.

| # | Scenario | Classification |
|---|---|---|
| 1 | Create and persist a Custom Insight | Blocked |
| 2 | Chart-type smoke (KPI/line/bar/table/donut) | Blocked |
| 3 | Inclusive custom end date | Blocked |
| 4 | Previous-period comparison | Blocked |
| 5 | CSV export | Blocked |
| 6 | Drill-down (breadcrumb/Back/Reset/reload/failed child) | Blocked |
| 7 | Save explored question (+ member restriction) | Blocked |
| 8 | Dashboard compatibility | Blocked |
| 9 | Responsive smoke | Blocked |
| 10 | Accessibility smoke | Blocked |

**Two independent blockers, both established by passive checks only:**

1. **No loopback Supabase.** `playwright.config.ts` loads `.env.test.local`, which
   points `NEXT_PUBLIC_SUPABASE_URL` at `http://127.0.0.1` and *never* reads
   `.env.local`. That file is absent from this worktree, and the loopback stack is
   not running: `127.0.0.1:54321/auth/v1/health` and `/rest/v1/` both return empty
   responses and nothing accepts connections on the Postgres port. The harness names
   the fix itself — *"Run `npm run supabase:test:start` to bring up local Supabase"* —
   which is the prohibited Docker path.
2. **The only running app server is the wrong build.** A Next dev server answers on
   `localhost:3001`, but process inspection shows every running Next process is
   serving `C:\Users\marcu\source\repos\ChainReactV2` — the **main working tree**,
   which contains none of the CD-4D/CD-5A/CD-5B Analytics work (all of it lives in
   isolated worktrees). Certifying against it would have produced false passes for
   features that build isn't running.

**What was verified about the browser layer without executing it:** the targeted spec
is intact and enumerates its 9 CD-3A scenarios via
`npx playwright test tests/e2e/analytics-insight-cd3a-cert.spec.ts --list` (a
non-run invocation the config explicitly tolerates without the env).

**Deliberately not done:** Docker was not started; `supabase start` /
`supabase:test:start` was not run; no container was created, repaired or restarted;
no substitute database was configured; the e2e harness was **not** re-pointed at the
real cloud Supabase in `.env.local` (that would both violate the local-only boundary
and write test data into a real environment); no browser dependency was installed or
repaired; and the spec was **not** padded with CD-3B/CD-5A/CD-5B scenarios that could
not be executed — unrunnable spec code would be unverified work presented as
certification.

## 5. Product defects

**None found in this batch.** No focused test failed, no static check regressed, and
the registry/projection inventory matches the intended launch state exactly. No fix
was required, so no defect commit exists here.

(For the record, the three defects found *during* CD-5B — a drill silently
substituting a different range, a lagging query result being labeled with the wrong
exploration level, and the line chart's Previous-period legend button missing its
accessible name — were fixed and committed in that batch at `646ca838d`.)

## 6. Remaining debt

External certification blockers (each needs owner-supplied data or a connection):

- **Stripe public certification** — pending a connected Stripe **test** account; the
  read-only harness `scripts/trash/stripe-payments-analytics-cert.ts` is committed
  and ready, and the flip is the single `exposure` line.
- **HubSpot → Deals** — pending a portal with populated deal **amounts** (the
  connected portal holds 2 deals and 0 usable amounts).
- **Motive → Fuel purchases** — pending fuel-purchase history (CD-4A, unmerged
  branch).

Deliberately deferred (product decisions, not defects):

- External-provider raw-record drill-through.
- ChainReact Runs URL-filter navigation — the Runs page parses no search params and
  has no date or workflow filter, so no explored query maps to it exactly.
- Calendar-aligned month comparison (the engine compares equal-duration windows).
- Series-value drill UI on the line chart.
- Browser certification of the launch-visible flows (this batch's blocker).

## 7. Release recommendation

### READY WITH DOCUMENTED BROWSER LIMITATION

- Focused deterministic tests are green: 117 suites / 1,710 tests, 0 failures,
  0 skipped.
- Static checks are at baseline: tsc clean, 0 lint errors, migrations OK, and the
  single structure violation is pre-existing and provably not Analytics-introduced.
- No unresolved product defect is known.
- Automated browser certification could not run because the e2e harness requires a
  loopback Supabase that is not running and may not be started, and the only running
  app server serves a build without this work.

**Residual risk, stated plainly.** Everything asserted above is deterministic:
contracts, catalog/exposure, query validation, adapters, cache/coalescing/limiter,
rendering, CSV, refinement and exploration logic are all exercised by unit and
component tests, including component-level tests that drive the real dashboard and
the real chart components. What has **not** been exercised is the assembled
application in a browser against a live database: real authentication, server-component
rendering of `/analytics`, actual network round-trips, genuine file downloads, and
real CSS layout. The most likely failure mode that could survive this gap is
integration-level or visual (a wiring or layout problem), not logical.

**Recommended before or immediately after release:** bring up the local Supabase test
stack when convenient and run
`npx playwright test tests/e2e/analytics-insight-cd3a-cert.spec.ts`, extending it
narrowly for the inclusive end date, comparison, CSV, drill-down and save-as-new
flows. That is the one gap between this recommendation and an unqualified
"ready to release".

## 8. Verification boundaries — stated explicitly

- **Docker was not used and was never started.** No container, no `supabase start`,
  no `supabase:test:start`, no infrastructure repair, no substitute database.
- **The full repository test suite was not run.** No bare `npm test`, no equivalent
  whole-inventory command.
- **Only targeted Analytics tests were run** — the four bounded batches in §4.
- **Playwright was not executed.** Only the non-running `--list` invocation was used,
  to confirm the targeted spec is intact. The full Playwright suite was not run.
- Environment discovery used passive probes only (HTTP reachability, process
  inspection); nothing was started to make a check pass.

## 9. Files and commits

This batch adds this document only. The certified arc, in order:

| Commit | Slice |
|---|---|
| `fb39f3834` | Analytics arc reconciliation (baseline) |
| `f2bb2b054` | CD-4D HubSpot Deals — blocked certification + harness |
| `e4defc546` | Stripe Payments — blocked certification + harness |
| `cf7d11c34` · `d65a6da6a` · `91e80fa1e` · `4f4add6b3` · `66707ea87` | CD-5A dates, comparison, CSV, tests, outcome |
| `6495a1d09` · `05c0987cc` · `a9b9ad2ed` · `646ca838d` · `f95fdd3c5` | CD-5B refinements, exploration UI, save-as-new, tests+fixes, outcome |

No migration, no `db:push`, no push, no PR, no deployment, no production change, no
provider scope or exposure change, and no new provider dataset. The Analytics arc
remains entirely local pending the owner's release decision.
