# Checklist Item 7 — React Agent Apply Modes — Closeout

**Type:** Closeout / handoff. **Docs-only in THIS file — no source, test, migration, schema, UI, or
behavior change here. Nothing pushed.**
**Date:** 2026-06-30
**Branch:** `v2-main` (local-only; the arc is unpushed)
**Marker:** REACT-AGENT-APPLY-MODES-1

Closes out the launch-checklist item that adds explicit, deterministically-gated **apply modes** to the
React Agent edit preview, so users choose how to apply a proposed change based on real risk/readiness
checks rather than model confidence.

Related prior closeouts this builds on: the preview review rail + checkpoint arc
[`react-agent-preview-review-checkpoints-closeout.md`](./react-agent-preview-review-checkpoints-closeout.md);
the conversational edit-preview / diff-graph arc
[`../phase-4/ai/react-agent-workflow-builder-closeout.md`](../phase-4/ai/react-agent-workflow-builder-closeout.md);
the high-risk field-reason work in
[`../phase-4/ai/react-agent-governance-closeout.md`](../phase-4/ai/react-agent-governance-closeout.md).

---

## 1. Status

**Implemented, verified, committed locally, not pushed.** The feature is complete and active from
committed HEAD (working tree == HEAD for all feature files). See the history-attribution caveat in §11.

## 2. Scope / checklist mapping

| Checklist requirement | Status | How |
|---|---|---|
| Support "Apply as preview" / "Keep as preview" | Done | `preview_only` mode — always available; records the choice, leaves the preview active. |
| Support "Apply to draft" | Done | `apply_to_draft` mode — the existing local-draft apply (no save/run/activate). |
| Support "Apply and test" | Done | `apply_and_test` mode — apply to draft, save, then the existing test run (§4). |
| Force preview-only / block test when missing required fields | Done | `apply_and_test` disabled when the candidate end-state has an error-severity readiness issue; reason names the first blocking field. `apply_to_draft` stays available (local-only) with a setup warning. |
| Force warning/confirmation for recipient-visible content | Done | A `recipient` field-risk category sets `confirmationRequired` on both apply modes (inline confirm before applying). |
| Force warning/confirmation for secret/connection-sensitive changes | Done | `secret` / `connection` categories also set `confirmationRequired`. |
| Force warning/gating for active trigger / activation-sensitive config changes | Done | An activatable-trigger change on an `active` workflow disables `apply_and_test` (Reactivate then Resume path) and shows an activation warning on `apply_to_draft`. |
| Allow harmless label/layout fixes to apply directly to draft when safe | Done | A ready, low-risk change yields `apply_to_draft` with no warning and no confirmation (and `apply_and_test` enabled when testable). |
| Show selected apply mode in history/checkpoint/audit records | Done | Persisted in `agent_change_history.metadata.applyMode` plus the `kept_as_preview` status (§6). |
| Stretch: user/account default apply-mode preference | Deferred | Out of scope for this slice (see §11). |

## 3. Behavior shipped

While a React Agent **edit** preview is active, the right-rail "Review changes" panel renders an
apply-mode picker (`AgentApplyModeActions`) in place of the previous single Apply/Discard pair:

- **Apply to draft** — adds the change to the local draft. Always available because it only mutates the
  in-memory draft (never saves/runs/activates). Carries a **setup warning** when the end-state still has
  missing required fields, and an **activation warning** when it changes the trigger of an `active`
  workflow.
- **Apply and test** — apply, save, then run a safe test (§4). **Enabled only** when the candidate is
  ready, the workflow is manual-trigger testable, and it is not an activatable-trigger change on an
  active workflow. When disabled it shows a specific, plain-English reason.
- **Keep as preview** — the explicit non-destructive choice; records the decision and leaves the preview
  up so the user can resolve blockers. Always available.

Risk-flagged modes (recipient / secret / connection changes) require an **inline confirmation step**
("… Apply anyway?") before they fire. Disabled modes render their reason; enabled modes render any
warning. **Discard** remains a separate, always-available action. The **canvas control bar stayed
minimal** (Apply preview / Discard only) so the three primary actions are not duplicated in two places;
the full picker lives in the rail.

## 4. Apply-and-test sequencing

`apply_and_test` runs, in order:

1. **Apply the preview to the local draft** (the existing `apply_to_draft` path — replace/additive).
2. **Save the draft** (`graphSlice.save()`). This is required because the run-now route's test mode
   executes the **persisted** draft (`getDefinitionForExecution(workflow, "draft")`), not the in-memory
   pending graph; without the save the test would run the stale persisted copy.
3. **Run the existing test path** (`useRunControls.handleTestWorkflow` → `runNowWorkflow(testMode:true)`).

Guarantees:

- **No activation.** The sequence never activates or resumes a workflow.
- **Manual-trigger testability required.** Test runs only work for manual-trigger workflows server-side,
  so `apply_and_test` is gated on the candidate's trigger being manual (matching the header's existing
  Test gating).
- **Disabled when the candidate is not ready** (missing required fields / graph integrity), with the
  first blocking reason surfaced.
- **Disabled for active activatable-trigger changes**, because saving such a change deactivates the live
  workflow (lifecycle rule); the user is pointed to Reactivate then Resume instead of an automatic test.

## 5. Risk / safety model

The implementation **reused existing deterministic signals** and invented no new ones:

- **Readiness** is computed against the proposed end-state with the same builder validator the run-now
  preflight uses (`collectBuilderValidationIssues` → graph integrity + missing required fields).
- **Risk** comes from the existing field-risk classifier (`classifyFieldRisk` via the preview
  rationale's high-risk field reasons: `recipient` / `connection` / `secret` / `trigger_config` /
  `action_effect`).
- **Lifecycle** gating reads the workflow's existing `state`.

No new risk-scoring engine, no lifecycle redesign, no feature flag, no billing/cost preview, and no
auto-activation were added. Availability is a single pure decision point (`computeAgentApplyModes`) so
the rail and any future surface cannot drift on what is safe.

## 6. Audit / history persistence

The chosen mode is persisted so the audit record knows the user's decision even if the rail/history UI
is later removed:

- **`agent_change_history.metadata.applyMode`** — `apply_to_draft` / `apply_and_test` / `preview_only`,
  stored in the existing `metadata jsonb` column (object-CHECK enforced). `apply_to_draft` and
  `apply_and_test` both transition the row to the existing `preview_applied` status, so `applyMode`
  distinguishes them.
- **`kept_as_preview` status** — a new transition status for the keep-as-preview decision (an explicit
  non-apply choice), carrying `applyMode: preview_only`.
- **Migration** [`supabase/migrations/20260717000000_agent_change_history_kept_as_preview.sql`](../../../supabase/migrations/20260717000000_agent_change_history_kept_as_preview.sql)
  — forward-only ALTER of the status CHECK to add `kept_as_preview` (no new column; reuses `metadata`).

The DTO surfaces a typed `applyMode: AgentApplyMode | null`; an absent/invalid metadata value reads as
`null`.

## 7. Files changed

**Core / contract**
- `contracts/agentApplyModes.ts` — `AgentApplyMode` enum (`preview_only` / `apply_to_draft` /
  `apply_and_test`) + zod schema (single source of truth for both core and the audit contract).
- `core/workflows/agentApplyModes.ts` — `computeAgentApplyModes` (pure availability rules) +
  `AgentApplyModeAvailability`.

**Audit record / service / repository / migration**
- `contracts/agentChangeHistory.ts` — `applyMode` on the request + DTO; `kept_as_preview` transition
  status.
- `repositories/agentChangeHistory.ts` — `metadata` read/write threading.
- `services/workflows/agentChangeHistory.ts` — build `{ applyMode }` metadata; surface `applyMode` on
  the DTO.
- `supabase/migrations/20260717000000_agent_change_history_kept_as_preview.sql` — status CHECK ALTER.

**Hooks / UI**
- `features/workflow-builder/hooks/useAgentChangeEmission.ts` — `emitApplied({ applyMode })` +
  `emitKeptAsPreview`.
- `features/workflow-builder/hooks/useBuilderPreview.ts` — mode-aware `applyPreview`,
  `handleApplyAndTest` (apply → save → test), `handleKeepAsPreview`.
- `features/workflow-builder/hooks/useAgentApplyModeAvailability.ts` — derives availability inputs
  (readiness, trigger-change, testability, risk categories) and calls the core helper.
- `features/workflow-builder/panels/AgentApplyModeActions.tsx` — the presentational picker (enabled/
  disabled + reason + inline confirm + warning).
- `features/workflow-builder/panels/PreviewReviewPanel.tsx` — renders the picker when `applyModes` is
  supplied; legacy Apply/Discard fallback preserved (read-only diff drawer).
- `features/workflow-builder/WorkflowBuilder.tsx` — wiring (mounts `useRunControls` for the test
  dispatch, computes availability via `useAgentApplyModeAvailability`, maps mode → handler, passes
  `applyModes`/`onSelectApplyMode` to the rail). **This file's wiring landed through commit `880dbe2e8`**
  (see §8); functionally it is committed at HEAD.

**Tests**
- `tests/unit/core/workflows/agentApplyModes.test.ts` (new, table-driven).
- `tests/unit/services/workflows/agentChangeHistory.test.ts` (apply-mode metadata + `kept_as_preview`).
- `tests/unit/features/workflow-builder/panels/PreviewReviewPanel.test.tsx` (picker, disabled reasons,
  confirm gate).
- `tests/unit/features/workflow-builder/hooks/useAgentChangeEmission.test.tsx` (applyMode +
  keep-preview emission).
- `tests/integration/features/workflow-builder/hermes-guidance/builder-preview-review-rail.test.tsx`
  (updated to the new picker testids).

## 8. Commit map

| Commit | Summary |
|--------|---------|
| `5ff856096` | `feat(agent): React Agent apply modes (REACT-AGENT-APPLY-MODES-1)` — the apply-mode implementation (16 files: core helper, contract, audit-record threading + migration, emission helpers, `useBuilderPreview` orchestration, `useAgentApplyModeAvailability`, `AgentApplyModeActions`, `PreviewReviewPanel`, and tests). |
| `880dbe2e8` | `feat(builder): explicit React Agent test/fix/retest repair loop` — a **separate, parallel-session** feature whose commit also carried the (then-uncommitted) `WorkflowBuilder.tsx` apply-mode wiring, because the shared worktree had both features' hunks interleaved in that one file. |

**No history rewrite was performed.** This is a shared worktree with an active parallel session; amend/
rebase to relocate the `WorkflowBuilder.tsx` hunks into `5ff856096` is not safe and was not attempted.
This closeout does not claim ownership of the repair-loop feature in `880dbe2e8` — only of the
apply-mode wiring that incidentally rode along in that file.

## 9. Verification

Run against committed code (working tree == HEAD for the feature files):

- `run_typecheck` — exit 0
- `run_lint` — 0 errors (pre-existing max-lines warnings only)
- `run_structure_lint` — exit 0
- `run_migration_lint` — exit 0
- Focused Jest:
  - `agentApplyModes.test.ts` — 13/13
  - `agentChangeHistory.test.ts` — 14/14
  - `PreviewReviewPanel.test.tsx` — 12/12
  - `useAgentChangeEmission.test.tsx` — 6/6
  - `builder-preview-review-rail.test.tsx` — 6/6
  - `builder-apply-preview.test.tsx` — 28/28
- Migration applied via `db:push` and verified directly against the dev DB: `kept_as_preview` is present
  in the `agent_change_history_status_known` CHECK constraint, and the `metadata` column exists.

## 10. Non-goals / unchanged boundaries

- No workflow lifecycle redesign.
- No new risk-scoring engine (reused the existing field-risk classifier + readiness validator).
- No billing / cost preview.
- No feature flag.
- No auto-activation (the agent never activates or resumes a workflow).
- Canvas control bar remains minimal (Apply preview / Discard).
- Additive new-workflow skeletons remain **Apply-to-draft only** — their post-apply graph cannot be
  precisely validated pre-apply, so they are not offered Apply-and-test.

## 11. Caveats / follow-ups

- **History-attribution caveat.** The `WorkflowBuilder.tsx` apply-mode wiring is committed at HEAD but
  landed in `880dbe2e8` (the parallel repair-loop commit), not in the primary apply-mode commit
  `5ff856096`, due to shared-worktree concurrency (interleaved hunks in that one file). Functionally the
  item is complete from committed HEAD; only the git attribution of that single file is split.
- **Two `useRunControls` instances** (the header's and the builder-level one mounted for Apply-and-test)
  share the run slice, so run results surface the same way regardless of which path started the run.
  Lifting run dispatch to a single owner is a future cleanup.
- **Stretch deferred:** a user/account default apply-mode preference is intentionally left for later.

## 12. Final closeout statement

Checklist Item 7 — React Agent Apply Modes — is **complete from committed HEAD**. Local only. Nothing
pushed. Ready for launch-checklist tracking as done, subject only to the history-attribution caveat in
§11 (functional completeness is not affected).
