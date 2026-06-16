# V2-READY-41 — Active Revision Model Closeout & Release Gate

**Type:** Docs + tests closeout / release gate. One regression test added
(publish route); no product behavior changed in this slice (41J).
**Date:** 2026-06-15
**Branch:** `v2-main` (**local — NOT pushed; NOT in production**)
**Arc:** 41A feasibility → 41B read/write foundation → 41C trigger registration
from the captured active revision → 41D flag-on parity/drift tests → 41E live vs
draft/test execution semantics → 41F paused-resume drift fix → 41G Publish +
unpublished-changes UX → 41H removed the rollout flag (active revision is the real
product behavior) → 41I `workflow_runs.revision_id` attribution → **41J this
closeout + release gate**.

> **Status flags / migration / push:**
> - **No feature flag.** `ENABLE_ACTIVE_REVISION_EXECUTION` was **removed** in 41H;
>   active-revision execution is the unconditional product behavior.
> - **Migration applied to the V2 dev DB only:**
>   `20260626000000_workflow_runs_revision_id.sql` (41I, `npm run db:push`).
>   **Not applied to production** (the arc is unpushed).
> - **Nothing pushed.** `origin/v2-main` does not contain 41A–41J. This arc must be
>   deployed as a verified batch (incl. the dev-DB migration → prod) before it is live.

---

## 1. Product invariant (the contract this arc guarantees)

- **Draft edits are not live.** Editing the builder mutates `draftDefinition`; an
  active workflow keeps running its frozen active revision until Publish.
- **Active workflows run the active/published revision** — `getDefinitionForExecution`
  with `mode: "live"` resolves the immutable revision the workflow's
  `active_revision_id` points at.
- **Test/preview runs the draft** — `mode: "draft"` always returns `draftDefinition`,
  regardless of any revision.
- **Publish makes the persisted draft live** — snapshots the current draft into a new
  immutable `workflow_revisions` row and repoints `active_revision_id` (state stays
  `active`; not a lifecycle transition).
- **Trigger resources match the active revision** — registration always runs from the
  same definition that is snapshotted (activate / resume-on-drift / reactivate), so
  `trigger_resources` can never dispatch against a graph different from the active
  revision.
- **Runs record the revision they executed** when one exists —
  `workflow_runs.revision_id` is stamped at the pre-run row for live runs;
  draft/test/legacy/fallback runs store `NULL`. It is an internal pointer, never
  exposed by a run API.

The single resolution seam is
[`services/workflows/activeRevision.ts`](../../../../services/workflows/activeRevision.ts)
(`getDefinitionForExecution` / `getActiveDefinition` / `hasDraftDrift`). Live
consumers are exactly two: the engine
([`services/execution/engine.ts`](../../../../services/execution/engine.ts)) and the
run-now route. The safe draft fallback (null / dangling `active_revision_id` → draft)
lives inside `getActiveDefinition`, independent of any caller.

---

## 2. Closeout scenario matrix

Every release-gate scenario maps to existing, passing automated coverage. The one
gap found in 41J (publish **route** contract) was filled with a new test.

| # | Scenario | Proven by | Status |
|---|----------|-----------|--------|
| 1 | **Activate** snapshots draft → revision, registers triggers from the SAME def, sets `active_revision_id` (no orphan on register failure; safe fallback on snapshot failure) | `lifecycleOrchestrator.test.ts` → "active revision wiring (V2-READY-41C)" (register→snapshot→apply order; no-revision-on-register-failure; snapshot-failure fallback; rollback on persist conflict) | ✅ existing |
| 2 | **Draft edit while active**: live still runs the active revision; draft/test runs the draft; `unpublishedChanges` → true | `engine.test.ts` ("executes the active revision graph, NOT the drifted draft"); `activeRevision.test.ts` (mode resolution); `runNow-route.test.ts` (live vs draft mode); `_shared.test.ts` ("active + drift → unpublishedChanges true") | ✅ existing |
| 3 | **Publish**: new revision, repoints `active_revision_id`, no-op when no drift; `unpublishedChanges` clears; live then uses the new revision | `lifecycleOrchestrator.test.ts` → "publish (V2-READY-41G)" (snapshot+repoint; no-op on no-drift; reject non-active; snapshot-failure no-repoint); `_shared.test.ts` ("no drift → false"); **`publish-route.test.ts` (NEW — route auth + WF-RUNPERM + 409 mapping)** | ✅ existing + **NEW** |
| 4 | **Trigger edit while active**: activatable-trigger change auto-deactivates; reactivate republishes + registers cleanly | `saveDraftDefinition.test.ts` (deactivate only on activatable-trigger change; action/manual edits stay active); `lifecycleOrchestrator.test.ts` (resume from `eligible_to_resume` re-registers + snapshots) | ✅ existing |
| 5 | **Pause/resume**: no-drift resume does not duplicate resources/revisions; drift resume republishes + re-registers | `lifecycleOrchestrator.test.ts` → "resume — paused drift (V2-READY-41F)" (drift: unregister→register→snapshot→repoint; no-drift: nothing; register-fail stays paused; persist-conflict rollback) | ✅ existing |
| 6 | **Run attribution**: live runs store `revision_id`; draft/test/legacy store NULL; run APIs never expose revision definitions | `engine.test.ts` → "revision attribution (V2-READY-41I)" (live/test/legacy-null/dangling/all-trigger-sources); `workflowRuns.test.ts` (createWorkflowRunStart stamps id; `getById` no-leak) | ✅ existing |
| 7 | **Legacy fallback**: null/dangling `active_revision_id` runs safely from the draft; safe warn, no leak | `activeRevision.test.ts` (null → draft fallback w/o revision read; dangling → draft fallback + `workflow.active_revision.missing` warn carrying workflow id only, asserts no account/user/config leak); `engine.test.ts` (legacy-null + dangling store NULL) | ✅ existing |
| 8 | **Trash/restore/template-replace**: no stale revision/resources fire after inactive/trashed state; restore does not auto-reactivate | `dispatch.test.ts` (state gate drops `paused/disabled/eligible_to_resume/draft/deleted` + null-row); `templateReplace.test.ts` (active workflow → disabled via orchestrator, tears down `trigger_resources`); `lifecycleOrchestrator.test.ts` (restore → `draft`, clears trash columns, **does NOT register triggers**; delete → best-effort unregister) | ✅ existing |

**Key safety property (scenario 8):** even if `trigger_resources` lag a state change,
the dispatcher gates on **live workflow state** (`getStateForDispatch !== "active"` →
drop) before enqueuing — so a trashed/disabled/template-replaced workflow with a stale
active revision can never fire.

---

## 3. Gaps found / fixed in 41J

- **Publish route had no route-level test.** Orchestrator `publish()` was covered, but
  the HTTP route (`POST /api/workflows/[id]/publish`) — membership authorization,
  WF-RUNPERM creator gate, and `LifecycleError → HTTP` mapping — was not. Added
  [`tests/unit/app/api/workflows/publish-route.test.ts`](../../../../tests/unit/app/api/workflows/publish-route.test.ts)
  (5 tests): non-member → 404 (no existence leak, orchestrator never called);
  non-creator member + private-credential draft → 403 (WF-RUNPERM); creator+member →
  200 + definition-free summary; non-active → 409 `INVALID_TRANSITION`; unauthenticated
  → 401.

No product gaps were found — no behavior was changed in 41J.

---

## 4. Security / no-leak posture

- `workflow_runs.revision_id` is an **internal attribution pointer**. It is NOT mapped
  by `rowToRecord` / any run display/detail DTO and is absent from the display-column
  allow-list (`DISPLAY_RUN_COLUMNS`). No run API returns it or any revision/draft graph.
  Proven by `workflowRuns.test.ts` "does NOT expose revision_id on the run record".
- Dangling-revision fallback logs `workflow.active_revision.missing` with the **workflow
  id only** — no account id, user id, or config — asserted by `activeRevision.test.ts`.
- Publish route collapses non-member access to the standard `WORKFLOW_NOT_FOUND` (404,
  no existence leak) and denies non-creator publish of a private-credential workflow
  (WF-RUNPERM), proven by the new route test.

---

## 5. Data / schema notes

- `workflow_runs.revision_id uuid NULL`, FK → `workflow_revisions(id)`
  **ON DELETE SET NULL** (never blocks or cascades run-history rows; mirrors
  `triggered_by_api_key_id` and `workflows.active_revision_id`), plus a partial index on
  the non-null column. Additive, null-safe; **no backfill**. Migration
  `20260626000000_workflow_runs_revision_id.sql`, applied to the **dev DB only**.
- `workflow_revisions` rows are immutable (INSERT-only; DELETE only via cascade from the
  workflow). `workflows.active_revision_id` FK is ON DELETE SET NULL. Account purge
  deletes `workflow_runs` explicitly before the account; revisions cascade via the
  workflow row — no FK/retention conflict.

---

## 6. Known limitations / follow-ups

- **Not in production.** The whole arc (41A–41J) + the `revision_id` migration are
  local/unpushed. Deploy requires: push the verified batch AND apply
  `20260626000000_workflow_runs_revision_id.sql` to prod.
- **`engine.ts` max-lines warning (552 > soft cap 550).** Introduced by the 41I
  attribution capture; a **non-failing** eslint `warn` whose config comment defers
  engine splitting to the v2-canonical-execution-engine consolidation. Left intentionally
  (the config frames 550 as a drift-visibility tripwire). Not touched in 41J.
- **`revision_id` is stored but not yet surfaced.** A future gated diagnostics reader
  could expose "which revision ran" for debugging; out of scope here (would require a
  deliberate, gated read surface — never the raw definition).

---

## 7. Verification baseline (what was actually run in 41J)

Run locally on `v2-main` (commit context: 41I = `03b4b0348`):

- **Targeted Jest suites — PASS:**
  - `tests/unit/services/workflows/lifecycleOrchestrator.test.ts`
  - `tests/unit/services/workflows/activeRevision.test.ts`
  - `tests/unit/services/workflows/saveDraftDefinition.test.ts`
  - `tests/unit/services/workflows/templateReplace.test.ts`
  - `tests/unit/services/triggers/dispatch.test.ts`
  - `tests/unit/services/execution/engine.test.ts`
  - `tests/unit/app/api/workflows/_shared.test.ts`
  - `tests/unit/app/api/workflows/runNow-route.test.ts`
  - `tests/unit/app/api/workflows/publish-route.test.ts` (**new**)
  - `tests/unit/repositories/workflowRuns.test.ts`
- **`npm run lint:migrations`** — OK.
- **eslint (changed files)** — 0 errors (pre-existing non-failing `max-lines` warning on
  `engine.ts`, see §6).
- **Global `npx tsc --noEmit` — PASS (exit 0, clean).** Earlier in 41J it was transiently
  blocked by an uncommitted type error in the parallel AI/diagnostics work
  (`_BuilderAiPanelRepairGoTo.tsx`); the other chat resolved it, so the full typecheck is
  green as of this closeout. No type error originated from this slice's files regardless.

> Honesty note: counts above reflect suites actually executed in 41J. This closeout did
> not run the full repo test tree or a prod smoke; those remain owned by the deploy gate.
> The shared worktree still holds the other chat's uncommitted AI/diagnostics files — they
> are not part of this slice and were not modified.
