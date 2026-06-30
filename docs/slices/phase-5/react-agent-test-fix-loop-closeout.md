# React Agent Test/Fix/Retest Repair Loop — Launch Checklist Item 6 Closeout

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in THIS doc. Nothing pushed.**
**Date:** 2026-06-30
**Branch:** `v2-main` (local-only; not pushed this session)
**Marker:** REACT-AGENT-TEST-FIX-LOOP
**Status:** ✅ Complete — implemented, verified locally, committed locally, **not pushed**.

Closes out **Launch Checklist Item 6**: make the React Agent test/fix/retest loop explicit.
A failed builder test run now drives a **visible, continuous guided repair thread** in the run-results
rail — what failed, what to open, how to retest, and whether the workflow is ready — instead of just a
static error message.

Builds directly on the failed-run + repair surfaces it reuses:
[`../../rules/failed-run-recovery.md`](../../rules/failed-run-recovery.md) (CR-FAILREASON humanized
reason + one CTA) and [`agent-change-history-closeout.md`](./agent-change-history-closeout.md) (the
existing `useRepairTestVerification` test-fix audit watcher this loop runs alongside, untouched).

> **Shared-worktree note.** This work landed in a shared worktree with concurrent React-Agent / provider
> sessions. Only commit `880dbe2e8` is in this arc's scope. The local `origin/v2-main` tracking ref
> already references the commit (a shared-worktree artifact); **no push was performed in this session.**

---

## 1. Summary

- **`880dbe2e8` — Explicit test/fix/retest repair loop (REACT-AGENT-TEST-FIX-LOOP).** A root-mounted
  watcher opens a single guided diagnosis thread when a builder test run fails, ties it to the failing
  step/node, and surfaces a "Failed test detected" narrative in `RunResultsPanel` with a wired
  **Retest after fix** CTA and an **Open the failing step** action (reusing the existing open/highlight
  path). A passing retest advances the same thread to `test_passed`; a repeated failure advances it to
  `still_failing` with an incrementing attempt count instead of starting over. The existing classified
  error block, step list, and AI repair block stay rendered beneath the guided panel.

## 2. Completed commit chain

- `880dbe2e8` — feat(builder): explicit React Agent test/fix/retest repair loop (REACT-AGENT-TEST-FIX-LOOP) _(2026-06-30)_

(Single-commit arc. Verified via `git log` / `git show --stat 880dbe2e8`: 9 files changed,
1084 insertions(+), 2 deletions(-).)

## 3. Checklist items satisfied (Item 6)

1. ✅ A failed test/run creates/updates a **visible repair state** for the current workflow.
2. ✅ A **structured failure summary** renders in the run-results rail (failing node/step, safe reason,
   next step).
3. ✅ A clear **"Retest after fix"** CTA, wired to the **existing** `handleTestWorkflow()` test-mode path
   (no second run path).
4. ✅ Retest **continues the same diagnosis thread** — `still_failing` + attempt count, never a restart.
5. ✅ A passing retest shows a **success state** + next step ("save, activate, or continue editing").
6. ✅ Existing failed-run explanation and **field-open/highlight behavior preserved** (reuses
   `configSlice.revealNode`; classified error block + steps + AI repair block remain available).
7. ✅ **No raw provider payloads, secrets, tokens, or private credential details** exposed in the panel.

## 4. User-facing behavior

- **Test fails →** the run-results rail leads with a **"Failed test detected"** card: the failing step
  (safe display name) + a humanized reason, then "open the failing step → fix it → retest."
- **Open the failing step →** reuses `configSlice.revealNode`, opening the node's config and (when a field
  is proven) highlighting it; the thread records `field_opened` ("I opened the … for you").
- **Retest after fix →** runs the workflow in **test mode** (external actions skipped, nothing saved) via
  the existing run controls. The button is labeled and titled as a test run — no claim that live side
  effects are safe.
- **Retest passes →** **"Test passed"** with next-step guidance: save, activate, or keep editing. The loop
  **never** claims passed without a real `succeeded` run.
- **Retest fails again →** **"Still needs attention"** in the **same thread**, with an attempt count and
  the updated diagnosis (e.g. the next missing field) — context is not lost between failure → fix → retest.
- The existing classified error block, per-step list, and deterministic AI repair block stay visible
  **beneath** the guided panel; the guided panel is additive, not a replacement.

## 5. Architecture

Three small, boundary-respecting pieces wired into existing surfaces:

- **`state/repairLoopStore.ts`** — a pure Zustand store holding the single active `AgentRepairLoop`
  thread (`idle | test_failed | field_opened | retesting | test_passed | still_failing |
  retest_failed_to_start`) with semantic transitions (`recordFailure` / `markRetesting` / `recordPass` /
  `markFieldOpened` / `markRetestFailedToStart` / `reset`). Imports no other slice. `recordFailure`
  continues an active same-workflow thread as `still_failing` (attempt++) or starts a fresh one.
- **`hooks/useAgentRepairLoop.ts`** — a root-mounted watcher (beside `useRepairTestVerification`) that
  maps run-slice terminal transitions onto the thread (failed → record, pending-while-active → retesting,
  succeeded-while-active → pass). **Fail-open** (the subscriber body is fully guarded; a malformed run
  detail never throws into the builder). Plus two pure exported helpers: `computeRepairDiagnosis`
  (no-leak diagnosis from the humanized classification + graph) and `buildRepairReveal` (always returns
  the failing nodeId; includes `fieldKey` **only when proven**).
- **`panels/AgentRepairLoopPanel.tsx`** — reads the thread and renders the status-driven narrative + the
  two wired actions. Mounted at the top of the failed-run section in `RunResultsPanel`.

Cross-slice orchestration stays out of the slices: the watcher (run-slice → repair-loop) and the panel
(repair-loop → config-slice reveal) own it. `WorkflowBuilder.tsx` mounts the watcher and resets the loop
store on workflow change/unmount.

## 6. Security / no-leak guarantees

- **Reason copy is humanized only.** `safeReason` is derived solely from the run's
  `errorClassification` (already sanitized server-side) or a fixed generic fallback — **never** from
  `step.error.message` (raw provider text).
- **No config values / secrets in the guided panel.** Opening a step routes its config to the config
  rail; the guided panel renders safe labels + fixed copy only. A unit test asserts a seeded
  `xoxb-…` token in node config never renders in the panel.
- **Field naming is proof-gated.** A specific field is named/highlighted only when a proven field signal
  exists; otherwise the panel opens the node and says to review the step's configuration. No guessed
  field names.
- **No new trust surface.** No new endpoint, no new account/credential read path; the loop is pure
  client state over the existing run slice + existing test-run path.

## 7. Data / RLS / model notes

- **No DB migration.** No table, column, RLS, or GRANT change. The repair-loop state is **in-memory
  client state only** (a Zustand store), reset on workflow change — never persisted.
- **No account-model change.** Reuses the existing account-scoped run + repair surfaces; the watcher is
  gated `enabled: !localOnly` (logged-out anonymous builds get no thread).
- **Nothing unapplied.** No migration authored, so nothing pending `db:push`.

## 8. Files changed (commit `880dbe2e8`)

New:
- [`features/workflow-builder/state/repairLoopStore.ts`](../../../features/workflow-builder/state/repairLoopStore.ts)
- [`features/workflow-builder/hooks/useAgentRepairLoop.ts`](../../../features/workflow-builder/hooks/useAgentRepairLoop.ts)
- [`features/workflow-builder/panels/AgentRepairLoopPanel.tsx`](../../../features/workflow-builder/panels/AgentRepairLoopPanel.tsx)
- [`tests/unit/features/workflow-builder/state/repairLoopStore.test.ts`](../../../tests/unit/features/workflow-builder/state/repairLoopStore.test.ts)
- [`tests/unit/features/workflow-builder/hooks/useAgentRepairLoop.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useAgentRepairLoop.test.tsx)
- [`tests/unit/features/workflow-builder/panels/AgentRepairLoopPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/AgentRepairLoopPanel.test.tsx)

Edited:
- [`features/workflow-builder/panels/RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx) — mounts the guided panel at the top of the failed-run section; existing blocks untouched beneath.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — mounts `useAgentRepairLoop` beside `useRepairTestVerification`; resets the loop store on workflow change/unmount.
- [`tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/RunResultsPanel.test.tsx) — +3 guided-loop mount/coexistence tests.

## 9. Verification baseline (run THIS session)

All run now against the working tree at commit `880dbe2e8` (ChainReactV2):

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **exit 0** |
| `npm run lint` (`eslint .`) | **0 errors** (only pre-existing, unrelated `max-lines` warnings) |
| `npm run lint:structure` | **OK** — every leaf folder ≤ 50 files |
| Jest `repairLoopStore.test.ts` | **11 passed** |
| Jest `useAgentRepairLoop.test.tsx` | **11 passed** |
| Jest `AgentRepairLoopPanel.test.tsx` | **7 passed** |
| Jest `RunResultsPanel.test.tsx` | **27 passed** (incl. +3 new) |
| Jest `WorkflowBuilder.test.tsx` | **60 passed** (mount/reset regression) |
| Jest `useRepairTestVerification.test.tsx` | **4 passed** (unaffected verifier) |

Full-suite `npm test` was **not run this session** (focused suites for the touched files were run
instead, per the slice's verification scope). No migration authored → nothing pending `db:push`.
No feature flag added; the watcher is gated only by `enabled: !localOnly`.

## 10. Non-goals / intentionally not changed

- The workflow test/run execution path, `runSlice`, polling, and `configSlice.revealNode` — reused as-is.
- The deterministic AI repair block (`RunResultsRepairBlock` / `suggestWorkflowRepairForAI`) and the
  `useRepairTestVerification` audit watcher — left intact and running alongside.
- `failedRunCta` / `humanizeActionError` and the `RunDetail` Runs-tab affordances — unchanged.
- **No** auto-activation after a passing test. **No** new run/test endpoint. **No** DB migration.
  **No** fake field naming. **No** full workflow-health monitoring or run-analytics dashboard.

## 11. Caveats & deferred follow-ups

- **Funnel / eval metrics for the loop are deferred.** No agent-eval funnel events or internal-dashboard
  tracking were added for the guided repair thread this slice; that remains a stretch follow-up.
- **Field-level naming stays lean.** `failingFieldPath` is plumbed end-to-end, but the watcher does not
  prove a config-field key from run detail in v1, so the running app uses **node-level** focus. A proven
  deterministic field source (e.g. feeding the repair suggester's `requiredUserInput[].field`) lights up
  field-level naming/highlight without further UI work. Until then, it never guesses a field.
- **No dedicated "View error details" toggle.** The classified error block + step list remain rendered
  directly beneath the guided panel (always available), so a separate collapse/disclosure would be
  redundant; none was added (and none faked).
- **`WorkflowBuilder.tsx` `max-lines` warning is pre-existing** (493 > the file's 460 override). The ~11
  lines this slice added are minimal/necessary (mount + reset); the file was already over before this
  change. Warning only — `eslint` exits 0.
- **Reveal placement vs. the spec's test grouping.** Reveal is user-initiated from the panel (auto-reveal
  from the watcher would flip the right drawer to `inspector` and hide the guided panel); the two
  reveal assertions therefore live in the panel test + the `buildRepairReveal` helper test rather than the
  watcher test. Net coverage is equivalent.

## 12. Recommended next tracks

- **Prove a field source** to upgrade node-level focus to field-level naming/highlight (wire the repair
  suggester's `requiredUserInput[].field` into the diagnosis).
- **Eval/funnel instrumentation** for the repair loop (failure → open → retest → pass conversion) once
  the loop has live usage.
- **Resume-from-failed-step retest** (vs. full test re-run) if/when a partial-run path exists — currently
  out of scope and deliberately deferred.

---

**Closeout confirmation:** Docs-only. Nothing pushed.
Doc path: [`docs/slices/phase-5/react-agent-test-fix-loop-closeout.md`](./react-agent-test-fix-loop-closeout.md)
