# React Agent — Preview Review Rail + Checkpoint Safety — Closeout

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in THIS doc. Nothing pushed.**
**Date:** 2026-06-29
**Branch:** `v2-main` (local-only; the arc is unpushed)
**Marker:** REACT-AGENT-PREVIEW-REVIEW-CHECKPOINTS-CLOSEOUT-1

Closes out the arc that added a **config-level diff "Review changes" rail** to the React Agent edit
preview, wired **durable "before agent change" checkpoints** into the builder apply flow, and hardened
**checkpoint restore** so normal/unexpected failures never surface as a raw HTTP 500.

Related prior closeouts: the conversational edit-preview / diff-graph arc this builds on is
[`../phase-4/ai/react-agent-workflow-builder-closeout.md`](../phase-4/ai/react-agent-workflow-builder-closeout.md);
the governance arc is [`../phase-4/ai/react-agent-governance-closeout.md`](../phase-4/ai/react-agent-governance-closeout.md).

Local commits in this arc:

| Commit | Summary |
|--------|---------|
| `9ad5948ca` | feat(agent): add config diff review rail |
| `589605a5e` | style(agent): use imported ReactNode in config diff review panel |
| `70c20b82b` | feat(workflows): durable named checkpoints for React Agent changes (CHECKPOINTS-1) |
| `d6300f0d4` | feat(workflows): mount checkpoints in builder, create before React Agent apply + restore |
| `698c16b9d` | fix(workflows): checkpoint restore returns typed errors, never a raw 500 |

> Note: the checkpoints commits (`70c20b82b`, `d6300f0d4`) and the WorkflowBuilder wiring were
> authored by a concurrent session in the shared worktree; the review-rail commits (`9ad5948ca`,
> `589605a5e`) and the restore fix (`698c16b9d`) were authored here. Both features are integrated and
> green together.

---

## 1. Purpose / problem solved

The React Agent already showed a **structural** node diff on the canvas (added / removed / changed /
unchanged) before the user applied a proposed edit. Two gaps remained:

- **No config-level visibility.** Users could see *which* nodes changed, but not *what* changed inside
  each node — recipients, channels, message bodies, variables, selected fields. For AI workflow
  editing, the config is the risky part, and reviewing it meant opening every node.
- **No safe "go back" + a crash on restore.** Applying an agent change mutated the local draft with no
  durable restore point, and the checkpoint restore endpoint had no error handling — a normal restore
  could throw deep in the save path and surface to the browser as a bare `HTTP 500`.

This arc closes both: a right-rail **Review changes** view that owns the field-level diff, and a
durable **checkpoint-before-apply** with **typed, friendly restore failures**.

## 2. User-facing behavior now shipped locally

- **Review changes rail.** While a React Agent **edit** preview is active, the right drawer switches
  into a "Review changes" mode (the canvas keeps the structural diff). The rail shows: a one-line
  summary, a node-change overview (Added / Changed / Removing), and per-node config detail — **added
  fields**, **changed fields** (`before → after`), **removed config**, **variables used**
  (`{{...}}`), and a **Setup needed** section for still-missing required fields. The user understands
  the whole change without opening any node.
- **Apply / Discard / close / Esc.** Apply replaces the local draft with the proposed graph (unchanged
  behavior — `replaceGraphLocal`); it does not save / run / activate. Discard, the drawer close (×),
  and Esc all drop the preview and return the right drawer to its normal node-contextual modes
  (inspector / results / validation).
- **Checkpoint before apply.** On a successful apply, ChainReact durably records a "Before React Agent
  change" restore point capturing the **pre-apply** draft (plus the prompt + change summary), shown in
  the rail's "Recent checkpoints" list. Saving the workflow is not required for the checkpoint to
  exist.
- **Restore.** Restoring a checkpoint rewrites the draft to that earlier snapshot and re-hydrates the
  builder. If a checkpoint is gone (deleted / pruned), the rail removes it and says "This checkpoint
  is no longer available." If restore fails for another reason, the user sees a clear "Couldn't
  restore this checkpoint. Refresh and try again." — never a bare 500.

## 3. Key files changed

**Config diff review rail (review-rail commits):**
- `core/workflows/configDiffFieldMeta.ts` — pure, client-safe map `provider:type → { label, required, hasDefault, secret }` from action/trigger metadata (`secret` = declared `sensitivity: secret/connection` OR a secret-shaped key name).
- `core/workflows/buildConfigDiff.ts` — pure value-level diff (added / changed / removed fields, missing-required, variables) with redaction + object/array summarization; shares the canvas diff's node-status rules (parity-tested).
- `features/workflow-builder/panels/PreviewReviewPanel.tsx` — presentational rail (no fetch / store / service / repo); renders the diff + Apply/Discard + a calm fallback when the diff fails to compute.
- `app/workflows/[id]/page.tsx` — server-computes `fieldMetaByType` from the discovery registry and threads it as a prop.
- `features/workflow-builder/WorkflowBuilder.tsx` — `configDiff` memo (try/catch → null fallback), `previewReviewActive` right-drawer takeover, shared `handleDiscardPreview`.

**Checkpoints (checkpoints commits, concurrent session):**
- `contracts/workflowCheckpoint.ts`, `repositories/workflowCheckpoints.ts`, `services/workflows/checkpoints.ts`, `lib/api/workflowCheckpoints.ts`, `features/workflow-builder/hooks/useWorkflowCheckpoints.ts`, `features/workflow-builder/panels/CheckpointsPanel.tsx`, `app/api/workflows/[id]/checkpoints/route.ts` + `.../[checkpointId]/restore/route.ts`, `supabase/migrations/20260715000000_workflow_checkpoints.sql`, and the `WorkflowBuilder.tsx` apply/restore wiring.

**Restore fix (`698c16b9d`):**
- `app/api/workflows/[id]/checkpoints/[checkpointId]/restore/route.ts` — try/catch: `LifecycleError → lifecycleErrorResponse`; any other throw → server-only `workflow.checkpoint.restore_failed` log + typed `CHECKPOINT_RESTORE_FAILED` (no leak).
- `features/workflow-builder/hooks/useWorkflowCheckpoints.ts` — 404 → remove stale row + "This checkpoint is no longer available."; other failures → keep row + friendly message.

## 4. Safety guarantees

- **Config diff visible before apply.** The full field-level diff renders in the right rail while the
  preview is active and **before** the user clicks Apply; nothing is mutated to show it.
- **Secrets redacted.** Fields that are `sensitivity: secret`/`connection` or whose key name is
  secret-shaped (`isSecretLikeKey`) render as "hidden" — the raw value is never placed in the diff
  result, so it cannot reach the DOM, a snapshot, or test output. Object/array values are summarized,
  never dumped as JSON; `_`-prefixed internal keys are dropped.
- **Required setup visible.** Missing required fields appear in a "Setup needed" section using the
  shared `isRequiredValueMissing` rule (Q5-correct: `0` / `false` / `""` are explicit values, not
  missing) and skipping metadata-defaulted fields, so the rail matches the builder readiness gate.
- **Checkpoint before apply.** The pre-apply draft snapshot is captured before `replaceGraphLocal`
  and persisted on a successful apply, independent of saving the workflow.
- **Discard / close / Esc do not checkpoint or apply.** `handleDiscardPreview` only clears the
  preview; the sole `createReactAgentCheckpoint` call site is the apply success branch. Verified by an
  explicit guard test ("Discard does NOT create a checkpoint").
- **Restore failures return typed safe errors, not raw 500.** `LifecycleError → typed 4xx/502`; any
  other throw → `CHECKPOINT_RESTORE_FAILED` (friendly body, raw cause logged server-side only);
  missing checkpoint → `404` and the rail removes the stale control. No internal message/stack reaches
  the client.

## 5. Tests / checks that passed

Focused suites (last green run):
- `tests/unit/core/workflows/buildConfigDiff.test.ts` — 13
- `tests/unit/core/workflows/configDiffFieldMeta.test.ts` — 4
- `tests/unit/features/workflow-builder/panels/PreviewReviewPanel.test.tsx` — 5
- `tests/integration/.../builder-preview-review-rail.test.tsx` — 4 (incl. discard-no-checkpoint guard)
- `tests/integration/.../builder-apply-preview.test.tsx` — 28 (apply → checkpoint integrated)
- `tests/unit/app/api/workflows/checkpoints-route.test.ts` — 10 (incl. LifecycleError → typed, generic Error → safe no-leak)
- `tests/unit/features/workflow-builder/hooks/useWorkflowCheckpoints.test.tsx` — 5 (404 removes stale + friendly; non-404 keeps + friendly)
- `tests/unit/services/workflows/checkpoints.test.ts` — 5; `.../CheckpointsPanel.test.tsx` — 6; `.../state/graphSlice.checkpoints.test.ts` — 1

Repo checks: `npx tsc --noEmit` — exit 0; `npm run lint:structure` — exit 0.

## 6. Deferred / non-goals

- **No durable change history beyond checkpoints.** Checkpoints are bounded "before agent change"
  restore points (cap 20/workflow), not a full edit log.
- **No click-to-focus missing field.** "Setup needed" lists the blocking fields but does not jump the
  config UI to them.
- **No builder redesign.** The review rail reuses the existing right-drawer chrome and the locked
  `useRightDrawer` union is untouched (takeover is a local render branch, not a 4th mode).
- **No DB changes for this closeout.** The only schema in the arc is the checkpoints table migration
  (`20260715000000_workflow_checkpoints.sql`), authored with the checkpoints feature; this doc adds
  nothing.
- **Long-value expand/collapse** in the rail is preview-only (120-char truncation); full-text
  expansion is deferred.

## 7. Known caveat

- **Local-only.** All five commits are local on `v2-main` and unpushed. No push / deploy / `db:push` /
  launch-posture change has been made. The checkpoints migration is authored; confirm it is applied to
  the target database before relying on checkpoints in any non-local environment.
- **Shared worktree.** This work landed alongside concurrent sessions (checkpoints, trigger-smoke,
  builder preview). The worktree may still show unrelated dirty/untracked files from those sessions
  (e.g. a separate `WorkflowBuilder.tsx` modification, `useBuilderPreview.ts`, `scripts/trash/*`) —
  they are not part of this arc and were left untouched.
