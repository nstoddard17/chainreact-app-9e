# 4.AI-REPAIR-COVERAGE-1 — Self-loop edge cleanup repair — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-17
**Branch:** `v2-main`
**Predecessor arc:** [ai-repair-4-dangling-edge-closeout.md](./ai-repair-4-dangling-edge-closeout.md)
(this is its "next safe repair category", reusing the same `removeEdge` + validated-preview
+ apply machinery).

> **STATUS: LOCAL / UNPUSHED.** The single commit is local on `v2-main` and **not pushed**
> (`882519ba0`). Not yet production-smoked. No new feature flag; no migration. The
> deterministic Check / Preview / Apply paths are 0-credit and independent of
> `ENABLE_AI_CREDIT_ENFORCEMENT` (unchanged, OFF).

---

## 1. Summary

Adds the next deterministic, model-free Check → Preview → Apply repair category: removing a
**self-loop edge** — a connection whose `from === to` (a step wired to itself). It mirrors
the dangling-edge repair (AI-REPAIR-4) and rides the exact same `removeEdge` + validated
preview + apply path.

**Why this category:** self-loops are **deterministic, unambiguous, `removeEdge`-only**, and
safely reuse the dangling-edge repair machinery. There is exactly one correct fix (drop the
edge), no guessed endpoint, no branch-semantics judgement call — which is what made it the
lowest-risk next category to make actionable.

## 2. Completed commit chain

- `882519ba0` — deterministic self-loop edge cleanup repair (AI-REPAIR-COVERAGE-1) _(2026-06-17)_

> HEAD sits atop interleaved **parallel** commits from other sessions (`db9459f50` PROJECT_MEMORY
> curation, `1f34cd7ba` / `88cf2d483` grant-audit security, `33d7aa6a4` builder-UX docs). Those
> are **not** part of this slice — AI-REPAIR-COVERAGE-1 is the single commit above.

## 3. Important architectural decision — Check-only detection

Detection was added to the **Check / readiness / AI-diagnosis path only** — a new pure
`core/workflows/selfLoopEdges.findSelfLoopEdges`, surfaced through the readiness **diagnostic**
service (`services/diagnostics/workflowReadiness.ts`).

The shared **runtime / activation** graph validator (`findGraphIssues`) was **intentionally
NOT changed.** Adding self-loop detection there would alter run-now preflight and the Activate
gate — behavior this slice forbids. Check is therefore deliberately **stricter than runtime**
here, exactly like the invalid-variable-reference precedent (AI-REPAIR-3): Check flags and
blocks readiness, while the engine's runnable / run-now / Activate gates are untouched.

## 4. Current behavior (end to end)

**Check** (`diagnoseWorkflowForAgent`):
- `findSelfLoopEdges` runs in the readiness diagnostic service.
- `diagnoseWorkflowForAgent` emits a `SELF_LOOP_EDGE` finding using **safe step labels only**
  (raw edge / node ids stay server-side; the deterministic preview re-derives them).
- The finding gates `overallReady` **false** for Check / diagnosis.
- The shared **runtime / activation gate is untouched** — a self-loop does not change the
  engine's runnable, run-now preflight, or the Activate gate.

**Deterministic Preview** (`runSelfLoopEdgeRepairPreview` via `buildSelfLoopEdgeRepairOutcome`;
route branch `repairSelfLoopEdges` runs **before** the OpenAI-config check / `aiCreditGate` /
model client — same free ordering as the dangling-edge path):
- Calls the self-loop repair **strategy**, building a `removeEdge` patch for **all** self-loop
  edges.
- Validates through the **existing** preview / apply safety engine (`validateWorkflowPatch` +
  `assessApplyReadiness`) — the same path the dangling-edge repair uses.
- **No LLM, no AI credit, no model-call telemetry.**
- **Fail-closed** (null) if anything else about the resulting workflow is invalid.

**Apply** (existing AI-REPAIR-3D `/ai/repair/apply` route):
- **Apply-capable**, available **only after a validated preview** (Apply lives on the preview
  card, never on the Check card).
- **`removeEdge` only**; **batch-removes** all self-loop edges in one validated apply.
- **Persists the DRAFT definition only.**
- **Never** runs / activates / deactivates / registers-deregisters triggers; **never** mutates
  credentials / integrations / provider accounts.

## 5. Security / no-leak guarantees

- **No raw identifiers in user-facing copy** — cards/descriptors/summaries render safe step
  **labels** only; no raw node ids, edge ids, DB ids, config values, provider errors, secrets,
  or tokens ever reach the DOM or the model-visible diagnosis payload (verified by the
  `selfLoopEdgeCards` no-leak tests).
- **No model-generated patch** — the `removeEdge` patch is built deterministically; the model
  never proposes the fix.
- **No Hermes, no generic Q&A** — this is a single deterministic repair category, not an agent
  loop or free-text answer surface.
- **No DB migration, no feature flag** — nothing to gate or unapply.
- **`removeEdge` is the only operation** — no node deletion, no guessed endpoints, no
  branch-label changes, no trigger changes; Apply eligibility is **not** broadened.

## 6. Data / RLS / model notes

- **No migration. No new feature flag. No DB / env changes.** Apply persists via the existing
  account-scoped workflow `draftDefinition` update.
- Account model unchanged — repair operates on the account-owned workflow draft only.
- `ENABLE_AI_CREDIT_ENFORCEMENT` unchanged (OFF) and irrelevant — these paths are deterministic
  and 0-credit regardless.

## 7. UI behavior

- A "Needs attention" **self-loop card** with a "Preview fix" button, wired through the existing
  diagnosis-actions chain. Every affordance maps to a real deterministic path — no
  fake/unsupported controls. Apply appears only on the resulting validated preview as a separate
  click.

## 8. Verification baseline

> **Honesty note:** the results below are **inherited from / reported by the
> AI-REPAIR-COVERAGE-1 implementation session** (`882519ba0`). They were **not re-run during
> this docs-only closeout session.**

**Focused tests (from the implementation report — 17 added):**
- `selfLoopEdges` — **4** (`tests/unit/core/workflows/selfLoopEdges.test.ts`)
- `buildSelfLoopEdgeRepairOutcome` — **3** (`tests/unit/services/ai/repair/selfLoopEdgeRepairOutcome.test.ts`)
- `selfLoopEdgeCards` no-leak — **4** (`tests/unit/features/workflow-builder/ai/selfLoopEdgeCards.test.ts`)
- readiness Check-only-no-runtime-change — **2** (`tests/unit/services/diagnostics/workflowReadiness.test.ts`)
- diagnose finding + `overallReady` gate + no-leak — **1** (`tests/unit/services/ai/diagnostics/diagnoseWorkflowForAgent.test.ts`)
- route branch no-gate / no-model — **3** (`tests/unit/app/api/workflows/ai-repair-preview-route.test.ts`)

**Static checks (reported by the implementation session, not re-run here):**
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → **0 errors / 24 warnings** — including the **soft `max-lines` warning** in
  `features/workflow-builder/panels/useBuilderDiagnosisActions.ts` (now **535 lines**, over the
  soft 400-line cap; see §9).
- `npm run lint:structure` → **OK**.

**Migrations:** none in this slice. **Flags:** none added; `ENABLE_AI_CREDIT_ENFORCEMENT`
unchanged (OFF). **Production:** not smoked yet (local-only).

## 9. Deferred / known limitations

- **Duplicate-edge repair intentionally not bundled** — labels and branch semantics are
  murkier than the unambiguous self-loop case; it needs its own safety-contract review before
  becoming actionable.
- **Stale static-option clearing deferred** — clearing stale config values carries more product
  risk than a pure `removeEdge`, so it stays out of this slice.
- **`useBuilderDiagnosisActions.ts` crossed the soft 400-line cap** (now 535 lines, surfacing the
  soft `max-lines` lint warning). Future handler work on this file should **extract the
  preview / apply handlers** rather than continue growing it in place.
- **Not pushed / not prod-smoked** — needs the same manual prod smoke the AI-REPAIR-3 flows got
  before being marked LIVE.

## 10. Recommended next tracks

1. **Push + prod-smoke** AI-REPAIR-COVERAGE-1 alongside the next approved batch, then mark LIVE.
2. **Extract preview/apply handlers** out of `useBuilderDiagnosisActions.ts` to bring it back
   under the soft cap before adding the next repair category.
3. **Next safe repair category** (duplicate-edge / stale static-option) — each behind its own
   safety-contract review, `removeEdge`-style narrow ops, Check-only detection.

## 11. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/ai/ai-repair-coverage-1-self-loop-closeout.md`.
