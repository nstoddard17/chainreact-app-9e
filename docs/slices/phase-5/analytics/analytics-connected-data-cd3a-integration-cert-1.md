# ANALYTICS-CONNECTED-DATA-CD-3A-INTEGRATION-CERT-1 — Integration + browser certification (outcome)

**Type:** Integration + certification. No migration; no `db:push`; nothing
pushed/deployed; Stripe remains non-public. **Date:** 2026-07-25
**Worktree:** `C:/tmp/cd3a-cert-wt`, branch `cd3a-integration-cert`

## Integration

- **Starting `v2-main`:** `c9291aa27` (3 commits ahead of CD-3A's original base
  `7cf122d16` — builder view-default, invitation-email docs, builder header
  tabs; none touch Analytics). CD-3A commit `c31d9e5cb` was **not** reachable
  from `v2-main`.
- **Cherry-pick:** `c31d9e5cb` → `d753d32bd` applied **clean — zero conflicts**
  (identical 50-file, +5,937/−29 diff). No parallel work touched; the main
  working tree's uncommitted workflow-builder/invitations WIP was inspected and
  left alone.
- **Diff inspection:** analytics-only paths + the series palette tokens in
  `app/globals.css`. Confirmed absent: Stripe production exposure (catalog says
  `exposure: "preview"`), provider-name branches in the builder (only a doc
  comment mentions Stripe), account/user/integration ids in widget config
  (strict-schema tested), preview-result persistence, raw scopes in the client
  projection (string-scan tested), raw provider errors, DB/migration changes,
  unrelated parallel-session files.
- **Deterministic verification on the integrated base:** `npx tsc --noEmit`
  clean · analytics + contracts regression tree **113 suites / 1,494 tests
  green** · `npm run lint` 0 errors (pre-existing warnings only) ·
  `npm run lint:migrations` clean · `npm run lint:structure` **fails at the
  BASE**: `docs/slices/phase-5` holds 51 root files, all committed by parallel
  arcs before this batch (this batch adds docs only under
  `docs/slices/phase-5/analytics/`). Left for the owning arcs per the
  established baseline rule.

## Browser environment

Real app, real auth, real persistence: `next dev` on `localhost:3001` against
**local Supabase** (Docker; loopback `127.0.0.1:54321`) with all repo
migrations applied via `supabase db reset`, driven by Playwright 1.59.1 /
Chromium through the repo's own e2e harness (`.env.test.local`, service-role
fixture seeding, `signInViaEmailLink`). Fixtures per run: one throwaway owner
user (+ one member user where reached), 3 workflows ("Daily digest", "Lead
sync", "Report mailer") with ~57 runs spread over the last 14 days plus a
previous-period batch 31–44 days back, mixed succeeded/failed and
webhook/scheduled/manual — deleted by the spec's `afterAll`. No production
system was touched; no provider-side records exist.

**Environment caveat that shaped this batch:** Docker/WSL was unstable on the
dev machine. One approved repair (`wsl --shutdown` + Docker Desktop restart)
brought it up long enough for the runs below; it then failed again and Marcus
directed the batch to proceed **without Docker**, which ended browser
execution. The certification spec
([analytics-insight-cd3a-cert.spec.ts](../../../../tests/e2e/analytics-insight-cd3a-cert.spec.ts))
is committed and re-runnable as-is once the local stack is healthy.

## Certification results

### ✅ Browser-certified (real app, green run)

**Core creation flow — the batch's §4 journey passed end-to-end** (run 7,
test 1, 11.0s):

1–5. Analytics → owner edit mode → Add a widget → "Custom insight" entry with
connected-business-data copy ("Build a chart from ChainReact or one of your
connected apps.") → builder opens.
6–10. First meaningful decision is **App** ("Where is the data from?" + guided
empty-state copy); ChainReact → Workflow runs → Runs; the guided default
completes as an ungrouped Number with "No grouping — one number" and "Number"
visibly selected — the question is displayed, not silently altered. **Zero
preview requests were sent before the question was complete** (asserted by
request counting).
11. Real preview: `POST /api/analytics/insights/query` → 200; the KPI value and
"Live ChainReact data" rendered in the panel.
12–15. Apply → Done editing (one atomic PATCH) → reload → the widget
**re-queried the byte-exact persisted question** (request body asserted equal
to `{source:"chainreact",dataset:"workflow_runs",measure:"runs",dimension:null,
range:{preset:"30d"},chart:"kpi"}`) and rendered.
16–22. Re-edit (panel rehydrates the saved selections) → change to Failed runs
over time (line chart auto-selected) → Apply → resize to 3×1 → reorder to
first position (HTML5 drag events) → save → reload asserts the updated
persisted question → remove → **sibling widgets intact and widget count back
to baseline**.

Also browser-evidenced (screenshots + a debug run's DOM/network capture):

- **Exposure & connection (dev):** Stripe renders in the dev source list with
  an explicit **Preview** badge and **Not connected** chip; ChainReact shows no
  connection chrome (screenshot `01-builder-preview.png`).
- **Catalog-driven controls render live:** measures, grouping chips, the
  workflow entity picker (fed by the account's real workflow list), declared
  status/trigger-source value lists, the boolean test-runs filter, time
  presets + Custom, compare checkbox, chart chips — all present from catalog
  metadata (debug DOM capture).
- **KPI zero-state:** a run-less account previews `0` (counts are zero, not
  "—") with "Live ChainReact data".
- **Route responses:** the insights query route returned typed 200 results in
  the browser; server logs stayed clean through the passing run.

### ⚠️ Browser-blocked (environment died; certified in jsdom only)

Tests 2–9 of the committed spec never completed a green browser pass before
Docker was retired: KPI formatting matrix + neutral comparison, line-chart
series/legend/tooltip/keyboard/data-table, in-browser reconciliation walk,
crafted-request exposure checks, 5-width responsive sweep, reduced-motion +
refresh-storm check, member read-only, malformed-widget salvage. Every one of
these behaviors has deterministic RTL/unit coverage (the 162-test CD-3A suite
inside the 1,494-test regression tree), and the spec encodes the browser
version of each — **run the spec to convert these to browser-certified when
the local stack is back.**

Two near-misses worth recording: run 7's KPI test failed only because the
original fixture seeded no previous-period runs (the KPI honestly rendered
"Up from zero in the previous period" — correct behavior, wrong fixture; the
spec now seeds a prior window). Production-mode exposure was additionally
proven by direct execution on the integrated tree:
`buildClientAnalyticsCatalog({environment:"production"})` → `["chainreact"]`;
development → `chainreact:public, stripe:preview`; plus the unit-tested
orchestrator gate (preview-in-production ≡ unknown source, byte-identical
copy).

## Defects found and fixed during certification

1. **Series reset note could vanish with its step** (found while writing the
  CD-3A tests, fixed in `c31d9e5cb`): when a measure change removes the series
  capability entirely, the explanation now renders standalone instead of
  unmounting with the series step.
2. **No CD-3A product defects were found by the browser runs.** All browser
  failures traced to: a stale local-DB volume missing the CS-1 RPC (fixed with
  `supabase db reset`), dev-server on-demand compile latency (spec warms the
  route), Playwright's mouse-drag not driving HTML5 dnd (spec now dispatches
  drag events — the reorder mechanic itself is pre-existing ANALYTICS-1
  chrome and works), an empty previous-period fixture, and Docker/WSL dying.

## UX findings (owner's-eye review of the real UI)

Good: the App-first question reads immediately; steps are short and labeled in
plain language; the guided default (measure → instant number preview) makes
the panel feel alive; Stripe's Preview/Not-connected state is honest at a
glance; the preview and the saved widget are visibly the same rendering.

Minor recommendations (deferred, not CD-3B blockers): the Preview panel sits
below the fold once filters render — consider auto-scrolling it into view or
pinning it; the measure chip row wraps unevenly at narrow widths; "Only
include" could show a one-line hint when no filters are set. Documented here
rather than patched — none block comprehension.

## Commands & evidence (all actually run)

- `git merge-base --is-ancestor` / worktree add / cherry-pick (clean).
- `npx tsc --noEmit` (integrated tree + spec): clean, twice.
- `npm test -- tests/unit/features/analytics tests/unit/services/analytics
  tests/unit/app/api/analytics tests/unit/contracts`: **113 / 1,494 green**.
- `npm run lint` (0 errors) · `lint:migrations` (clean) · `lint:structure`
  (fails at base: pre-existing phase-5 51-file violation).
- `supabase start` + `supabase db reset` (local throwaway DB only).
- Playwright cert spec: multiple runs; final state = test 1 **passed**, tests
  2–9 blocked by environment loss (details above). Artifacts:
  `C:/tmp/cd3a-cert-artifacts/*.png`.
- **Full repository `npm test` NOT run — per Marcus's standing direction.**

## Verdict on CD-3B

**Conditionally ready.** The integration is clean, every deterministic suite is
green on the current base, the certification spec exists, and the end-to-end
creation journey — the flow CD-3B builds on — is browser-certified with zero
product defects found. Recommendation: **CD-3B may begin.** Run
`npx playwright test tests/e2e/analytics-insight-cd3a-cert.spec.ts` to finish
converting tests 2–9 to browser-certified as soon as Docker/local Supabase is
stable — before shipping CD-3B, and before any production push of the
analytics arc.

## Commits / status

- `d753d32bd` — the integrated CD-3A implementation (cherry-pick of
  `c31d9e5cb`).
- (this batch) — certification spec + this document.
- **Nothing pushed. No PR. No deploy. No migration. No `db:push`. Stripe not
  exposed. CD-3B not started.** Fixture users/workflows existed only in the
  throwaway local DB.
