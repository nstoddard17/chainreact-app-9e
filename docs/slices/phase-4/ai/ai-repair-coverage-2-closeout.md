# 4.AI-REPAIR-COVERAGE-2 — Narrow duplicate-edge cleanup repair — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-17
**Branch:** `v2-main`
**Predecessor arc:** [ai-repair-coverage-1-self-loop-closeout.md](./ai-repair-coverage-1-self-loop-closeout.md)
· **Plan:** [ai-repair-coverage-2-plan.md](./ai-repair-coverage-2-plan.md) (approved option A).

> **STATUS: PUSHED.** The implementation commit `b45bcabbc` is an **ancestor of
> `origin/v2-main`** (verified this session: `git merge-base --is-ancestor b45bcabbc
> origin/v2-main` → true; `origin/v2-main` was `ba0af6616` at fetch time). Per the project's
> push posture, a `v2-main` push **deploys to production**, so COVERAGE-2 is **not local-only**
> — it shipped as part of the verified batch. No separate duplicate-edge prod smoke is
> recorded. **No migration, no feature flag.** (The local branch is concurrently moving —
> parallel-session commits land between measurements; this docs-only closeout commit and any
> such parallel commits are not yet pushed.)

---

## 1. Summary

Adds the **4th** deterministic, model-free Check → Preview → Apply repair category: removing
a **redundant duplicate edge** — a later edge identical to an earlier one by the graph's own
edge-identity key `(from, to, label ?? "")`. It mirrors the self-loop / dangling-edge repairs
and rides the exact `removeEdge` + validated-preview + apply path (the `runFreeRepairPreview`
seam from `AI-REPAIR-HANDLER-CLEANUP-1`). **Narrow by construction:** same `from/to` with
*different* labels are legitimate branch fan-out and are never flagged.

## 2. Completed commit chain

- `b45bcabbc` — deterministic narrow duplicate-edge cleanup repair (AI-REPAIR-COVERAGE-2) _(2026-06-17)_ — **on `origin/v2-main`**

> **Context — what landed after COVERAGE-2 on `v2-main`** (separate arcs, NOT part of this
> slice, listed so the next reader isn't surprised the tree moved):
> `e1ad28d82` V2-READY-51 hotfix (routed `workflow_run_stats` read through service-role — this
> absorbed the unrelated `repositories/workflowRunStats.ts` change that was deliberately
> excluded from `b45bcabbc`) · `55557a2fe` + `d98f877b9` schema-driven field sensitivity
> (AI-REPAIR-SAFETY-HARDENING CS-1/2/3 + full-registry sweep) · `cdff74e4c`/`625461211`/
> `5c20d0011`/`eff216374`/`ba0af6616` AI-READINESS-CONVERGENCE (self-loop promoted into the
> shared graph verdict; invalid-ref gated at Activate + Publish) · `360e1c4a8` smoke selector
> fix. **See §3.1 — the convergence arc changed self-loop, NOT duplicate-edge.**

## 3. Current behavior (end to end)

**Selected category — narrow duplicate-edge cleanup.** A duplicate is **only** two-or-more
edges with the **same `from`, same `to`, and same `label ?? ""`** —
[`core/workflows/duplicateEdges.ts`](../../../../core/workflows/duplicateEdges.ts)
`findDuplicateEdges` keys on `${from}->${to}::${label ?? ""}`, **keeps the first** edge in
source order, and returns every later redundant copy. Same `from/to` with **different** labels
are distinct branches and are never returned.

**Why it is safe:**
- The graph/schema edge identity is `from + to + label` — exactly the dedup key in
  [`contracts/workflowDefinition.ts`](../../../../contracts/workflowDefinition.ts)
  `WorkflowDefinitionSchema.superRefine`.
- `label` is **branch-discriminating**: the engine
  ([`services/execution/branching.ts`](../../../../services/execution/branching.ts)
  `selectActivatedEdges`) follows a labeled edge only when `branchTaken === label`.
- **Broad `from/to`-only cleanup was rejected** (it would delete legitimate fan-out).
- Removing redundant same-triple copies preserves branch behavior and reachability (both
  copies resolve to the same target under the same branch decision; removal is a no-op or
  removes a harmless double-activation). `WorkflowGraphView.edges` carries the full
  `WorkflowEdge` (label preserved), so the strategy keys correctly too.

**Check** ([`services/diagnostics/workflowReadiness.ts`](../../../../services/diagnostics/workflowReadiness.ts)
→ [`services/ai/diagnostics/diagnoseWorkflowForAgent.ts`](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts)):
- `findDuplicateEdges` runs in the readiness diagnostic; the DTO carries `duplicateEdges`
  (`{fromNodeId, toNodeId}` — internal ids, never rendered).
- `diagnoseWorkflowForAgent` emits a `DUPLICATE_EDGE` finding with safe endpoint **labels**
  (`duplicateConnections: {fromLabel, toLabel}`) and gates `overallReady` **false**.
- The shared runtime/activation validator `findGraphIssues` is **untouched by duplicate-edge
  detection** — Check stays **stricter than runtime** for this category (same stance as the
  invalid-ref / self-loop precedents). A duplicate does **not** change `runnable` / the
  Activate gate / run-now.

**Preview** ([`services/ai/repair/deterministicRepairPreview.ts`](../../../../services/ai/repair/deterministicRepairPreview.ts)):
- "Preview fix" calls `runDuplicateEdgeRepairPreview`;
  [`repairStrategies.ts`](../../../../services/ai/repair/repairStrategies.ts)
  `buildDuplicateEdgeRepairOutcome` builds a **`removeEdge`-only** patch (keep-first of each
  identical group) and runs it through the **existing** validate + apply-safety engine.
- **No LLM, no AI credit, no model telemetry.** The route branch (`repairDuplicateEdges`) in
  [`app/api/workflows/[id]/ai/repair/preview/route.ts`](../../../../app/api/workflows/[id]/ai/repair/preview/route.ts)
  runs **before** the credit gate / model, same free ordering as the dangling/self-loop paths.
- **Fail-closed:** if validation or apply-safety fails (e.g. another invalid edge remains),
  the preview returns null → the route responds `NO_SAFE_PATCH`.

**Apply** (existing AI-REPAIR-3D `/ai/repair/apply` route):
- Apply-capable **only after a validated preview**; **`removeEdge` only**; **persists the
  draft definition only**.
- **Never** runs / activates / deactivates / registers-deregisters triggers; **never** mutates
  credentials / integrations / provider accounts.

### 3.1 Interaction with the later AI-READINESS-CONVERGENCE arc (important)

After COVERAGE-2 shipped, a **separate** arc (`5c20d0011`, AI-READINESS-CONVERGENCE CS-1)
**promoted SELF-LOOP edges into the shared `findGraphIssues` verdict** (code `self_loop_edge`),
so self-loop is no longer Check-only and now drives `runnable`/Activate. **This did NOT change
duplicate-edge behavior:** `findDuplicateEdges` is still Check-only, `findGraphIssues` contains
no duplicate-edge check, and a redundant duplicate still does not block `runnable`/Activate.
The COVERAGE-2 readiness/diagnose tests were edited by that arc only where they share the
file with self-loop assertions; the duplicate-edge assertions are unchanged.

## 4. Branch preservation

- Same `from/to` with **different labels** are **never** flagged, previewed, or altered (the
  dedup key includes `label`). Verified at every layer: finder, strategy, and readiness tests
  each assert different-label and one-labeled+one-unlabeled pairs are **not** duplicates.
- **Router fan-out** to the same downstream step with different labels (e.g. `yes`/`no` →
  same step) remains valid and untouched.

## 5. Security / no-leak guarantees

- **User-facing copy uses safe endpoint STEP labels only** — never raw node ids, edge ids, DB
  ids, the **branch label**, config values, provider errors, secrets, or tokens. The
  `duplicateEdgeCards` no-leak test asserts the rendered card never contains `node-`/`edge-`/
  `label`; the diagnose test asserts raw node ids never reach the finding fields or summary.
- **No model-generated patch** — the `removeEdge` patch is built deterministically.
- **No Hermes, no generic Q&A** — single deterministic repair category.
- **No DB migration, no feature flag** — pure detection + `removeEdge` over the account-owned
  draft, through the existing apply-safety engine; `removeEdge` is already apply-eligible (the
  Apply allow-list was **not** broadened).

## 6. Data / RLS / model notes

- **No migration, no new feature flag, no DB/env change.** `duplicateEdges` is an additive,
  default-empty readiness DTO term; `DUPLICATE_EDGE` is an additive finding code.
- Account model unchanged — repair operates on the account-owned workflow draft only; the
  credential-sharing/creator-pin policy is untouched.

## 7. UI behavior

- A "Needs attention" duplicate-edge card with count-aware copy (singular/plural) and one
  "Preview fix" button, wired through the diagnosis-actions chain
  ([`useBuilderDiagnosisActions.ts`](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts)
  `handlePreviewDuplicateEdgeFix` via `runFreeRepairPreview`). Apply remains a separate click
  on the resulting validated preview. Every affordance maps to a real deterministic path — no
  fake/unsupported controls.

## 8. Verification baseline

> **Honesty note:** the results below are **inherited from / reported by the
> AI-REPAIR-COVERAGE-2 implementation session at `b45bcabbc`.** They were **not re-run during
> this docs-only closeout session.** Since `b45bcabbc`, later arcs (field-sensitivity +
> readiness-convergence) modified some of the shared readiness/diagnose test files, so exact
> suite counts will differ on a fresh run today; the duplicate-edge assertions themselves were
> not changed by those arcs.

Measured at `b45bcabbc` (implementation session):
- Focused suite — **9 suites / 122 tests passed** (`duplicateEdges`,
  `duplicateEdgeRepairOutcome`, `duplicateEdgeCards`, plus the extended `workflowReadiness`,
  `diagnoseWorkflowForAgent`, `ai-repair-preview-route`, and the self-loop adjacents).
- Regression — **63 suites / 795 tests passed** across
  `tests/unit/features/workflow-builder/panels` + `…/ai` (variable-ref, dangling-edge,
  self-loop, repair UI all green).
- `npx tsc --noEmit` → **exit 0**.
- `npx eslint` on the **23 touched files** → **0 problems**.
- `npm run lint:structure` → **OK**.

**Parallel-work note:** the unrelated `repositories/workflowRunStats.ts` change was
deliberately **excluded** from `b45bcabbc` (left unstaged); it was subsequently handled by the
separate V2-READY-51 hotfix `e1ad28d82`. The only working-tree change this session is an
unrelated `tests/smoke/builder.smoke.spec.ts` modification (parallel work — left untouched).

**Migrations:** none. **Flags:** none added. **Production:** pushed via the verified batch (no
separate duplicate-edge prod smoke recorded).

## 9. Deferred / known limitations

- **Occurrence is rare and unverified.** A redundant duplicate can only originate from
  legacy / un-revalidated stored JSONB — every strict write path rejects it via the schema
  (the plan's §2.4 finding). This is defense-in-depth + Check-stricter-than-runtime, the same
  rationale accepted for self-loop.
- **Repair-strategy registry** (plan §6) was **not** built — kept as a maintainability
  follow-up to bundle if/when a 5th category lands; the 4 edge-style builders + per-category
  route branches remain explicit.

## 10. Recommended next tracks

1. **AI-REPAIR-SAFETY-HARDENING follow-through** — already partly shipped (field-sensitivity
   CS-1/2/3 + sweep `55557a2fe`/`d98f877b9`); verify coverage guard stays green.
2. **Repair-strategy registry** (plan §6) — only when a 5th deterministic category is added.
3. **Automated repair smoke** covering all four deterministic categories (variable-ref,
   dangling, self-loop, duplicate) so regressions surface without manual checking.

## 11. Closeout confirmation

Docs-only. Nothing pushed from this closeout slice. Doc:
`docs/slices/phase-4/ai/ai-repair-coverage-2-closeout.md`.
