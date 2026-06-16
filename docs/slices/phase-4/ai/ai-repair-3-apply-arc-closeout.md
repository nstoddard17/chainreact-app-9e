# 4.AI-REPAIR-3 — Apply Arc (Apply + deterministic variable-reference repair) — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-15
**Branch:** `v2-main`
**Plan / contract:** [ai-repair-3-apply-contract-plan.md](./ai-repair-3-apply-contract-plan.md)
**One-candidate smoke note:** [ai-repair-3j-one-candidate-apply-smoke.md](./ai-repair-3j-one-candidate-apply-smoke.md)

> **STATUS: LIVE IN PRODUCTION.** `HEAD == origin/v2-main == 589036fb0` (0 ahead). The
> 3G→3L flows were **manually production-smoked by Marcus (2026-06-15)** and confirmed
> working (zero / one / multiple candidate). No new feature flag; no migration. AI credit
> enforcement (`ENABLE_AI_CREDIT_ENFORCEMENT`) stays **OFF** and is irrelevant to these
> paths — the variable-reference Check/Preview/Apply are deterministic and 0-credit
> regardless.

---

## 1. Summary

This arc made workflow repair **applyable** and added a fully **deterministic,
model-free** repair for the most common real bug — a config field still referencing a
**deleted / unknown step** (`{{<gone>.path}}`).

- **3A–3C** — the apply **safety contract** (`assessApplyReadiness` / `classifyOperationSafety`),
  a dry-run readiness route, and a deterministic **in-memory patch executor**.
- **3D–3E** — a **guarded server persistence path** (re-authorize → re-validate against
  the FRESH definition → re-run safety → persist **draft only**, optimistic concurrency)
  and the **Apply button** on a validated preview.
- **3F** — split the repair/diagnosis panel files under the max-lines cap.
- **3G** — **Check** now deterministically detects invalid/deleted-node variable references.
- **3H** — the deterministic variable-reference preview is **no-credit / no-model /
  no-telemetry** (runs before the gate/model in the preview route).
- **3I** — when there's no safe automatic Apply, the issue is still **actionable** (manual
  "Open field" guidance keyed on a `none`/`one`/`multiple` candidate count).
- **3J** — exact **one-candidate Apply smoke fixture** + reproduction note (no code change
  needed — proved the path produces an applyable preview).
- **3K** — **one candidate → direct "Preview fix"** on the Check card.
- **3L** — **multiple candidates → explicit replacement picker** ("Preview selected fix");
  the app never auto-picks; the chosen reference is re-validated server-side.

## 2. Completed commit chain

- `8a4a93f97` — apply-readiness contract + safe-patch guardrails (AI-REPAIR-3A) _(2026-06-14)_
- `3bb63f75c` — dry-run apply-readiness route + service skeleton (AI-REPAIR-3B) _(2026-06-15)_
- `aa4000fdc` — deterministic in-memory patch executor (AI-REPAIR-3C) _(2026-06-15)_
- `aabe20eac` — guarded server persistence path for apply (AI-REPAIR-3D) _(2026-06-15)_
- `0d26c0d81` — Apply button for validated repair previews (AI-REPAIR-3E) _(2026-06-15)_
- `645389751` — split repair/diagnosis panel files under max-lines (AI-REPAIR-3F) _(2026-06-15)_
- `6236b7742` — detect invalid variable references in Check; deterministic preview (AI-REPAIR-3G) _(2026-06-15)_
- `8aa4c1766` — deterministic repair preview is no-credit/no-model-telemetry (AI-REPAIR-3H) _(2026-06-15)_
- `9af3a9ebe` — actionable invalid-reference UX when no safe Apply exists (AI-REPAIR-3I) _(2026-06-15)_
- `cfd918c1e` — exact one-candidate Apply smoke fixture + manual note (AI-REPAIR-3J) _(2026-06-15)_
- `bbf5d9c45` — direct "Preview fix" for one-candidate invalid references (AI-REPAIR-3K) _(2026-06-15)_
- `589036fb0` — explicit replacement picker for multiple candidates (AI-REPAIR-3L) _(2026-06-15)_

## 3. Current behavior (end to end)

**Check** (`diagnoseWorkflowForAgent`):
- Deterministically flags invalid/deleted-node variable references — **no LLM, no AI
  credits, no model-call telemetry**.
- Per broken ref it counts SAFE upstream replacements (same source the repair uses,
  `getAvailableVariablesForAI`) → `none` / `one` / `multiple`. For `multiple` on an
  **apply-safe field** it also emits safe candidate **options** (label + reference).

**Deterministic Preview** (variable-reference repair; preview route runs it **before** the
OpenAI-config check / `aiCreditGate` / model client / `ai_cost_events` recorders):
- **No LLM, no AI credits, no model-call telemetry.** Produces the SAME validated,
  applyable `PatchPreviewResult` the model path would (validation + apply-safety + risk).

**Apply** (`/ai/repair/apply`):
- **No LLM, no AI credits.** Re-authorizes, re-validates against the FRESH definition,
  re-runs the safety contract + executor, and **persists the draft definition only**
  (optimistic concurrency).
- Does **not** run, activate, deactivate, or register/deregister triggers.
- Does **not** mutate credentials / integrations / provider accounts.
- On success the builder refetches + re-hydrates; UI shows "Applied fix. Workflow not run."

### User flows
- **Zero candidates** → "Needs attention" card with manual **"Open field"** guidance. No
  picker, **no Preview, no Apply**.
- **One candidate** → **"Preview fix"** on the Check card → deterministic preview →
  **"Apply fix"** (separate click) → draft saved, not run.
- **Multiple candidates** → **replacement picker** (safe labels) → choose → **"Preview
  selected fix"** (re-validated server-side) → preview → **"Apply fix"** (separate click)
  → draft saved, not run. The app **never auto-picks**.

## 4. Security / no-leak guarantees

- **Apply eligibility is fail-closed** (`assessApplyReadiness` + `classifyOperationSafety`):
  only config / variable-reference / edge / move ops; secret / credential-or-account /
  recipient-destination / destructive-deletion / whole-graph / trigger-change ops are
  **blocked**. The repair path keys safety on the **target field** — a secret/recipient
  field is never auto-rewritten, and the `multiple` picker shows **no options** there.
- **No raw identifiers in the UI.** Node ids, field keys, tokens, and candidate
  `reference` strings are navigation/selection values only — the UI renders **labels**.
  Candidate option values are list **indices** (no node-id-bearing reference in the DOM).
- **Anti-injection on selection** (3L): a user-chosen replacement is accepted only if it
  is one of the server-recomputed candidates for that exact broken ref; then it still runs
  the same validate + apply-safety engine. The model path never receives selected op text.
- **Apply re-derives trust server-side** — operations are re-validated against the fresh
  definition; a stale/changed graph → `STALE_PATCH` (no write).

## 5. Data / RLS / model notes

- **No migration in 3G→3L.** Apply persists via the existing workflow repository
  (account-scoped `draftDefinition` update); no new tables / columns.
- **No new feature flag.** Deterministic Check/Preview/Apply are 0-credit independent of
  `ENABLE_AI_CREDIT_ENFORCEMENT` (OFF). The paid LLM repair preview (AI-REPAIR-2) is a
  separate, gated path and is unchanged.
- Account-model unchanged — repair operates on the account-owned workflow draft only.

## 6. UI behavior

- "Needs attention" invalid-reference card renders, per candidate count: manual Open-field
  (zero), direct "Preview fix" + Open-field (one), or a replacement `<select>` + "Preview
  selected fix" + Open-field (multiple). Apply lives **only** on the resulting preview card
  (never on a Check card). No fake/unsupported controls — every affordance is wired to a
  real deterministic path.

## 7. Deferred / known limitations

- **More repair categories** (beyond variable-reference re-pointing) only **after** each
  gets its own safety contract — no broadening of Apply eligibility without it.
- **Variable-picker UX polish** — richer candidate labels / grouping / inline preview of
  the source value could improve the multiple-candidate choice (today: "path — from step").
- **Stronger production-smoke automation** — the 3G→3L flows are currently validated by
  **manual** prod smoke; an automated repair smoke would catch regressions earlier.
- **Billing dashboard clarity** — make the deterministic (free) vs model (metered) AI
  actions legible to users once AI credit enforcement is turned on.

## 8. Verification baseline

**Run this session** (during the 3K/3L slices and this closeout, on the as-shipped tree):
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → **0 errors** (pre-existing max-lines/unused warnings only; none in the
  arc's files).
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).
- Focused Jest suites green, e.g. `tests/unit/services/ai/repair/*` (deterministic preview,
  one-candidate smoke, multi-candidate selected preview), `ai-repair-preview-route`,
  `ai-repair-apply-route`, `applyRepairPatch`, `diagnoseWorkflowForAgent`,
  `BuilderAiPanel.invalidReference`, `attentionFindings`, `DiagnosisAttentionActions`,
  `BuilderAiPanel.repairApply`. Full `npm test` **not run this session**.

**Production:** **manual** smoke by Marcus (2026-06-15) confirmed zero / one / multiple
candidate flows. No automated prod-smoke for repair yet.

**Migrations:** none in this arc. **Flags:** none added; `ENABLE_AI_CREDIT_ENFORCEMENT`
unchanged (OFF) and irrelevant to these deterministic paths.

## 9. Recommended next tracks

1. **Automated repair smoke** — an e2e/prod smoke covering the three candidate flows so
   regressions surface without manual checking.
2. **Next safe repair category** — pick one (e.g. dangling-edge cleanup is already an
   executor op) and ship it behind its own safety-contract review.
3. **Candidate-label polish** — improve the multiple-candidate picker labels using the
   variable picker's richer metadata.
4. **AI-billing legibility** — surface deterministic-free vs model-metered before turning
   on credit enforcement.

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/ai/ai-repair-3-apply-arc-closeout.md`.
