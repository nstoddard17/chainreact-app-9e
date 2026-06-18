# 4.AI-GUIDANCE-UNREACHABLE-NODE-1 — Guidance-only unreachable/orphan-node Check card — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-17
**Branch:** `v2-main`
**Sibling arc:** [ai-repair-coverage-2-closeout.md](./ai-repair-coverage-2-closeout.md)
(the unreachable-node guidance card was the **guidance-only runner-up** named in
[ai-repair-coverage-2-plan.md](./ai-repair-coverage-2-plan.md) §5; this slice ships it).

> **STATUS: LOCAL / UNPUSHED.** Verified this session: implementation commit `c4407ae4d` is
> **not** an ancestor of `origin/v2-main` (`git merge-base --is-ancestor c4407ae4d
> origin/v2-main` → false). `origin/v2-main` is `ba0af6616`; local is **4 ahead / 0 behind**
> (`360e1c4a8` parallel smoke fix · `8c797ca27` AI-REPAIR-COVERAGE-2 closeout · `bebf4c206`
> parallel V2-READY-53 security test · `c4407ae4d` this slice). **No migration, no feature
> flag.** Not prod-smoked.

---

## 1. Summary

Promotes the **existing** `unreachable_node` graph finding from a generic one-line "Needs
attention" item to a **dedicated, guidance-only card** in the Builder AI panel. It is
**deliberately NOT apply-capable**: fixing an orphan step requires user intent
(reconnect to which upstream step? move to which branch? delete? keep as draft work?), so
there is no Preview and no Apply.

## 2. Completed commit chain

- `c4407ae4d` — guidance-only unreachable/orphan-node Check card (AI-GUIDANCE-UNREACHABLE-NODE-1) _(2026-06-17)_ — **local/unpushed**

## 3. Selected category & current detection behavior

- **Category:** unreachable / orphan **action** node guidance. The existing
  `unreachable_node` detection was **reused** — this slice added no new detector.
- **Detection is unchanged.** `unreachable_node` is emitted by the shared runtime validator
  [`core/workflows/executionReadiness.ts`](../../../../core/workflows/executionReadiness.ts)
  `findGraphIssues` (a non-trigger node not reachable from the trigger). It is a **real
  runtime / Activate blocker** — it drives `runnable` false / `INVALID_WORKFLOW_GRAPH` through
  [`services/workflows/executionReadiness.ts`](../../../../services/workflows/executionReadiness.ts)
  `checkWorkflowReadiness` (run-now preflight, Activate gate, engine pre-dispatch). This slice
  did **not** touch any of that — it is a **Builder AI presentation enhancement only**.
- The diagnosis already emits one `unreachable_node` finding per orphan node, each carrying
  its SAFE `nodeLabels`
  ([`services/ai/diagnostics/diagnoseWorkflowForAgent.ts`](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts)).
  This slice consumes those findings in the UI layer; the diagnosis was not changed.

## 4. User-facing behavior

In the Builder AI "Needs attention" group
([`features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx)
→ `UnreachableNodeCardView` in
[`_BuilderAiPanelInvalidRefCard.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelInvalidRefCard.tsx)),
an orphan step now renders a dedicated card built by `unreachableNodeCards`
([`features/workflow-builder/ai/attentionFindings.ts`](../../../../features/workflow-builder/ai/attentionFindings.ts)):

- **Count-aware copy:**
  - singular — "A step in this workflow isn't connected to the trigger, so it won't run."
  - plural — "N steps in this workflow aren't connected to the trigger, so they won't run."
- **Lists the safe step display labels** of the orphan step(s).
- **"What you can do" guidance:** connect it to the workflow · move it into the right branch
  · delete it if you don't need it.
- **Multiple unreachable findings are aggregated into ONE card** (labels collected, count
  derived from the total).

## 5. Explicit no-Apply boundary

- **No "Preview fix" button. No "Apply" button.** `UnreachableNodeCardView` takes no
  `onPreviewFix` / `onApply` / callback prop — it renders only text + lists.
- **No patch generation, no repair strategy, no preview-route flag, no model call, no AI
  credit.** Nothing in `services/ai/repair/*` or the preview route was added or touched.
- A render test asserts the card contains **no `<button>` and no `<a>`** of any kind.

## 6. Security / no-leak guarantees

- Cards and views render **safe step display labels only** — never raw node ids, edge ids,
  DB ids, config values, provider errors, secrets, or tokens.
- Tests assert the raw node ids never reach the card payload (`unreachableNodeCards` builder:
  `node-uuid-secret` / `n-a` absent from the serialized card) nor the DOM
  (`DiagnosisAttentionActions` render: `node-secret-1` absent from `card.textContent`).

## 7. Scope boundaries (unchanged)

- No backend / runtime / execution behavior change (detection reused as-is).
- No activation / deactivation / trigger-registration change.
- No credential / integration / provider-account mutation.
- No DB migration. No feature flag.

## 8. Verification baseline

> **Honesty note:** the results below are **inherited from / reported by the
> AI-GUIDANCE-UNREACHABLE-NODE-1 implementation session at `c4407ae4d`.** They were **not
> re-run during this docs-only closeout session.**

Measured at `c4407ae4d` (implementation session):
- Focused — `unreachableNodeCards` + `DiagnosisAttentionActions` → **11 passed**.
- Regression — `tests/unit/features/workflow-builder/panels` + `…/ai` → **64 suites / 802
  tests passed** (the one pre-existing `attentionFindings` test asserting the OLD generic-card
  behavior was updated to assert `unreachable_node` is now excluded from the generic cards).
- `npx tsc --noEmit` → **exit 0**.
- `npx eslint` on the **6 touched files** → **0 problems**.
- `npm run lint:structure` → **OK**.

**Migrations:** none. **Flags:** none. **Production:** not pushed, not prod-smoked.

## 9. Deferred / known limitations

- **No auto-repair yet** — guidance-only by design.
- A future **user-choice repair flow** could support "connect to a selected upstream step" or
  "delete this node," but **only** after designing explicit user intent (the app must never
  guess the target). Until then:
  - `removeNode` remains **apply-blocked** (`applySafety.ts` `APPLY_BLOCKED_OPERATION_KINDS`).
  - `addEdge` **target selection is ambiguous** without a user choice, so it stays out of the
    deterministic Apply path.
- The card aggregates labels into one card; per-node "open the step" navigation was not added
  (kept minimal — pure guidance).

## 10. Recommended next tracks

1. **User-choice orphan repair** (the deferred §9 flow) — connect-to-selected-upstream or
   delete-node, gated behind explicit user selection + its own safety-contract review.
2. **Automated repair/guidance smoke** covering the deterministic repair categories +
   guidance cards so presentation regressions surface without manual checking.

## 11. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/ai/ai-guidance-unreachable-node-1-closeout.md`.
