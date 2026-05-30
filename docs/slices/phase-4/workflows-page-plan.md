# Slice 4.WORKFLOWS-PAGE-1 — Workflows page from the design file

**Date:** 2026-05-30
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Workflows dashboard page only. No global app shell; no Workflow Builder /
React Agent / planner / provider-metadata / workflow-execution / billing changes; no
general app-help assistant. Use existing lifecycle APIs only — no faked actions.

## Design source

Claude Design handoff bundle (gzip/tar):
- `chainv2builder/README.md` — handoff instructions (read first).
- `chainv2builder/project/Workflows.html` + the readable `src/` JSX
  (`workflows-app.jsx`, `workflows-page.jsx`, `workflows-data.jsx`).

The design's intent: a clean, dense workflows dashboard with stat cards, a searchable
+ filterable automations table with per-row status toggle / provider chips / last-
changed / run stats, a folders tab, and a global icon sidebar + top bar.

## Decisions locked with the user (before implementation)

1. **App-shell scope = page content only.** V2 has no global sidebar / top bar today;
   building one is deferred to a future app-shell slice. This slice implements the page
   body inside the existing `/workflows` route.
2. **Per-row data = build proper workflow summary data** — server-side, no client N+1
   and no mock data.
3. **Status toggle = live + confirmation (non-optimistic).** Inline toggle calls the
   existing `activate` / `pause` / `resume` APIs; status only flips AFTER the API
   confirms success. Activation that returns `CONFIRMATION_REQUIRED` opens a typed-
   confirmation dialog. Readiness failures show an "Open builder" escape hatch.
4. **Provider chips derive ONLY from `node.provider` / `node.kind`** — never config.
5. **Run stats are LIFETIME aggregates.** Copy never implies "today" / "24h".
6. **No fake delete / duplicate** — those endpoints don't exist; we don't render them.

## Implemented vs deferred (design → V2)

| Design element                          | This slice                                                  |
|---|---|
| Page header / title / subtitle          | ✅ `<h1>Workflows</h1>` + "Showing X of Y" real counts       |
| Stat cards (4)                          | ✅ Running / Total / Total runs (lifetime) / Success rate (lifetime) |
| Search by name + provider               | ✅ Client filter on `name` + provider id/label              |
| Status filter (segmented)               | ✅ all / running / draft / paused / needs-attention         |
| List ↔ grid view toggle                 | ✅ Both render real data                                    |
| Create CTA → builder                    | ✅ Reuses existing `CreateWorkflowButton` + `createWorkflow` |
| Per-row name → builder                  | ✅ `<Link>` to `/workflows/[id]`                            |
| Per-row status pill                     | ✅ `WorkflowStatusBadge` via `displayStatus()` projection   |
| Per-row provider chips                  | ✅ Server-enriched `providers[]` w/ initials fallback       |
| Per-row "last changed"                  | ✅ Relative-time from `updatedAt`                           |
| Per-row "Ran N times · X% successful"   | ✅ Lifetime aggregates from `workflow_run_stats`            |
| Per-row inline status toggle            | ✅ Non-optimistic; activate/pause/resume + confirmation     |
| Per-row actions menu                    | ✅ Open / Activate / Pause / Resume (state-aware)           |
| Per-row Delete / Duplicate              | ❌ **Not rendered** — no API exists; not faked              |
| Empty / no-matches / loading / error    | ✅ All four states                                          |
| A11y (h1, links, button menu, no color-only status) | ✅                                              |
| Global icon sidebar + top bar           | ⏸️ **Deferred** to a future app-shell slice                  |
| Folders tab + Group-by-folder           | ⏸️ Deferred — no folder schema in V2                         |
| Bulk-select checkboxes / bulk ops       | ⏸️ Deferred — no bulk endpoints                              |
| Owner / team avatars / Starred          | ⏸️ Deferred — single-user model, no schema                   |
| Apps / Owner / Date filters             | ⏸️ Deferred — status + search cover the real facets          |
| Task-usage bar / theme toggle           | ⏸️ Deferred — billing UI / app-wide dark mode                |
| "Today runs" / time-bucketed stat       | ⏸️ Deferred — view is lifetime; no time-bucketed source      |

## Data source — "proper workflow summary data"

The `GET /api/workflows` route now returns enriched `WorkflowListItem[]`:

- **Providers** — derived server-side in [`_shared.ts:toWorkflowListItem`](../../../app/api/workflows/_shared.ts)
  via the new pure helper [`summarizeDefinition`](../../../core/workflows/definitionSummary.ts).
  Reads ONLY `node.provider` / `node.kind` — never `node.config`. The emitted payload
  is `{ id, label, iconUrl }`: provider id + `getProvider(id).displayName` +
  `providerIconUrl(id)`. Zero N+1 (the workflows record already loads `draft_definition`
  in `listByUser`).
- **Counts** — `triggerCount` / `actionCount` from the same helper.
- **Lifetime run aggregates** — new SQL view
  [`workflow_run_stats`](../../../supabase/migrations/20260529000000_workflow_run_stats_view.sql)
  (`WITH (security_invoker = true)`), aggregated from `workflow_runs` filtered to
  `is_test = false`. RLS on the underlying `workflow_runs` table (`auth.uid() = user_id`)
  applies row-by-row inside the view — **users only ever aggregate their own runs**.
  Repo: [`repositories/workflowRunStats.ts`](../../../repositories/workflowRunStats.ts).
  One grouped query for the whole list (no N+1).

Both reads run in parallel via `Promise.all` in the route handler.

`WorkflowListItem` **extends** `WorkflowSummary` (no breaking change for existing
consumers — `create` / `activate` / `pause` / `resume` etc. still return
`WorkflowSummary`). Only `listWorkflows()`'s return type widens.

## Route / page behavior

- `app/workflows/page.tsx` (server) — auth gate + `Promise.all([listByUser,
  getStatsForUser])` → maps to `WorkflowListItem[]` via `toWorkflowListItem` → passes
  to the client `<WorkflowsDashboard initialWorkflows={...}>`. No first-paint loading
  flash (server seeds data).
- `WorkflowsDashboard` (client) — owns search / status filter / view (list|grid) state,
  re-fetches via `listWorkflows()` after any lifecycle action (`refresh()` with
  single-flight dedup), renders loading / error / empty / no-matches / data states.
- `WorkflowStatusToggle` — Switch's `checked` is fully controlled by the latest
  workflow data; the API call resolves BEFORE `onChanged()` fires the dashboard
  refresh. No optimistic flip; no revert because nothing was changed.
- Activation that returns `CONFIRMATION_REQUIRED` opens
  `WorkflowActivateConfirmDialog` — user must echo the server's `confirmationText`
  verbatim, retry hits `activateWorkflow(id, { confirmationText })`. On other
  lifecycle failures (e.g. `MISSING_PRECONDITIONS`) → inline error + an "Open builder"
  link to `/workflows/[id]` so the user is never trapped.
- Actions menu (`WorkflowActionsMenu`) exposes Open + Activate / Pause / Resume only.

## Styling

App HSL tokens (`--background`, `--foreground`, `--muted-foreground`, `--border`,
`--primary`, plus `success` / `warning` / `destructive` Badge variants). **No
`--builder-*` tokens / `[data-builder-surface]`** — those are builder-only. App is
light-mode today; no theme toggle introduced.

## Files (this slice)

**Data layer** (server):
- `contracts/workflow.ts` — `WorkflowProviderChipSchema`, `WorkflowRunStatsSchema`,
  `WorkflowListItemSchema` (extends `WorkflowSummary`).
- `core/workflows/definitionSummary.ts` (NEW) — pure helper.
- `supabase/migrations/20260529000000_workflow_run_stats_view.sql` (NEW) —
  `security_invoker` view + grants.
- `repositories/workflowRunStats.ts` (NEW).
- `app/api/workflows/_shared.ts` — `toWorkflowListItem` mapper.
- `app/api/workflows/route.ts` — GET returns enriched items.
- `lib/api/workflows.ts` — `listWorkflows()` return type widens to `WorkflowListItem[]`.

**Frontend** (`features/workflows/`):
- `WorkflowsDashboard.tsx` (top-level client orchestrator).
- `WorkflowsStatCards.tsx`, `WorkflowsToolbar.tsx`, `WorkflowsEmptyState.tsx`.
- `WorkflowRow.tsx`, `WorkflowCard.tsx`.
- `WorkflowStatusBadge.tsx`, `WorkflowStatusToggle.tsx`,
  `WorkflowActivateConfirmDialog.tsx`, `WorkflowActionsMenu.tsx`,
  `WorkflowProviderChips.tsx`.
- `relativeTime.ts`, `formatRunStats.ts`.
- `CreateWorkflowButton.tsx` — kept (reused in toolbar + empty state).
- `WorkflowsList.tsx` (DELETED — superseded).

**Page**: `app/workflows/page.tsx` rewritten to seed the dashboard with enriched data.

## Tests

- `tests/unit/core/workflows/definitionSummary.test.ts` — pure helper; explicit
  no-config-leak assertion.
- `tests/unit/features/workflows/relativeTime.test.ts`, `formatRunStats.test.ts` —
  helpers; the run-stats test explicitly pins no "today"/"24h" copy.
- `tests/unit/features/workflows/WorkflowsStatCards.test.tsx` — derived counts /
  rates / lifetime copy.
- `tests/unit/features/workflows/WorkflowStatusToggle.test.tsx` — routes (pause /
  resume / activate / disabled-locked), non-optimistic (pending leaves state
  unchanged; failure does not revert), confirmation dialog flow (typed phrase +
  retry), readiness failure shows Open builder.
- `tests/unit/features/workflows/WorkflowsDashboard.test.tsx` — render with data,
  empty / no-matches, search + status filter + view toggle, refresh after toggle
  (loading), error with Retry, Create CTA → create + navigate, row link →
  `/workflows/[id]`, actions menu omits Delete / Duplicate, a11y basics.

Deleted: `tests/unit/features/workflows/WorkflowsList.test.tsx` (component retired).

## Boundaries

- No Workflow Builder / React Agent / planner-model routing / provider-metadata /
  workflow-execution-semantics / billing changes. Run stats are read-only execution
  data; no billing writes.
- No general app-help assistant. No global theme toggle. No global app shell.
- No faked Delete / Duplicate actions.
- Explicit path staging only; do not stage `scripts/trash/*.mjs` or any in-progress
  REACT-AGENT-CHAT-QOL-1 working-tree files. **Not pushed.**

## Gate results

- `npx tsc --noEmit` — ✅ clean
- `npm run lint -- --max-warnings=0` — ✅ clean
- `npm run lint:structure` — ✅ every leaf folder ≤ 50 files
- `npm run lint:migrations` — ✅ migration RLS check passes (view migration has no CREATE TABLE; underlying table RLS gates the view via `security_invoker`)
- Targeted workflows sweep: ✅ 8 suites / 45 tests
- Workflow-builder regression sweep: ✅ 82 suites / 1,274 tests (no regression)
- **Full project sweep: ✅ 14,701 passed / 17 skipped / 0 failed (+32 vs prior baseline of 14,669 — matches the net new tests: +36 added, −4 from the retired `WorkflowsList.test.tsx`)**
