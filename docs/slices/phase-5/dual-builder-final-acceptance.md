# Dual Builder — Final acceptance & hardening (DOC-FINAL-ACCEPTANCE-1)

**Status:** shipped locally (flag-gated: `ENABLE_DOCUMENT_BUILDER`, default OFF — unchanged).
**Base:** `73cfdcf3d` (Document full-workspace rail cleanup); worked on `v2-main` on top of the
concurrent Fleetio commit `60b26d62b`. No schema, migration, route, AI, engine, entitlement,
or persistence change. No push/deploy/PR.

This is the final acceptance slice for the Dual Builder. It closes the one remaining product
seam (center ghost-preview destructive Apply), restores repo hygiene (structure lint vs nested
worktrees), and records the beta GO/NO-GO.

## 1. Center destructive-apply confirmation (the seam)

Previously the center Document ghost-preview `Apply` was a single click even when the proposal
**removed** steps/connections; the governed destructive confirmation only happened incidentally
on the right-drawer apply-mode path (and only when a removed node happened to carry a risk field
like a recipient `channel`).

Now there is ONE governed destructive classification and ONE confirmation vocabulary, shared by
both surfaces:

- **`core/workflows/destructivePreview.ts`** — `classifyDestructivePreview({ liveNodes, liveEdges,
  proposedDefinition })` → `{ isDestructive, removedStepCount, removedConnectionCount,
  removedStepTitles }`. A proposal is destructive when it removes a step OR cuts a connection
  between two *surviving* steps (a dropped edge whose endpoint was removed is not double-counted).
  Additive skeletons (no `proposedDefinition`) are never destructive. Exports the shared copy
  `DESTRUCTIVE_APPLY_CONFIRM` ("Apply destructive change?" · "Keep my workflow" · "Apply removal")
  and `describeDestructiveRemoval` (text-only consequence).
- **`features/workflow-builder/panels/DestructiveApplyConfirm.tsx`** — ONE accessible
  `role="alertdialog"` confirmation used by both surfaces (labelled title+body, focus enters the
  safe default, Escape / Cancel exit and restore focus to the opener, destructive action marked
  `data-destructive` + text consequence, no keyboard trap, reduced-motion safe).
- **Center** (`DocumentPreview` via `DocumentView`): a destructive proposal styles the preview
  destructive, the primary button reads **"Apply removal"**, and clicking it opens the shared
  confirmation. Cancel returns to the preview (focus back on Apply); Confirm calls the SAME
  `onApply` → `useBuilderPreview.applyPreview` governed path. Non-destructive ⇒ unchanged one-click
  "Apply to draft".
- **Right drawer** (`AgentApplyModeActions` via `PreviewReviewPanel`): the same classification
  routes an applying mode (apply to draft / apply and test) through the same
  `DestructiveApplyConfirm`. "Keep as preview" and Discard never confirm.

Shared invariants held (nothing new introduced): the apply command, `expectedBaseVersion` stale
protection, checkpoints, and Agent change history all remain in `useBuilderPreview` — the confirm
only gates the call. No second Agent/composer/store/route; no autosave; entitlement gates
untouched (server backstops still 403 a crafted branching save on Free).

## 2. Structure-lint traversal vs nested worktrees

`scripts/check-leaf-folder-counts.mjs` now skips (a) nested Git worktree/repository boundaries (a
dir with a `.git` entry — a linked worktree always has one) and (b) the explicit
`.claude/worktrees` temporary-worktree parent (covers an orphaned leftover whose `.git` marker was
already removed). Authoritative `.claude` content (skills/agents/commands) stays IN scope. Proven
by `tests/unit/scripts/checkLeafFolderCounts.test.ts` (real over-cap source dir still flagged;
worktree/orphan skipped; `.claude/skills` still scanned).

## 3. Worktree cleanup

Removed the two IN-TREE stale Dual Builder worktrees `.claude/worktrees/cs7` and `cs7b` (clean +
fully merged) and deregistered seven fully-merged C:/tmp Dual Builder worktrees (cs6/cs7c–g, dbi).
Branches are preserved (worktree remove keeps the branch). Five clean-but-unmerged Dual Builder
worktrees (cs2/cs2b/cs3/cs4/cs5) were inspected and **preserved** pending Marcus's branch-deletion
approval. **Caveat:** `git worktree remove` on the C:/tmp trees followed junctions into the shared
`node_modules` and deleted some `@`-scoped packages; repaired non-destructively with `npm install`
(node_modules is gitignored — no commit/source impact). Leftover orphan C:/tmp directories are
outside the repo tree and harmless; not force-deleted (broad `rm -rf` is disallowed).

## 4. Evidence

- Unit/integration (jest): `destructivePreview.test.ts`, `DestructiveApplyConfirm.test.tsx`,
  `AgentApplyModeActionsDestructive.test.tsx`, `documentDestructivePreview.test.tsx`,
  `checkLeafFolderCounts.test.ts`. Existing WorkflowBuilder/document/panels/workflows/core suites
  green. (The two baseline failures noted while this slice was in flight — NodeInspectorPanel
  "blocked multi-edge" and WorkflowCanvas "canvas action bar" — were since resolved by
  BUILDER-BASELINE-FAILURES-1, `c109f7223`; at commit time the full builder + workflows set is
  green with this slice included: 362 suites / 3753 tests at `--maxWorkers=2`.)
- Live browser: `tests/e2e/dual-builder-destructive-confirm-journey.spec.ts` (center path) +
  updated `dual-builder-cs7g-mutation-journey.spec.ts` #4 (drawer path, now shared testids).
- Screenshots: `owner-review/doc-final/` + `owner-review/doc-rail-layout/` (gitignored).

## Beta posture

Default OFF; rollback = unset `ENABLE_DOCUMENT_BUILDER`. No production migration/provider setup.
Preview is non-mutating; stale refuses; destructive requires confirmation; Save/Apply explicit;
telemetry carries no workflow content; local Supabase + loopback mock-Hermes are test-only.
