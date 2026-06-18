# 4.AI-DIAG-QA-2 — Workflow diagnosis Q&A backend + telemetry alignment — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-17
**Branch:** `v2-main`
**Plan:** [ai-diag-qa-plan-1.md](./ai-diag-qa-plan-1.md) (CS-2 backend, flag-OFF was planned;
Marcus then decided **no flag** — built live behind the existing operational gates).

> **STATUS: LOCAL / UNPUSHED.** Verified this session: both commits are **not** ancestors of
> `origin/v2-main` (`git merge-base --is-ancestor … origin/v2-main` → false for each).
> `origin/v2-main` is `ba0af6616`; local is **10 ahead / 0 behind** (includes unrelated
> parallel-session commits). **No UI. No feature flag. One DB migration — applied to the DEV
> DB only (not pushed, not prod).**

---

## 1. Summary

- **AI-DIAG-QA-2 (`893f44001`)** — backend foundation for single-shot, explanation-only
  workflow diagnosis Q&A: a new route + orchestrator + safe-context projector + client. Mirrors
  the shipped "Explain with AI" (AI-DIAG-2) contract verbatim and adds a free-text question +
  an optional safe selected-node data summary. **No UI.**
- **AI-DIAG-QA-2-TELEMETRY-CHECK (`9ddd74df6`)** — makes `workflow_qa` a first-class
  `ai_cost_events.feature` value (migration) so Q&A telemetry records `feature: "workflow_qa"`
  directly instead of the temporary `other` fallback. Credit feature and telemetry feature are
  now aligned.

## 2. Completed commit chain

- `893f44001` — workflow diagnosis Q&A backend — route/service/client (AI-DIAG-QA-2) _(2026-06-17)_ — **local/unpushed**
- `9ddd74df6` — record workflow_qa telemetry first-class (AI-DIAG-QA-2-TELEMETRY-CHECK) _(2026-06-17)_ — **local/unpushed**

## 3. Backend route

**`POST /api/workflows/[id]/ai/diagnose/qa`**
([route](../../../../app/api/workflows/[id]/ai/diagnose/qa/route.ts)) — single-shot Q&A
only. **No UI yet. No feature flag added** (Marcus decision — live behind the same
operational gates as Explain: OpenAI configured + the existing `aiCreditGate` enforcement
flag). No multi-turn memory; the backend **never persists** model prose.

### Route ordering (mirrors Explain exactly)
1. `requireUser` (401).
2. Validate `question` — required string, trimmed, non-empty, **≤ 500 chars** (400 otherwise),
   before any diagnose/gate/model.
3. `parseDraftOverride` for the optional draft (strict `WorkflowDefinitionSchema`; 400 on bad).
4. `loadWorkflowForMember` — resolves the workflow-owning `accountId` server-side (no-leak 404).
5. `diagnoseWorkflowForAgent` — **re-derived server-side**; a client-posted DTO is never trusted.
6. Access wall — `dto.access !== "OK"` → return the safe access response, **no gate, no model**.
7. OpenAI provider/key check → **503 before gate/model** when unavailable (no charge).
8. `aiCreditGate` **before the model**.
9. Build the fast model client.
10. `answerWorkflowQuestion`
    ([orchestrator](../../../../services/ai/diagnostics/answerWorkflowQuestion.ts)).
11. Fail-open telemetry (`recordQaEvent`).
12. Safe response only.

## 4. Gating / billing

- Credit gate: `aiCreditGate({ accountId, feature: "workflow_qa", plannedTier: "fast" })` —
  **workflow-owning account billed, never client-supplied**.
- Denials: insufficient → **402 `AI_CREDITS_EXHAUSTED`**; frozen → **403
  `ACCOUNT_PENDING_DELETION`**; gate error → **503 `AI_GATE_ERROR`**; provider unavailable →
  **503 `MODEL_FAILED`** (no charge — checked before the gate).
- Charge: **1 credit** for `workflow_qa` (fast tier) via
  [`core/billing/aiCreditPolicy.ts`](../../../../core/billing/aiCreditPolicy.ts) `FEATURE_BASE_CREDITS`.

## 5. Telemetry alignment (`9ddd74df6`)

- **Migration**
  [`20260703000000_ai_cost_events_feature_add_workflow_qa.sql`](../../../../supabase/migrations/20260703000000_ai_cost_events_feature_add_workflow_qa.sql)
  drops + recreates `ai_cost_events_feature_chk` with the **same allowed set plus
  `workflow_qa`** (non-destructive, forward-only — repo migration style; existing `other` Q&A
  rows stay valid). `workflow_qa` added to the `AiCostFeature` union in
  [`repositories/aiCostEvents.ts`](../../../../repositories/aiCostEvents.ts).
- **Before:** the feature CHECK predated `workflow_qa`, so telemetry fell back to
  `ai_cost_events.feature = 'other'` + `metadata.kind = 'workflow_diagnosis_qa'` (compat
  workaround); the credit CHARGE was already metered as `workflow_qa`.
- **After:** telemetry records `ai_cost_events.feature = 'workflow_qa'` directly;
  `metadata.kind` remains `'workflow_diagnosis_qa'`; the redundant `metadata.chargeFeature`
  workaround was dropped. Credit feature and telemetry feature are aligned.
- **No data migration / destructive change.** Dev DB: **applied** via `npm run db:push`
  (project `qcepijemjlkssfkvzlio`). **Prod: NOT applied** — the normal deploy/migration flow
  must run it when this batch ships.

## 6. Safe context / no-leak

- A client-supplied DTO is **ignored**; the diagnosis DTO is **re-derived server-side**.
- The model sees only `buildDiagnosisQaContext(dto, selectedNode)`
  ([projector](../../../../services/ai/diagnostics/buildDiagnosisQaContext.ts)) — the Explain
  allow-list plus an optional safe selected-node summary of **path / type / description /
  sensitive-flag ONLY** (sensitive subtrees not descended).
- **Never** in the model payload or response: raw node ids, edge ids, DB ids, account ids,
  config values, provider bodies, tokens, secrets, raw run logs, unbounded workflow JSON, or
  `{{nodeId.path}}` reference tokens.
- `selectedNodeId` is **validated against the re-derived graph**; a bogus value is **ignored
  and never echoed** to the model or the response.

## 7. Answer boundaries

- **Text-only** explanation/advice. The user question is passed as **delimited DATA**, and the
  system prompt forbids treating it as instructions.
- Structured tool response with **Zod re-validation** + an **output-token cap**.
- Can set `needsUserDecision` (says it can't safely decide when user intent is required) and
  can **point to the existing "Preview fix"** when a deterministic repair exists.
- **Never** emits patch JSON; no Apply / run / activation / deactivation / credential /
  integration mutation.

## 8. Client

- `askDiagnosisQuestion(workflowId, question, draftDefinition?, selectedNodeId?)` in
  [`lib/api/ai/diagnostics.ts`](../../../../lib/api/ai/diagnostics.ts) — sends workflow id +
  question (+ optional draft + optional selectedNodeId); **never sends the raw DTO** as source
  of truth.

## 9. Verification baseline

> **Honesty note:** all results below are **inherited from / reported by the two
> implementation sessions** (`893f44001`, `9ddd74df6`). They were **NOT re-run during this
> docs-only closeout session.**

- **AI-DIAG-QA-2 backend (`893f44001`):** focused Q&A route/orchestrator/projector/client +
  Explain regression + credit-gate → **8 suites / 109 passed**; `tsc --noEmit` **0**; `eslint`
  on the 9 touched files **0**; `lint:structure` **OK**.
- **Telemetry CHECK (`9ddd74df6`):** focused Q&A/projector/orchestrator/client/Explain
  regression → **5 suites / 89 passed**; cost-event + credit-gate → **4 suites / 44 passed**;
  `tsc --noEmit` **0**; `eslint` on touched files **0**; `lint:migrations` **OK**;
  `lint:structure` **OK**.
- **Migrations:** `20260703000000` applied to **dev DB** (`db:push`); **not** prod.
- **Flags:** none added.

## 10. Deferred / scope boundaries

- **No UI** — CS-3 (question box + `diagnosis_qa` message kind + panel wiring) is the next
  slice. **No Hermes, no multi-turn, no generic workflow-building chat, no patch generation,
  no DB data migration, no new feature flag.**
- **Selected-node summary for team workflows:** built from the already-authorized definition
  (correct for team/business), deliberately NOT via the personal-account-scoped variables tool.
- **Durable rate limiting** for Q&A is deferred (hard ~500-char question cap + single-shot for
  now) — same posture as other public-facing AI surfaces.
- **Prod migration** must run on deploy (see §5).

## 11. Recommended next tracks

1. **CS-3 — Q&A UI:** question input + `diagnosis_qa` message kind + panel wiring + UI tests,
   with safe code-keyed error copy (402/403/503). Hold until Marcus opts to expose it.
2. **Ship the batch** (push + prod migration `20260703000000`) when a verified batch is approved.
3. **Durable Q&A rate limiting** as a follow-up before broad exposure.

## 12. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/ai/ai-diag-qa-2-closeout.md`.
