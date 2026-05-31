# Slice 4.RUNS-PAGE-1 — Runs / Activity page

**Date:** 2026-05-30
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Read-only `/runs` page that surfaces the user's workflow
run history. Adds a Runs nav item to the authenticated app shell.
**Not in scope:** account/workspace ownership changes (parallel chat
owns that foundation), billing/tasks, workflow execution semantics,
provider metadata, Workflow Builder behavior, React Agent behavior.
No new mutation surfaces.

## Decisions locked

1. **Route:** `/runs`. Short, stable, plural noun — matches the
   product language of "a list of runs," reads cleanly alongside
   `/workflows` and `/apps`.
2. **Page label:** "Runs". Same word as the route; matches the
   schema column terminology (`workflow_runs`). Considered "Activity"
   (Anthropic Design idiom) and "Run History" but Runs is shorter
   and self-explanatory without a sub-label.
3. **Read-only.** No row-level mutation, no Retry / Replay / Cancel
   CTAs. Those would need server APIs that don't exist on V2 yet,
   and the slice + page guide both forbid fake action affordances.
   The canonical "run this workflow again" path lives in the
   Workflow Builder via Run-Now.
4. **Test-mode runs hidden by default.** `is_test=true` rows are
   developer noise on a user-facing surface. The toolbar's "Include
   test runs" toggle reveals them on demand.
5. **DTO scope: minimal-and-safe.** The wire shape (`RunListItem`)
   strips `userId`, `triggerEvent`, `steps`, `fatalError`, and every
   billing column. Only `errorClassification` (the humanized,
   user-facing shape) is exposed for failure context.
6. **No standalone run-detail page in V2 yet.** The row links the
   workflow name to `/workflows/{id}` (the builder — a real V2
   route). No "View details" CTA, no link to a run-detail URL that
   doesn't exist.
7. **Nav order:** Workflows → Apps → Runs. Product flow: build →
   connect → observe.

## Design source

No `Runs.html` / `Activity.html` / `Analytics.html` design file is
present in the workspace. The page therefore reuses the dark
dashboard layout/style of [`features/workflows/WorkflowsDashboard.tsx`](../../../features/workflows/WorkflowsDashboard.tsx):
sticky `bg-card border-b` top bar (provided by `AppShell`) + page
header (h1 + subtitle) + sticky toolbar + list. Components mirror the
Workflows-page atoms (`WorkflowStatusBadge` → `RunStatusBadge`,
`WorkflowsToolbar` → `RunsToolbar`, `WorkflowsEmptyState` →
`RunsEmptyState`).

## Implemented vs deferred

| Element                                  | This slice                                                                                                    |
|------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Recent runs list                         | ✅ Server-fetched `workflow_runs` (terminal-only) joined with workflow names; ordered by `started_at DESC`, capped at 50 (repo caps at 200). |
| Per-row status pill                      | ✅ `RunStatusBadge` — `Succeeded` / `Failed`. Closed-set; running rows are filtered out by the repo.            |
| Per-row source label                     | ✅ `RunSourceBadge` — Manual / Webhook / Scheduled / Retry / Test. `unknown` renders as `—`.                    |
| Per-row workflow name (linked)           | ✅ Links to `/workflows/{id}` (builder). Soft-deleted workflows still show their name (better than "Untitled"). |
| Per-row started/duration                 | ✅ Relative-time label for start (`5m ago` / `3h ago` / locale date past a week). Compact duration (`912ms` / `1.4s` / `2m 14s`). |
| Per-row humanized error                  | ✅ `errorClassification.{title, description, hint, severity}` rendered inline. `action` is **not** used for a CTA (page guide §4). |
| Test-mode marker                         | ✅ Amber `Test` chip; only renders when `isTest=true`.                                                          |
| Search                                   | ✅ Case-insensitive contains-match on workflow name.                                                            |
| Status filter                            | ✅ All / Succeeded / Failed (tab strip).                                                                        |
| Source filter                            | ✅ Any / Manual / Webhook / Scheduled / Retry (select).                                                         |
| Include-test-runs toggle                 | ✅ Default OFF — test-mode rows hidden until opted in.                                                          |
| Refresh button + Retry banner            | ✅ Single-flight refresh via `/api/runs`; failure surfaces an inline alert with Retry.                          |
| Empty states                             | ✅ `no-runs` (zero rows) + `no-matches` (filters yielded nothing).                                              |
| Nav item                                 | ✅ Workflows → Apps → Runs in the left rail.                                                                    |
| Workflow picker filter                   | ⏸️ Deferred — redundant with the search-by-name field.                                                          |
| Date-range filter                        | ⏸️ Deferred — needs a date-input primitive we haven't shipped.                                                  |
| Standalone run-detail page               | ⏸️ Deferred — no V2 route exists; would need its own slice with the per-step output / trigger-event UI. |
| Retry / Replay / Cancel action           | ❌ Not rendered — no real APIs; would be fake CTAs.                                                            |
| Success-rate / time-series charts        | ❌ Not rendered — slice guard forbids fake analytics.                                                          |
| AI insights / cost metrics               | ❌ Not rendered — billing/tasks are explicitly out of scope.                                                   |
| Team / account / workspace filters       | ❌ Not rendered — account-ownership model is being built in a parallel chat.                                   |

## Data source

The Runs page reads from the existing `workflow_runs` table — the
same source the Workflow Builder's run history uses. Two parallel
SSR-cookie reads gated by RLS:

1. `workflowRunsRepo.listByUserForDisplay(userId, { limit: 50 })`
   — new helper in [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts).
   SELECT enumerates only the safe display columns (`id`,
   `workflow_id`, `status`, `is_test`, `triggered_by`, `started_at`,
   `finished_at`, `error_classification`). Filters
   `user_id = $userId` (defense-in-depth alongside the
   `workflow_runs_select_own` RLS policy) and `status != 'running'`
   (display contract is terminal-only). Hard-cap at 200.
2. `workflowsRepo.listNamesByIds(workflowIds)` — new helper in
   [`repositories/workflows.ts`](../../../repositories/workflows.ts).
   `SELECT id, name FROM workflows WHERE id IN (...)`. One query
   for all referenced workflow ids — no per-row N+1, no
   `draft_definition` blob pulled. RLS still gates by user.

The route handler `GET /api/runs` ([`app/api/runs/route.ts`](../../../app/api/runs/route.ts))
runs both reads and joins them via the safe `toRunListItem` mapper
([`app/runs/_shared.ts`](../../../app/runs/_shared.ts)). The page
server component calls the same repo helpers directly so the first
paint has no client round-trip.

## Route-safe DTO shape

```ts
// contracts/workflow.ts
export const RunListItemSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowName: z.string(),
  status: WorkflowRunStatusSchema,            // succeeded | failed
  isTest: z.boolean(),
  triggeredBy: WorkflowRunTriggeredBySchema,  // manual | test | webhook | scheduled | retry | unknown
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),          // computed server-side
  errorClassification: HumanizedErrorSchema.nullable(),
});
```

Excluded by design:
- `userId` — always the calling user.
- `triggerEvent` — raw upstream payload (webhook bodies, schedule
  metadata, manual run inputs); contains secrets / PII.
- `steps` — per-step node output; contains secrets / PII.
- `fatalError` — engine-internal code/message; the humanized
  `errorClassification` is the user-facing surface.
- All billing columns (`reserved_task_cost`, `actual_task_cost`,
  `reservation_*`, `billing_*`) — out of scope.

The repository's `listByUserForDisplay` enforces the same column
boundary at the SELECT layer; the mapper at the route layer is the
second wall. The test
[`tests/unit/repositories/workflowRuns.listByUserForDisplay.test.ts`](../../../tests/unit/repositories/workflowRuns.listByUserForDisplay.test.ts)
pins the column list explicitly, and
[`tests/unit/app/runs/_shared.test.ts`](../../../tests/unit/app/runs/_shared.test.ts)
asserts the mapper output validates against
`RunListItemSchema` and contains none of the banned fields even when
the source row carries them.

## Account-ownership caveat

The page uses the existing `workflow_runs.user_id` scope. When the
account-ownership foundation (Slice 4.ACCOUNT-MODEL series, parallel
chat) cuts the workflow + integration ownership over to
`account_id`, the run-history scope expands from "my runs" to "runs
across this account." Two follow-up touches will be needed:

1. `repositories/workflowRuns.ts:listByUserForDisplay` — swap the
   `.eq("user_id", userId)` predicate for an account-scoped one
   (most likely `.in("account_id", accountIds)`) once the column
   reaches `workflow_runs`.
2. `repositories/workflows.ts:listNamesByIds` — same scope swap,
   though `IN (workflowIds)` already RLS-narrows to the user, so this
   touch is purely a naming alignment.

The route DTO + every UI component stays shape-stable across that
change.

## Nav update

| Position | Item       | Href         | Icon       |
|----------|------------|--------------|------------|
| 1        | Workflows  | `/workflows` | `Bolt`     |
| 2        | Apps       | `/apps`      | `Layers`   |
| 3        | **Runs**   | `/runs`      | `Clock` ★  |

The `Clock` icon is a new monoline SVG defined inline in
[`components/app-shell/navItems.tsx`](../../../components/app-shell/navItems.tsx)
(no new icon dependency added). Active-state matching follows the
existing prefix-with-segment-boundary rule; a `/runs/anything` sub-
route would highlight the parent automatically.

Notifications still stays out of the rail — the top-bar
`NotificationBell` is the canonical entry point.

## Files (this slice)

**New — server side:**
- `app/runs/page.tsx` — thin server component (auth + parallel
  fetch + DTO map + AppShell wrap).
- `app/runs/_shared.ts` — `toRunListItem` mapper +
  `RUN_LIST_DEFAULT_LIMIT`.
- `app/api/runs/route.ts` — `GET /api/runs` for client refresh.

**New — client side:**
- `features/runs/RunsDashboard.tsx` — top-level client orchestrator
  (state + filters + refresh).
- `features/runs/RunsToolbar.tsx` — search + status + source +
  include-test toggle + Refresh.
- `features/runs/RunRow.tsx` — single row (status / workflow name /
  source / test marker / time / duration / humanized error).
- `features/runs/RunStatusBadge.tsx` — succeeded / failed pill.
- `features/runs/RunSourceBadge.tsx` — Manual / Webhook / …
  uppercase chip + the shared `SOURCE_LABELS` map.
- `features/runs/RunsEmptyState.tsx` — `no-runs` + `no-matches`.
- `features/runs/formatRunDuration.ts` — compact duration + relative
  start-time helpers.
- `lib/api/runs.ts` — typed `listRuns()` + `RunApiError`.

**Updated:**
- `contracts/workflow.ts` — adds `WorkflowRunTriggeredBySchema`,
  `RunListItemSchema`, `RunListItem` (and the matching `type`).
- `repositories/workflowRuns.ts` — adds
  `listByUserForDisplay(userId, opts)` +
  `WorkflowRunDisplayRecord`.
- `repositories/workflows.ts` — adds `listNamesByIds(ids)`.
- `components/app-shell/navItems.tsx` — adds the Runs nav entry +
  `NavIconClock` glyph.

**Tests (new):**
- `tests/unit/repositories/workflowRuns.listByUserForDisplay.test.ts`
  — pins the safe column SELECT + filter + order + cap + the
  snake→camel mapping (no leakage of banned fields). 5 tests.
- `tests/unit/app/runs/_shared.test.ts` — `toRunListItem` mapping,
  duration math, fallback name, schema-conformance, no banned
  fields. 10 tests.
- `tests/unit/app/api/runs/route.test.ts` — 401 / envelope / name
  dedupe / `?limit=` parsing. 6 tests.
- `tests/unit/lib/api/runs.test.ts` — URL shape, error mapping,
  envelope unwrap. 5 tests.
- `tests/unit/features/runs/formatRunDuration.test.ts` — 12 tests
  (duration + start-time helpers).
- `tests/unit/features/runs/RunStatusBadge.test.tsx` — 2 tests.
- `tests/unit/features/runs/RunsEmptyState.test.tsx` — 2 tests.
- `tests/unit/features/runs/RunRow.test.tsx` — 6 tests (link /
  source / test marker / error block / null error / null duration).
- `tests/unit/features/runs/RunsDashboard.test.tsx` — 11 tests
  (empty / list / filters / refresh / retry / no-fake-actions).

**Tests (updated):**
- `tests/unit/components/app-shell/navItems.test.ts` — Runs added
  to the `["/workflows", "/apps"]` expectation; new pin that the
  `/runs` entry exists with id/label.
- `tests/unit/app/AppShellRouteScope.test.tsx` — mocks
  `@/repositories/workflowRuns` + adds `listNamesByIds` to the
  workflows mock; new INCLUDED case `/runs renders AppShell`.

## Manual QA checklist

- `/runs` → AppShell renders; left rail shows Workflows / Apps /
  Runs with Runs highlighted; top bar shows the page-context label
  "Runs" + the notification bell + the user menu.
- `/runs` empty state → "No runs yet" copy; no fake rows.
- `/runs` with real runs → ordered newest-first; status pills
  reflect real status; workflow names link to `/workflows/{id}`.
- Search by workflow name → row count drops.
- Status filter "Failed" → only failed rows.
- Source filter "Webhook" → only webhook-triggered rows.
- Include-test-runs OFF → no `Test` chips; ON → test rows visible.
- Refresh → triggers `/api/runs`; banner shows error + Retry when
  the route fails.
- `/workflows`, `/apps`, `/notifications`, `/` (marketing),
  `/workflows/[id]` (builder) — all unchanged.

## Gate results

- `git branch --show-current` — `builder-ui-v1-audit-1`
- `npx tsc --noEmit` — see Verification §
- `npm run lint -- --max-warnings=0` — see Verification §
- `npm run lint:structure` — see Verification §
- `npm run lint:migrations` — see Verification § (no migrations
  added in this slice)
- Targeted runs tests, app-shell tests, workflows + apps + homepage
  + builder tests — see Verification §

## Boundaries (confirmed)

- No account-ownership change (workflow_runs scoping kept at
  `user_id`; future cutover documented above).
- No workflow ownership change.
- No RLS change.
- No billing/tasks change.
- No workflow execution semantics change.
- No provider metadata change.
- No Workflow Builder change (`features/workflow-builder/**`,
  `app/workflows/[id]/**` untouched).
- No React Agent change.
- No AI planner / model-tier routing change.
- No fake nav items.
- No fake analytics / charts / metrics.
- No fake row-level actions.
- No push.
- Explicit-path staging only.

## Follow-up slices (out of scope)

- **RUNS-DETAIL-1** — standalone `/runs/[runId]` page when product
  asks for per-step output + trigger-event preview outside the
  builder.
- **RUNS-DATE-FILTER-1** — date-range filter after the date-input
  primitive ships.
- **RUNS-ACCOUNT-SCOPE-1** — swap `user_id` to `account_id` once
  the parallel account-ownership foundation lands.
