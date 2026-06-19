# Builder Activation / Readiness UX — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Marker:** `BUILDER-ACTIVATION-READINESS-UX-AUDIT-1` → closeout `BUILDER-ACTIVATION-READINESS-UX-CLOSEOUT-1`
**Scope:** workflow-builder — make the reason an Activate/Resume button is disabled by validation
**always visible** (was hover-only), with a Review link into the existing validation panel.

> **STATUS: LOCAL / UNPUSHED.** The single source commit is local on `v2-main` and **not pushed**.
> **No migration, no feature flag, no backend change.** Additive builder UI only — no change to
> activation rules, validation, routing, AI, billing, env, provider, or RLS.

---

## 1. Audit result — readiness UX was already strong

The audit found the readiness surface in good shape; only one concrete gap (see §2):

- **Computation** — [`collectBuilderValidationIssues`](../../../features/workflow-builder/validation/collectBuilderValidationIssues.ts)
  maps the shared `core/workflows` validator (`findGraphIssues` + required-fields) into builder issues.
  Messages are **plain-English and safe** (`"Add a trigger to your workflow."`, `"<Name> needs a
  <Field>."`) — no raw node ids / config keys. One actionable signal per node.
- **Labels** — node issues use friendly names via `getNodeDisplayName` (custom name → metadata label →
  formatted type), never the raw `provider:type` key or node id.
- **Rendering / ordering** — [`ValidationSummary`](../../../features/workflow-builder/validation/ValidationSummary.tsx)
  groups **errors before warnings**; each node-issue is a **button that calls `openNode`**, which opens
  the inspector **and** focuses the node on canvas (the tuned config-focus seam). `no_trigger` carries a
  "Choose trigger" action.
- **Gating** — [`LifecycleActions`](../../../features/workflow-builder/panels/LifecycleActions.tsx)
  disables Activate / Resume when `blockingIssueCount > 0` (the validator's error count). Pause /
  Reactivate stay available. **Validation rules were not loosened.**

## 2. Gap fixed

When a go-live action (Activate / Resume) was disabled by validation, the **only** explanation was a
hover-only `title` tooltip. Keyboard / touch users and anyone not hovering saw a greyed primary button
with no reason; the adjacent red "N issues" pill was not explicitly tied to it.

## 3. UX change

`LifecycleActions` now renders an **always-visible `role="status"` line** directly under a blocked
Activate / Resume button:

- Copy: **"N setup issue(s) to fix before activate/resume"** — pluralized, references the go-live verb.
- Includes a **"Review"** link **when wired** (`onReviewIssues`); `BuilderHeader` wires it to the
  existing validation-panel open callback (the same panel the header "N issues" pill opens).
- From the validation panel, clicking an issue opens / focuses the relevant node through the **existing**
  `openNode` path — no new navigation system.
- **Hidden** when there are no blocking issues, or when the action is not a go-live (e.g. Pause).

## 4. Security / safety

- **No activation rules changed** — Activate stays disabled exactly as before; this only *explains* it.
- No validation bypass; no real blocker hidden; an invalid workflow still cannot be activated.
- **No server writes** from viewing / reviewing issues — Review just opens a client-side panel.
- No AI / model behavior introduced.
- **No leak** — copy is the count + plain words; a test asserts no uuid-ish ids, no `provider:type`
  colon, and no `{{ }}` tokens appear. No secrets / credentials / DTO internals.

## 5. UI behavior

A disabled Activate / Resume now reads its reason inline ("2 setup issues to fix before activate ·
Review") instead of only on hover. "Review" opens the validation drawer; the rest of the readiness UX
(grouping, per-issue open + canvas focus, Choose-trigger) is unchanged. No fake or unsupported controls.

## 6. Verification baseline

**Re-run at closeout (this session):**
- `LifecycleActions` + `BuilderHeader` → **2 suites, 59 passed.**

**Original implementation verification (at `8faa6f3eb`):**
- `LifecycleActions` + `BuilderHeader` + `validation` → **103 passed** (7 new: visible reason +
  `role="status"` + count; singular / Resume copy; hidden at 0 issues; hidden on non-go-live Pause;
  Review fires `onReviewIssues`; renders without Review when unwired; **no-leak copy assertion**).
- Full `tests/unit/features/workflow-builder/layout/` + `…/panels/` → **630 passed** (no regressions).
- `eslint` on the 3 touched files → **0**; `npm run typecheck` → **clean (exit 0)**;
  `npm run lint:structure` → **OK**.

**Check workflow untouched** — no shared readiness validator / AI diagnosis code changed.
**Migrations:** none. **Feature flags:** none (additive UI, unconditional).

## 7. Deferred / known limitations

- A header-level "jump straight to the first blocking step" was **intentionally deferred** — reaching a
  step is currently one extra click (Review → issue), which is acceptable.
- Issue **ordering / copy rewrite was not needed** — existing readiness issue quality was already good
  (plain-English, safe labels, errors-before-warnings).

## 8. Recommended next tracks

- Optional one-click "go to first blocking step" from the header / blocked hint if usage shows the
  Review → issue hop is a friction point.

## 9. Closeout confirmation

**Docs-only. Nothing pushed.** Doc path:
`docs/slices/phase-4/workflows/builder-activation-readiness-ux-closeout.md`. The source commit
`8faa6f3eb` is local on `v2-main` and unpushed.
