# React Agent Empty/Missing Setup Handling — Closeout (Checklist Item 10)

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in THIS doc. Nothing pushed.**
**Date:** 2026-06-30
**Branch:** `v2-main` (local-only; unpushed)
**Marker:** REACT-AGENT-SETUP-ISSUES-CLOSEOUT-1

Closes out **Checklist Item 10 — improve empty/missing setup handling after React Agent changes**.
When the React Agent adds or edits steps, it leaves required fields it cannot safely infer empty
(correct, by design). This arc makes that situation never confusing: after an apply, the user sees a
clear **"Setup needed"** list that says exactly which node and field need attention, why, the next
step, and whether it blocks running — and clicking a row opens the node and highlights the field.

Builds on the preview / review-rail / checkpoints arc
([`react-agent-preview-review-checkpoints-closeout.md`](./react-agent-preview-review-checkpoints-closeout.md)),
which shipped a read-only "Setup needed" *list* in the edit-preview rail and explicitly deferred
"click-to-focus missing field" — the exact gap this item closes. Reuses the readiness rules from
Checklist Item 5 ([`react-agent-readiness-closeout.md`](./react-agent-readiness-closeout.md)) and the
repair-loop field-focus path from the test/fix loop
([`react-agent-test-fix-loop-closeout.md`](./react-agent-test-fix-loop-closeout.md)).

---

## 0. Status at a glance (read this first)

1. **Item 10 is COMPLETE and end-to-end user-visible from committed code.** The post-apply
   "Setup needed" card renders, and click-to-focus works.
2. **Three local commits** make up the arc (core → read-model/validation wiring → render wiring).
3. **The final render commit was coordinated with `REACT-AGENT-READINESS-1`** because both slices
   edit the same hunks in `WorkflowBuilder.tsx` + `BuilderApplyNotice.tsx`. See §7.
4. **Nothing pushed.** No `git push`, no PR, no deploy. No migration, no new endpoint, no feature
   flag, no resolver / lifecycle / credential / account change.
5. **Ready for the next launch item.**

## 1. Commit chain (all local, not pushed)

| Commit | Summary |
|--------|---------|
| `adb00f8c5` | feat(builder): AgentSetupIssue read-model + Setup-needed card (CHECKLIST-ITEM-10 core) |
| `4737f686d` | feat(builder): wire React Agent setup-needed focus flow (read-model into the preview hook + ValidationSummary field focus) |
| `7537f32c2` | feat(builder): render setup-needed card + readiness in post-apply notice (coordinated REACT-AGENT-SETUP-ISSUES + REACT-AGENT-READINESS-1) |

## 2. Files changed

**Pure core (`adb00f8c5`):**
- [`core/workflows/agentSetupIssues.ts`](../../../core/workflows/agentSetupIssues.ts) — pure
  `buildAgentSetupIssues()` + the `AgentSetupIssue` contract.
- [`features/workflow-builder/panels/BuilderSetupNeededCard.tsx`](../../../features/workflow-builder/panels/BuilderSetupNeededCard.tsx)
  — presentational card.
- `tests/unit/core/workflows/agentSetupIssues.test.ts`,
  `tests/unit/features/workflow-builder/panels/BuilderSetupNeededCard.test.tsx`.

**Read-model + validation-drawer focus (`4737f686d`):**
- [`features/workflow-builder/hooks/useBuilderPreview.ts`](../../../features/workflow-builder/hooks/useBuilderPreview.ts)
  — `agentSetupIssues` memo + return (keeps the existing `appliedConfigHints` return).
- [`features/workflow-builder/validation/ValidationSummary.tsx`](../../../features/workflow-builder/validation/ValidationSummary.tsx)
  — `missing_required_field` rows now field-focus via `revealNode`.
- `tests/unit/features/workflow-builder/validation/ValidationSummary.test.tsx`.

**Post-apply render wiring (`7537f32c2`, coordinated):**
- [`features/workflow-builder/canvas/BuilderApplyNotice.tsx`](../../../features/workflow-builder/canvas/BuilderApplyNotice.tsx)
  — renders `BuilderSetupNeededCard` from `agentSetupIssues` (replaces the old `appliedConfigHints`
  rows) + the compact `AgentReadinessSummary` (readiness co-resident wiring).
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx)
  — `handleOpenSetupIssue` + `revealNode`; passes `setupIssues` / `onOpenIssue` into the notice;
  threads `readiness` into `PreviewReviewPanel` + `BuilderApplyNotice`.
- `tests/integration/features/workflow-builder/hermes-guidance/builder-apply-preview.test.tsx` —
  asserts the post-apply Setup-needed card appears and click-to-focus works.

## 3. Checklist items satisfied (minimum launch version)

1. **Detect missing required fields** in applied React Agent draft changes — ✅
   `buildAgentSetupIssues()` over the just-applied node ids.
2. **Show a clear "Setup needed" list** for the active draft state — ✅ `BuilderSetupNeededCard` in
   the post-apply notice.
3. **Each setup issue includes** node label, action/trigger label, field label, a safe explanation,
   the next step, and whether it blocks test/activation — ✅ the `AgentSetupIssue` shape.
4. **Clicking a setup issue opens the node config panel and focuses/highlights the missing field** —
   ✅ via the existing `configSlice.revealNode` (Item 6 field-focus infra).
5. **Reuses existing readiness / missing-field / config validation** — ✅ `missingRequiredFields` +
   `findInvalidVariableReferences`; no parallel ruleset.
6. **Reuses existing repair-loop field focus/highlight** — ✅ same `revealNode` path the
   `AgentRepairLoopPanel` uses.
7. **Preserves existing preview/apply/discard/test behavior** — ✅ navigation only; nothing
   saves / runs / activates.
8. **No secrets / tokens / raw payloads / credential details** — ✅ labels + field keys only.

## 4. User-facing behavior now shipped

- **Post-apply "Setup needed" card.** After an explicit Apply, the post-apply notice shows a
  "Setup needed" list with a **"N to fix before active"** count. Each row names the **action +
  field** (e.g. *"Gmail needs a To."*), a **safe explanation**, and the **next step**
  (*"Open the To field and fill it in."*).
- **Click-to-focus.** Clicking a row opens the node's config panel and highlights / scrolls to the
  missing field (`revealNode`). Navigation only — it never writes a value, saves, runs, or
  activates.
- **Validation drawer parity.** `missing_required_field` rows in the validation drawer now also
  focus the specific field (previously they only opened the node) — closing the deferred
  "click-to-focus missing field" gap from the preview-review arc.
- **Live recompute.** Issues are derived from the live draft config, so filling a field removes its
  row on the next render; the highlight clears when the user edits that field.
- **Broken references surfaced.** A field pointing at a deleted/unknown step is shown as a
  non-blocking `unresolved_variable` issue (mirrors the validation drawer's warning), so a
  prefilled-looking-but-broken field is never read as complete.

## 5. Architecture summary

- **One thin pure read-model, not a new ruleset.**
  [`buildAgentSetupIssues()`](../../../core/workflows/agentSetupIssues.ts) derives a flat
  `AgentSetupIssue[]` from the **existing** deterministic signals:
  - missing required fields → `missingRequiredFields` (the same Q5-correct rule the header pill,
    Activate gate, and run-now preflight use), and
  - broken variable references → `findInvalidVariableReferences` (the same detector the validation
    drawer's `broken_variable_reference` warning uses).
  It invents no validation rules and reads no config **values** — only emptiness.
- **`AgentSetupIssue` shape:** `id`, `kind` (`missing_required_field` | `unresolved_variable` |
  `needs_user_choice` | `unknown`), `workflowId`, `nodeId`, `nodeLabel`, `actionLabel?`,
  `fieldPath?`, `fieldLabel?`, `message`, `explanation`, `nextStep`, `blocking`, `focusTarget?`.
- **Honest explanations.** `explanation` defaults to a **safe generic** sentence
  (*"React added this step but didn't have enough information to fill this in safely…"*). It never
  fabricates a specific inference reason (e.g. "couldn't infer the recipient from the old Slack
  message") because no per-field inference reason exists in the preview/plan data. The deterministic
  `needs_user_input` rationale from `buildPreviewRationale` remains the proven-explanation surface in
  the edit-preview rail.
- **Reused field focus.** Clicking a row routes through `configSlice.revealNode({ nodeId,
  initialValues, fieldKey })` → `focusFieldKey` + canvas focus → `SchemaForm` highlight/scroll. The
  right drawer flips to inspector via the existing `activeNodeId` transition effect — the same path
  the validation drawer and repair loop already use.
- **No secrets / no leak.** Every string is a metadata label or a field key. No config value, token,
  OAuth secret, provider account id, or credential id is ever read into the read-model, so none can
  reach the DOM, a snapshot, or test output.

## 6. Verification baseline (run this session, newly measured)

- `npx tsc --noEmit` → **exit 0**.
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).
- Focused suites → **7 passed, 91 tests**:
  - `tests/unit/core/workflows/agentSetupIssues.test.ts`
  - `tests/unit/features/workflow-builder/panels/BuilderSetupNeededCard.test.tsx`
  - `tests/unit/features/workflow-builder/validation/ValidationSummary.test.tsx`
  - `tests/integration/features/workflow-builder/hermes-guidance/builder-apply-preview.test.tsx`
  - `tests/unit/core/workflows/agentReadiness.test.ts`
  - `tests/unit/features/workflow-builder/panels/AgentReadinessSummary.test.tsx`
  - `tests/unit/app/api/workflows/connection-readiness-route.test.ts`

The last three readiness suites are run because the coordinated render commit (`7537f32c2`) touches
the same files that consume the readiness wiring.

## 7. Coordinated final commit (honest note)

The post-apply render wiring landed as **one coordinated commit (`7537f32c2`) carrying both
`REACT-AGENT-SETUP-ISSUES` and `REACT-AGENT-READINESS-1` markers**. Reason: both slices edit the
**same hunks** in `WorkflowBuilder.tsx` and `BuilderApplyNotice.tsx` (the `BuilderApplyNotice` prop
interface mixes my `setupIssues`/`onOpenIssue` with the readiness `readiness` prop; the render mixes
`BuilderSetupNeededCard` with `AgentReadinessSummary`). The readiness **library core** had already
landed separately in `cca248e5d`, so by the time of the render commit every readiness file the two
shared files import was already tracked — the coordinated commit compiled cleanly and pulled in **no**
untracked peer work, **no** migrations, and **no** admin/internal-API files (the staged set was
explicitly verified). The earlier two Item 10 commits (`adb00f8c5`, `4737f686d`) are clean,
self-contained, and unrelated to readiness.

## 8. Non-goals / deferred follow-ups

- **No `missing_connection` / `invalid_connection` kinds.** There is no deterministic
  connection-health signal in scope for this read-model; emitting them would invent backend state.
  (The readiness verdict from Item 5 is the surface that reasons about connection state.)
- **No pre-apply click-to-focus for un-applied preview nodes.** A holographic preview node has no
  real graph node to focus; the existing in-rail `BuilderPreviewSetupCard` already collects those
  fields before Apply. Focus applies to **applied** draft nodes.
- **No Retest button in the setup card.** The existing `AgentRepairLoopPanel` owns the
  "Retest after fix" affordance when a test has already failed; duplicating a run path here was
  deliberately avoided.
- **No full unified setup contract across every surface.** This slice intentionally shipped a thin
  read-model + one post-apply card (plus the validation-drawer focus parity), not a single model
  behind every surface. Unifying the edit-preview "Setup needed" section, the post-apply card, and
  the validation drawer onto one contract remains an optional future consolidation.

## 9. Caveats

- **Local-only.** All three commits are local on `v2-main` and unpushed. No push / deploy /
  `db:push` / launch-posture change.
- **Shared worktree.** This arc landed alongside concurrent sessions. Unrelated peer-owned files were
  **left untouched**: `docs/slices/phase-5/react-agent-readiness-closeout.md` (the readiness
  session's doc, staged by that session) and `scripts/trash/*` (one-off scripts from other sessions).

## 10. Status

**Checklist Item 10 is COMPLETE, verified, and ready for the next launch item.**
