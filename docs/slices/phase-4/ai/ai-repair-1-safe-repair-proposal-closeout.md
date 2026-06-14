# 4.AI-REPAIR-1 — Safe Repair-Plan Proposal — Closeout

**Type:** Closeout (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Plan:** [ai-repair-1-safe-repair-proposal-plan.md](./ai-repair-1-safe-repair-proposal-plan.md)

> **STATUS: PRODUCTION WORKING.** Marcus confirmed AI-REPAIR-1 and the follow-up
> diagnosis-trust fix (AI-DIAG-FIX-1) are live and working in production. AI credit
> enforcement stays OFF; Hermes / MCP / apply / patch remain deferred. This closeout
> is **not pushed** — local `v2-main` commit only, awaiting Marcus's approval.

---

## 1. Summary

- **AI-REPAIR-1a** — planning doc only (no code).
- **AI-REPAIR-1b** — `POST /api/workflows/[id]/ai/repair/plan` route + `planWorkflowRepair`
  service + `lib/api/ai.ts` client + service/route tests. Metered, **proposal-only** LLM
  repair plan over the safe diagnosis DTO. No UI yet (route inert until 1c wired a button).
- **AI-REPAIR-1c** — Builder UI: a "Suggest a fix" button on the gated diagnosis bubble +
  a `repair_proposal` message bubble rendering the proposal. **No Apply control.**
- **AI-DIAG-FIX-1 (follow-up trust fix)** — "Check workflow" / "Explain with AI" /
  "Suggest a fix" now diagnose the **current visible (unsaved) builder state**, not stale
  saved server state, and all user-facing diagnosis/explain/repair output uses **node
  display labels, never raw node IDs**.

---

## 2. Completed commit chain

```
69ccecb32 — docs(ai-repair): safe repair-plan proposal (no apply) plan (AI-REPAIR-1a) _(2026-06-13)_
edc139934 — feat(builder-ai): add safe workflow repair planning route (AI-REPAIR-1b) _(2026-06-13)_
399d13e87 — feat(builder-ai): add repair proposal UI (AI-REPAIR-1c) _(2026-06-13)_
92ea2968d — fix(builder-ai): diagnose current builder state + use node labels (AI-DIAG-FIX-1) _(2026-06-13)_
```

(`a0ea1cffe` CS-5b landed interleaved on the same day but belongs to the conn-share arc,
not this one.)

---

## 3. Current behavior (end to end)

1. In the Builder AI panel, **"Check workflow"** runs the deterministic
   `diagnoseWorkflowForAgent` diagnosis. The client now POSTs an optional
   `draftDefinition` snapshot of the current in-memory builder graph
   (graphSlice `pendingNodes`/`pendingEdges`), so the diagnosis evaluates **what the user
   is looking at**, not the last-saved `draftDefinition`. The snapshot is strictly
   validated against `WorkflowDefinitionSchema`, used for the deterministic re-derivation
   only, and **never persisted** ([draftOverride.ts](../../../../services/ai/diagnostics/draftOverride.ts)).
2. **Clean / ready** workflows: the diagnosis bubble shows **neither "Explain with AI" nor
   "Suggest a fix"** — there is nothing to explain or repair (`canExplainDiagnosis` gate;
   shipped originally in `8a246ef1f`, reused for the repair affordance).
3. **Broken** workflows (real findings): the diagnosis bubble shows **both "Explain with
   AI" and "Suggest a fix"** as sibling actions on the latest diagnosis only.
4. **"Suggest a fix"** (explicit click only — never auto-called) calls
   `POST /api/workflows/[id]/ai/repair/plan`. The route re-derives the diagnosis
   server-side (ignores any client-posted DTO), runs the OpenAI `fast` model via
   `planWorkflowRepair`, and returns `{ ok, proposal }`.
5. The proposal renders as a **proposal-only `repair_proposal` bubble** — summary,
   recommended actions, affected nodes (safe labels), missing info, the AI's **advisory**
   risk estimate, and an **immutable "this is a suggestion only — your workflow wasn't
   changed, saved, or run" notice**. **No Apply button exists** (not even disabled).
6. **No workflow graph mutation, save, or run** happens anywhere in this flow.

---

## 4. Security / no-leak guarantees

- **Server-side DTO re-derivation.** The repair route never trusts a client-posted
  diagnosis — it re-runs `diagnoseWorkflowForAgent` itself
  ([route.ts:161-175](../../../../app/api/workflows/[id]/ai/repair/plan/route.ts#L161)).
- **Authz wall before any model/gate.** `loadWorkflowForMember(id, userId)` resolves the
  workflow-owning account; non-member / missing / cross-account → no-leak 404 **before**
  the credit gate or model call. Access-wall DTOs (`NOT_FOUND`/`NO_ACCESS`) short-circuit
  with the safe DTO and **no** gate/model.
- **Allow-list LLM input.** The model sees only `buildDiagnosisExplainContext(dto)` —
  readiness booleans, `summaryText`, `nextSteps`, and per-finding safe labels (provider /
  provider name / title / missing-field NAMES / public scope constants / credential class).
  **Never** tokens, raw config values, integration rows, providerAccountId, account labels,
  connectedByUserId, run payloads, or PII.
- **No raw node IDs in user/model text.** AI-DIAG-FIX-1 builds a `nodeId → safe display
  label` map and attaches `nodeLabels` to every finding; the render / explain / repair
  layers use labels, node ids stay internal
  ([diagnoseWorkflowForAgent.ts:224-234](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts#L224)).
- **Draft snapshot is read-only.** Even when the client supplies its current graph, the
  snapshot influences only *which* graph is analyzed, never *who* may analyze it
  (authz still comes from the saved record), and the diagnosis reports field/label NAMES,
  never config values — so the snapshot's config can't be echoed back.
- **Proposal response is plain strings only** — summary / actions / labels / advisory enum
  + booleans + the server-set "not applied" notice. No ids, codes-as-data, config, tokens,
  or account labels leave the route.
- **Fail-closed billing, fail-open telemetry.** OpenAI-not-configured → 503 before any
  charge; gate error → `AI_GATE_ERROR` 503 before the model; the `ai_cost_events` recorder
  is fail-open (telemetry failure never breaks the response).

---

## 5. Data / RLS / model notes

- **No new DB objects. No migration. `db:push` NOT run** — none was needed. Credits reuse
  the already-applied `workflow_repair` feature (4 credits) in
  [aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts), the existing
  `account_billing` counters + `deduct_ai_credits_if_available` RPC, and the existing
  `ai_cost_events` recorder.
- **Account-scoped cost owner.** The billed account is always the **workflow-owning
  account** resolved server-side via `loadWorkflowForMember` — never client-supplied.
- **Shared-project caution (unchanged).** dev/preview/prod share one Supabase project, so
  the recorder writes to the live `ai_cost_events` even from dev — pre-existing behavior
  (explanation already does this). Tests mock the model client + recorder; no real model
  calls or ledger writes in unit tests.

---

## 6. UI behavior

- **No fake / unsupported controls.** The repair bubble has **no Apply button** (confirmed
  by the explicit "deliberately NO Apply control" guard in
  [_BuilderAiPanelDiagnosis.tsx:226](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx#L226)).
  Executable repair is a later slice (AI-REPAIR-2).
- "Suggest a fix" and "Explain with AI" appear **only** on the latest diagnosis bubble and
  **only** when there are real issues. Clean/ready diagnoses and access walls show neither.
- The advisory risk estimate is labeled as the AI's estimate; it gates / enables nothing.
- Per-diagnosis suggested-state blocks a repeat charge (mirrors `explainedDiagnosisIds`).

---

## 7. Deferred / known limitations

- **AI-REPAIR-2 (executable repair) deferred** — model → validated `WorkflowPatch` over the
  existing `validateWorkflowPatch` / `applyPatchToDefinition`, with preview + a gated apply.
  AI-REPAIR-1 deliberately emits a plain-language proposal only, to avoid an unvalidated,
  apply-tempting artifact.
- **Hermes / MCP internal path / autonomous loop / memory write: NOT introduced.** This is
  a single request → single structured model call → response, identical in shape to "Explain
  with AI". No multi-step agent loop is warranted yet.
- **AI credit enforcement is OFF** (`ENABLE_AI_CREDIT_ENFORCEMENT` default `false` →
  `isAiCreditEnforcementEnabled()` false, [billingFeatureFlags.ts:104-107](../../../../services/billing/billingFeatureFlags.ts#L104)).
  The gate is a no-op today (repair runs unmetered), but the recorder still writes the
  4-credit charge to the ledger — consistent with explanation's current behavior.
- **Follow-up cleanup — file sizes approaching the soft line-count limit.** Both surfaces
  this arc grew are now large:
  `features/workflow-builder/panels/BuilderAiPanel.tsx` = **648 lines**,
  `lib/api/ai.ts` = **650 lines** (measured this session). Both sit well past the ~500-line
  soft guideline and should be **split in a future cleanup slice** (e.g. extract the AI-panel
  message-kind handlers; split `lib/api/ai.ts` per capability — diagnose / explain / repair).
  Not blocking; flagged so it doesn't silently keep growing.

---

## 8. Verification baseline

- **Production sign-off (this session):** Marcus confirmed AI-REPAIR-1 + AI-DIAG-FIX-1 are
  **live and working in production** (clean workflows hide both AI actions; broken workflows
  show both; "Suggest a fix" returns a proposal-only bubble with no Apply; no graph mutation).
- **Automated checks — NOT run this session.** `npm test` / `eslint` / typecheck were **not
  run** as part of this docs-only closeout. The arc's own test files exist and passed at
  ship time per the feat commits (`planWorkflowRepair.test.ts`, `ai-repair-plan-route.test.ts`,
  `BuilderAiPanel.suggestFix.test.tsx`, plus AI-DIAG-FIX-1's draftOverride / label tests) —
  that is the **inherited** baseline from commits `edc139934` / `399d13e87` / `92ea2968d`,
  not a bar re-measured today.
- **`lint:structure` (leaf-folder counts):** run this session for the docs-only change —
  pass (see report). No other lint/test run.
- **Migrations:** none added; `db:push` not run (nothing to apply).
- **Flags:** `ENABLE_AI_CREDIT_ENFORCEMENT` = OFF (default). `ENABLE_OPENAI_PROVIDER` +
  `OPENAI_API_KEY` gate the model call (503 if unconfigured, before any charge).

---

## 9. Recommended next tracks

1. **AI-REPAIR-2 — executable repair.** Model → `WorkflowPatch` over the existing
   `validateWorkflowPatch` (which recomputes risk and rejects unknown nodes/actions/refs),
   a preview UI, and a gated apply. The natural next rung above the proposal.
2. **AI-panel / client cleanup slice.** Split `BuilderAiPanel.tsx` (648) and `lib/api/ai.ts`
   (650) per §7 before they grow further.
3. **AI credit enforcement rollout.** When ready, flip `ENABLE_AI_CREDIT_ENFORCEMENT` on in
   a controlled step — the gate + ledger are already wired for explanation and repair.

---

## 10. Process lesson

**Shared `v2-main` worktree requires a push lock + final outgoing-commit check before any
push.** Because AI work and other arcs (e.g. conn-share `a0ea1cffe`) commit onto the same
`v2-main` worktree interleaved on the same day, a push can carry commits from another in-flight
arc. Before any `git push`: (1) hold/announce a push lock so a parallel session isn't
mid-commit, and (2) run `git log origin/v2-main..HEAD` (outgoing-commit check) and confirm
every listed commit is intended before pushing.

---

## 11. Closeout confirmation

**Docs-only. Nothing pushed.** No source / test / migration / schema / UI changed; no
`db:push`; no flag flip. The only artifact is this doc at
`docs/slices/phase-4/ai-repair-1-safe-repair-proposal-closeout.md`.
