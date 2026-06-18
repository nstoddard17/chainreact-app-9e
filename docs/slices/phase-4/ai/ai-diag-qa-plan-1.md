# 4.AI-DIAG-QA-1 — Workflow diagnosis Q&A — Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-17
**Branch:** `v2-main`

**Source of truth (verified current state — files inspected for this plan):**
[app/api/workflows/[id]/ai/diagnose/explain/route.ts](../../../../app/api/workflows/[id]/ai/diagnose/explain/route.ts) (the AI-DIAG-2 explain route — auth → parse → re-derive DTO → access wall → OpenAI-config 503 → credit gate → model → fail-open telemetry) ·
[services/ai/diagnostics/buildDiagnosisExplainContext.ts](../../../../services/ai/diagnostics/buildDiagnosisExplainContext.ts) (the allow-list projector — field-by-field, never spreads) ·
[services/ai/diagnostics/explainWorkflowDiagnosis.ts](../../../../services/ai/diagnostics/explainWorkflowDiagnosis.ts) (model orchestrator — injected client, single structured tool, Zod re-validation, token cap) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (`AgentWorkflowDiagnosisDTO` — overallReady / runnable / findings / summaryText / nextSteps / latestRun) ·
[services/ai/diagnostics/draftOverride.ts](../../../../services/ai/diagnostics/draftOverride.ts) (`parseDraftOverride` — STRICT `WorkflowDefinitionSchema.safeParse`) ·
[services/billing/aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts) (`aiCreditGate` — flag-gated, frozen-check, atomic deduct, fail-closed `gate_error`) ·
[services/billing/aiCostEvents.ts](../../../../services/billing/aiCostEvents.ts) (`recordAiModelCallCompleted` / `recordAiModelCallFailed`) ·
[lib/api/ai/diagnostics.ts](../../../../lib/api/ai/diagnostics.ts) (`explainDiagnosis` client — sends id + optional draft, NOT the raw DTO) ·
[features/workflow-builder/panels/useBuilderDiagnosisActions.ts](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts) (`handleExplainDiagnosis` — explicit click, in-flight + repeat-charge guards) ·
[features/workflow-builder/panels/_BuilderAiPanelChat.tsx](../../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx) (`diagnosis_explanation` message kind — session-local, safe fields only) ·
[services/ai/tools/variables.ts](../../../../services/ai/tools/variables.ts) (`getAvailableVariablesForAI` — upstream field names/types/descriptions + `{{nodeId.path}}` tokens) ·
[core/ai/models.ts](../../../../core/ai/models.ts) + [services/ai/modelClients/createModelClient.ts](../../../../services/ai/modelClients/createModelClient.ts) (tiered model selection; `MODEL_TIER = "fast"`).

**Sibling docs:**
[ai-diag-2-llm-explanation-plan.md](./ai-diag-2-llm-explanation-plan.md) (the explain arc this extends) ·
[ai-credits-enforcement-3b-plan.md](./ai-credits-enforcement-3b-plan.md) (the credit-gate model) ·
[ai-credits-and-agent-runtime-plan.md](./ai-credits-and-agent-runtime-plan.md) (Hermes / agent-runtime boundary — Q&A is explicitly NOT that).

---

## 1. Context

The AI repair/diagnosis arc shipped: deterministic Check (AI-DIAG-1), safe single-call
"Explain with AI" (AI-DIAG-2, `a66d0d87e`/`baea491b4`/`8e090b2f6`), credit enforcement
(AI-CREDITS-3b), and four deterministic repair categories + a guidance card. The natural
next AI layer is **conversational follow-up Q&A about the current workflow / Check result** —
"Why won't this run?", "What should I fix first?", "What does this broken connection mean?",
"Can I ignore this?", "Which step is causing the problem?", "What data is available here?".

This is the next step the project memory's open thread names: deterministic Check (free) →
"Explain with AI" (shipped) → **later Q&A/repair** → only then Hermes. **Q&A is explicitly
NOT Hermes, NOT autonomous editing, NOT generic workflow-building chat** — it is a
read-only, explanation-only answer grounded in the same safe diagnosis DTO the explain
feature already uses.

**This plan implements nothing.** It designs Q&A to reuse the AI-DIAG-2 contract verbatim,
adding only a free-text question and an anti-injection answer boundary.

## 2. Current codebase findings (verified)

### 2.1 The explain route is the exact template (the ordering Q&A must copy)
[`app/api/workflows/[id]/ai/diagnose/explain/route.ts`](../../../../app/api/workflows/[id]/ai/diagnose/explain/route.ts):
`requireUser` → `parseDraftOverride(body)` (400 on bad draft) → `loadWorkflowForMember`
(resolves the cost-owning `accountId` server-side) → `diagnoseWorkflowForAgent({subjectUserId,
workflowId, draftOverride?})` (RE-DERIVED server-side; the client DTO is never trusted) →
**access wall** (`dto.access !== "OK"` → return safe DTO, no gate, no model) → OpenAI-config
check (`isOpenAiProviderEnabled()` + key → else **503**) → **`aiCreditGate` BEFORE the model
call** → `createModelClientForModel(getModelForProviderTier("openai", "fast"), apiKey)` →
`explainWorkflowDiagnosis({dto, modelClient, tier})` → `recordExplainEvent` (fail-open
telemetry) → safe JSON. Constants: `MODEL_TIER = "fast"`, `EXPLAIN_FEATURE =
"workflow_explanation"`.

### 2.2 The allow-list projector already exists
[`buildDiagnosisExplainContext.ts`](../../../../services/ai/diagnostics/buildDiagnosisExplainContext.ts)
builds the model payload **field-by-field (never spreads)**, including only: `overallReady`,
`runnable`, `allRequiredConnected`, `summaryText`, `nextSteps`, and per-finding `{source,
code, severity, title, provider, providerName, missingFields (NAMES), missingScopes
(public constants), credentialClass, nodeLabels (safe)}`, plus a `latestRun` `{status,
classification}`. **Excluded:** raw `nodeIds`, workflow/run/edge ids, config values, tokens,
integration rows, account metadata, `connectedByUserId`, trigger payloads, PII. Q&A reuses
this projector (the model sees the same safe surface).

### 2.3 The model orchestrator is injectable + structured
[`explainWorkflowDiagnosis.ts`](../../../../services/ai/diagnostics/explainWorkflowDiagnosis.ts)
takes an **injected `modelClient`** (tests pass a mock), forces a single structured tool
call (`explain_workflow_diagnosis`), caps output (`MAX_OUTPUT_TOKENS`), and **Zod-re-validates**
the response → `{ok:true, explanation, priorities?, missingInfo?} | {ok:false, code:
"MODEL_FAILED"|"PARSE_FAILED"}`. Q&A clones this shape with a Q&A tool/schema.

### 2.4 The credit gate is the single charge point
[`aiCreditGate.ts`](../../../../services/billing/aiCreditGate.ts): `aiCreditGate({accountId,
feature, plannedTier})` → flag OFF (`ENABLE_AI_CREDIT_ENFORCEMENT` ≠ `"true"`) → skip;
frozen → `account_frozen`; deduct atomically; RPC error → **fail-closed `gate_error`**.
Denial mapping in the explain route: `account_frozen` → 403, `gate_error` → 503,
`insufficient_ai_credits` → 402 `AI_CREDITS_EXHAUSTED`. Billed to the **workflow-owning
account** (resolved from the record, never client-supplied).

### 2.5 The client + panel pattern
[`lib/api/ai/diagnostics.ts`](../../../../lib/api/ai/diagnostics.ts) `explainDiagnosis(workflowId,
draftDefinition?)` posts only the id + optional draft. The panel handler
[`handleExplainDiagnosis`](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts)
is **explicit-click only**, guarded against concurrent ops + repeat-charge
(`explainedDiagnosisIds`), and renders a session-local `diagnosis_explanation` message
([`_BuilderAiPanelChat.tsx`](../../../../features/workflow-builder/panels/_BuilderAiPanelChat.tsx)).

### 2.6 "What data is available here" already has a safe source
[`getAvailableVariablesForAI(userId, workflowId, nodeId)`](../../../../services/ai/tools/variables.ts)
returns upstream **field names / types / descriptions** + a `{{nodeId.path}}` reference token
and a `sensitive` boolean — **no values**. For Q&A's "what data is available" answers we can
project this to **path + type + description + sensitive-flag only**, dropping the raw
`nodeId` and the `reference` token (which embeds a node id) before it reaches the model.

## 3. Product / model decision

- **What Q&A IS:** an explicit, user-asked, single-shot question answered **only** from the
  server-re-derived safe diagnosis DTO (+ optional safe selected-node data summary).
  Explanation/advice text only. Read-only. Credit-gated. Cheap model.
- **What Q&A is NOT:** Hermes / an agent loop; autonomous or proposed editing; a patch
  generator; generic "build me a workflow" chat; a memory of prior turns (single-shot first);
  a way to read credentials, config values, raw ids, or run logs.
- **Account-model anchor:** billed to the **workflow-owning account** (personal → personal;
  team/business → shared pool), exactly like explain/planner. The credential-sharing /
  creator-pin policy is untouched — Q&A never resolves or reveals a credential.

## 4. Recommended approach (end to end)

A near-clone of the explain route, adding a question + an anti-injection answer contract.

**Route** (new): `POST /api/workflows/[id]/ai/diagnose/qa`. Ordering identical to §2.1:
1. `requireUser` (401).
2. Parse body: **`question`** (string, trimmed, non-empty, hard cap ~500 chars → 400 on
   violation), optional `draftDefinition` (via `parseDraftOverride`, 400 on bad), optional
   `selectedNodeId` (string).
3. `loadWorkflowForMember` → `accountId`.
4. `diagnoseWorkflowForAgent({subjectUserId, workflowId, draftOverride?})` — **re-derive
   server-side**; the client never supplies the DTO.
5. Access wall: `dto.access !== "OK"` → return safe DTO, **no gate, no model**.
6. Validate `selectedNodeId` **against the re-derived graph** — if it isn't a real node in
   this workflow, **ignore it** (don't error, don't echo it). If valid, build the safe
   selected-node data summary from `getAvailableVariablesForAI` (projected per §2.6).
7. OpenAI-config check → **503** if disabled/no key (before any charge).
8. **`aiCreditGate({accountId, feature: "workflow_qa", plannedTier: "fast"})` BEFORE the
   model.** Denials map 402/403/503 like explain.
9. `answerWorkflowQuestion({dto, question, selectedNodeData?, modelClient, tier:"fast"})` —
   new orchestrator mirroring `explainWorkflowDiagnosis`: `buildDiagnosisQaContext(dto)` +
   the safe selected-node summary as the **only** grounding; the user `question` is passed as
   a separate, clearly-delimited user message that the system prompt treats as **data to
   interpret, not instructions**. Single structured tool (`answer_workflow_question`),
   Zod-validated, output-token capped.
10. `recordQaEvent` — **fail-open** telemetry via `recordAiModelCallCompleted/Failed`,
    `feature: "workflow_qa"`, `metadata.kind: "workflow_diagnosis_qa"`, billed to `accountId`.
11. Safe response: `{ok:true, answer, pointers?, needsUserDecision?} | {ok:false, code,
    message}`.

**Anti-injection system prompt** (the new safety surface): answer **only** from the provided
safe context; never invent fields/ids/values; if the answer requires user intent (e.g.
"should I delete this step?"), respond that **you can't safely decide that** and describe the
trade-off; **never** emit a patch, JSON edit, or instruction to change the workflow; when a
**deterministic repair already exists** for a finding (invalid-ref / dangling / self-loop /
duplicate), **point the user to the existing "Preview fix" button** rather than inventing a
fix. The model's output is text only and is never executed.

**Client** (new): `askDiagnosisQuestion(workflowId, question, draftDefinition?,
selectedNodeId?)` in [`lib/api/ai/diagnostics.ts`](../../../../lib/api/ai/diagnostics.ts) —
posts id + question (+ optional draft + selectedNodeId); never the DTO.

**UI** (new, behind flag): a question input + submit under the diagnosis in the Builder AI
panel; renders a session-local `diagnosis_qa` message (the user's question echoed + the
answer, optional `pointers` list). Explicit submit only; disabled while in-flight; safe
code-keyed error copy on 402/403/503 (reuse `AI_CREDITS_EXHAUSTED_MESSAGE` +
`aiAssistantTransportErrorMessage`).

**Flag:** ship the route + UI behind `ENABLE_AI_DIAG_QA` (`services/*/flags.ts` accessor),
**default OFF** — Q&A is a new paid, public-facing, free-text surface. Independent of (and
additional to) the existing `ENABLE_AI_CREDIT_ENFORCEMENT` + OpenAI-enabled gates.

## 5. Alternatives considered

| Option | Security | Builder/UI | AI/cost consistency | Future flex | Verdict |
|---|---|---|---|---|---|
| **A. Clone explain route; single-shot; safe DTO + optional safe node-data; flag-OFF** (recommended) | Strong — reuses the proven allow-list projector + gate-before-model + re-derive | Small (input box + one message kind) | High — same tier/feature/telemetry shape | Multi-turn later | **Chosen** |
| B. Multi-turn conversation with server-side memory | Larger leak surface (history retention), harder to bound | Bigger | More cost/telemetry to model | — | **Deferred** — start single-shot |
| C. Let Q&A call tools / propose edits (mini-agent) | **Unsafe now** — that's Hermes; crosses the autonomous-editing line the arc forbids | — | — | — | **No-go** (out of scope; that's the agent-runtime track) |
| D. Answer from the client-supplied DTO (skip re-derive) | **Unsafe** — trusts client data, injection/spoof risk | smaller | — | — | **Rejected** — must re-derive server-side |
| E. Reuse the explain route with an optional question param | Muddies two features' telemetry + copy; harder to flag/meter separately | — | — | — | Rejected — separate `workflow_qa` feature + route is cleaner |

## 6. Security / data model & no-leak contract

- **No DB schema change, no migration.** Q&A reuses `ai_cost_events` (new `feature:
  "workflow_qa"` value) — additive, no DDL.
- **Allow-list only to the model:** `buildDiagnosisQaContext(dto)` = the explain projector's
  safe fields; the selected-node summary is **path/type/description/sensitive-flag only**
  (no values, no raw node id, no `{{nodeId.path}}` token). The model **never** sees raw node
  ids, edge ids, DB ids, config values, provider bodies, tokens, secrets, run logs, or
  unbounded workflow JSON.
- **Client DTO is never trusted:** the route re-derives the diagnosis; a malicious
  client-supplied DTO has no effect (it isn't read). `draftDefinition` is strict-parsed by
  `parseDraftOverride`; `selectedNodeId` is validated against the re-derived graph and
  ignored if bogus.
- **Question is data, not control:** the free-text question is delimited and the system
  prompt forbids treating it as instructions; the answer is text-only and never executed.
- **Gate before model:** no `ai_model_call_*` and no provider call can occur before
  `aiCreditGate` succeeds; fail-closed on gate error (503).
- **Fail-closed provider:** OpenAI disabled / no key → 503 before any charge.
- **No-leak response:** only `{answer, pointers?, needsUserDecision?}` or a code-keyed safe
  error — never raw model metadata, ids, or the echoed safe context.

## 7. API / service / UI expectations (described, not built)

- **Route:** `POST /api/workflows/[id]/ai/diagnose/qa` — body `{question: string;
  draftDefinition?: WorkflowDraftSnapshot; selectedNodeId?: string}`; responses 200
  `{ok:true, answer, pointers?, needsUserDecision?}` / 200 `{ok:false, code, message}` /
  400 (bad question/draft) / 401 / 403 / 402 / 503. Returns the safe access DTO unchanged for
  non-OK access.
- **Service:** `services/ai/diagnostics/answerWorkflowQuestion.ts` (orchestrator, injected
  client) + `buildDiagnosisQaContext.ts` (projector; may re-export the explain projector) +
  a safe `buildSelectedNodeDataSummary` helper.
- **Client:** `askDiagnosisQuestion(...)` in `lib/api/ai/diagnostics.ts`.
- **UI:** question box + `diagnosis_qa` message kind in the Builder AI panel; explicit submit;
  in-flight disable; safe error copy. No control the backend can't honor; no patch/Apply
  affordance is added by Q&A.

## 8. Tests required (for the implementation slices)

- **Route, gating, no-leak:** model is **never** called before `aiCreditGate` succeeds;
  402/403/503 denial mapping; OpenAI-disabled → 503 (no charge); access-wall returns safe DTO
  with no gate/model; a **malicious client-supplied DTO is ignored** (route re-derives);
  `draftDefinition` strict-parse rejection (400); bogus `selectedNodeId` ignored (no error,
  not echoed).
- **Projector no-leak:** the Q&A model payload contains only allow-listed fields — assert raw
  node ids / edge ids / config values / tokens / `{{nodeId.path}}` references are absent.
- **Orchestrator:** Zod-validates the structured answer; `MODEL_FAILED`/`PARSE_FAILED`
  fail-closed; output-token cap; question passed as delimited data.
- **Answer boundary:** answer is text only; a finding with a deterministic repair yields a
  "use Preview fix" pointer (no patch); intent-required questions produce
  `needsUserDecision`/"can't safely decide" copy.
- **Telemetry:** fail-open; `feature: "workflow_qa"`, billed to the workflow-owning account.
- **UI:** explicit submit only; in-flight disable; safe code-keyed errors; no Apply/Preview
  affordance introduced by Q&A; question + answer render; no raw id/value in the DOM.

## 9. Implementation slice breakdown (when approved)

- **CS-1 — this plan** (docs-only). ✅
- **CS-2 — Backend, flag-OFF (no UI):** route + `answerWorkflowQuestion` +
  `buildDiagnosisQaContext` + safe node-data summary + `askDiagnosisQuestion` client +
  `ENABLE_AI_DIAG_QA` flag (OFF) + the route/gating/no-leak/orchestrator tests (§8). Dev/OpenAI
  smoke gated.
- **CS-3 — UI:** question box + `diagnosis_qa` message kind + panel wiring + UI tests. Still
  flag-OFF until Marcus enables.
- **CS-4 — Optional polish:** deterministic-repair pointers in answers, selected-node data
  answers, and (later, separate) multi-turn + durable rate limiting.

## 10. Risks / open questions (each with a recommendation)

1. **Single-shot vs multi-turn?** *Rec:* single-shot first (re-derive fresh each question; no
   server memory) — cheaper, smaller leak surface. Multi-turn is a later, separate slice.
2. **Include the selected-node data summary?** *Rec:* yes, but safe-projected
   (path/type/description/sensitive-flag only; no values, no raw ids, no reference tokens),
   behind the same flag. Drop it from CS-2 if it adds risk; add in CS-4.
3. **Cost tier / feature key?** *Rec:* `fast` tier + new `workflow_qa` feature (own cost line),
   reuse `computeAiCreditCharge`. Confirm the per-question credit cost with Marcus.
4. **Abuse / rate limiting?** *Rec:* hard question char cap (~500) + per-session in-flight
   guard for CS-2/3; **durable rate limiting is a known gap** (call it out; defer to a
   follow-up, same as the public-endpoint rate-limit posture).
5. **Repeat-charge model?** Unlike explain (one explanation per diagnosis), each Q&A question
   is distinct and legitimately charges. *Rec:* charge per submitted question; guard only
   against double-submit while in-flight. Confirm acceptable.
6. **Answer persistence?** *Rec:* session-local only (like `diagnosis_explanation`), never
   persisted — avoids storing model prose with the workflow.

## 11. Acceptance criteria

**This planning slice:** doc exists at the path below; every current-state claim ties to a
file inspected this session (§2 / Source-of-truth block); no source/tests/migrations/UI
changed; nothing pushed.

**The implementation must later:** re-derive the DTO server-side (never trust client DTO);
allow-list-only to the model (no ids/values/tokens/logs); gate-before-model with fail-closed
gate error + 503 on disabled provider; bill the workflow-owning account; answer text-only
(no patch/Apply/run/activation/credential mutation); point to existing Preview/Apply when a
deterministic repair exists; ship behind `ENABLE_AI_DIAG_QA` default OFF; no migration.

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, runtime, or behavior. No DB migration. No feature
flag added (the flag is a *recommendation* for CS-2). Docs-only. Nothing pushed.

## 13. Recommended next step & proceed recommendation

**Recommendation: proceed** — Q&A is a thin, well-bounded extension of the already-shipped,
already-safe explain pattern; the leak surface is controlled by the existing allow-list
projector and gate-before-model ordering. **Proceed to CS-2 (backend, flag-OFF)** once Marcus
confirms the §10 open questions (single-shot scope, selected-node summary in/out, per-question
cost, rate-limit deferral). Hold CS-3 (UI) until CS-2's gating/no-leak tests are green and
Marcus opts to expose it.
