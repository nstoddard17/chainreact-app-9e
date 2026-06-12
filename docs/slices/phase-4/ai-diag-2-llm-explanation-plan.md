# 4.AI-DIAG-2 — LLM Explanation of the Safe Workflow-Diagnosis DTO (Plan)

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

---

## 0. As-built closeout (SHIPPED 2026-06-12 — local-only, flags OFF)

> This plan was implemented across **2-pre → 2a → 2b**. The §1–§13 body below is the
> design as proposed; this section records the **as-built** state. Everything is **local
> commits on `builder-ui-v1-audit-1`, not pushed/deployed**. `ENABLE_AI_CREDIT_ENFORCEMENT`
> is **OFF** and the OpenAI provider is **not enabled**, so the explain endpoint returns a
> safe **503** until OpenAI is configured.

**Shipped commits:**
- `a66d0d87e` — **2-pre:** the deterministic `/ai/diagnose` 0-credit telemetry now bills the
  **workflow-owning account** (via `loadWorkflowForMember`), not the actor's personal account.
  Still 0-credit, ungated, no model; response DTO unchanged. (Resolves the plan's OQ-1.)
- `baea491b4` — **2a:** `buildDiagnosisExplainContext` (pure allow-list projector) +
  `explainWorkflowDiagnosis` (injected client, structured `responseTool`, strict re-validation)
  + `POST /api/workflows/[id]/ai/diagnose/explain` + `lib/api/ai.explainDiagnosis()`. No UI.
- `8e090b2f6` — **2b:** Builder "Explain with AI" button + explanation rendering (UI/client only).

**As-built behavior:** deterministic "Check workflow" stays **0-credit / ungated / no model**.
**"Explain with AI"** is optional and **explicit-click only** (never auto-called). The route
**re-derives the safe DTO server-side** (never trusts a client-posted DTO), authorizes via
`loadWorkflowForMember` (no-leak 404 before any model call), requires OpenAI configured
(`ENABLE_OPENAI_PROVIDER` + `OPENAI_API_KEY` — **not** the planner flag; never charges when
unconfigured), gates **before** the model call (`workflow_explanation` = **1** credit, existing
policy), calls **OpenAI fast**, and records an `ai_cost_events` model-call event billed to the
**workflow-owning account** (fail-open). Denials map to 402 `AI_CREDITS_EXHAUSTED` / 403 frozen /
503 model|gate. The model receives **only** the allow-listed projection — **no** node/workflow/run
ids, raw config, tokens, integration rows, provider account labels, account metadata, raw DTO JSON,
or free-text user Q&A. The UI renders **explanation-only** copy ("doesn't change or run your
workflow"), session-local messages, disables repeat clicks ("Explained"), and shows safe credit/
model/transport failure copy. No node/workflow/run id, account id, code, or model metadata renders.

**Deferred / caveats:** free-text Q&A (AI-DIAG-3), repair planning, and **Hermes** (future runtime —
not now) are deferred; reserve/reconcile + deep-loop cap are **AI-CREDITS-4** (deduct-only can charge
before a later runtime model failure). Explain returns **safe 503** until OpenAI is configured.
`BuilderAiPanel.tsx` carries a soft `max-lines` warning post-2b (not an error). **Live browser/OpenAI
E2E smoke has not been run.** **Hermes sequencing (standing direction):** deterministic diagnosis →
safe single-call explanation → dev/OpenAI smoke → later Q&A / repair planning → **only then** agent-
runtime abstraction / Hermes.

---

**Source of truth (verified — every file below was read):**
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (`AgentWorkflowDiagnosisDTO`, safe-by-construction) ·
[services/ai/diagnostics/renderWorkflowDiagnosis.ts](../../../services/ai/diagnostics/renderWorkflowDiagnosis.ts) (pure `summaryText`/`nextSteps`) ·
[app/api/workflows/[id]/ai/diagnose/route.ts](../../../app/api/workflows/%5Bid%5D/ai/diagnose/route.ts) (deterministic route, 0-credit recording) ·
[lib/api/ai.ts](../../../lib/api/ai.ts) (`diagnoseWorkflow`, `AgentWorkflowDiagnosis` client DTO, `AI_CREDITS_EXHAUSTED_MESSAGE`) ·
[features/workflow-builder/panels/BuilderAiPanel.tsx](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) (`handleCheckWorkflow` appends `kind:"diagnosis"`) ·
[features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx](../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx) (`DiagnosisBody`, deterministic render) ·
[services/ai/modelClients/createModelClient.ts](../../../services/ai/modelClients/createModelClient.ts) (`createModelClientForModel`, `createPlannerModelClient`, `isOpenAiProviderEnabled`) ·
[core/ai/models.ts](../../../core/ai/models.ts) (`getModelForProviderTier`, `FEATURE_DEFAULT_TIER.explanation = "fast"`, `MODEL_API_KEY_ENV`) ·
[core/ai/modelTypes.ts](../../../core/ai/modelTypes.ts) (`ModelClient.generateStructuredJson` only; `AiFeature` incl. `explanation`) ·
[core/ai/modelPricing.ts](../../../core/ai/modelPricing.ts) (`estimateModelCostMicros` → `null` when unpriced) ·
[core/billing/aiCreditPolicy.ts](../../../core/billing/aiCreditPolicy.ts) (`workflow_explanation` already = 1 credit) ·
[services/billing/aiCreditGate.ts](../../../services/billing/aiCreditGate.ts) (the gate) ·
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`loadWorkflowForMember` → workflow-owning account + no-leak 404) ·
[services/ai/events/recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts) + [services/ai/explain/explainWorkflow.ts](../../../services/ai/explain/explainWorkflow.ts) (AI-4 DETERMINISTIC explainer — NOT this slice) ·
[docs/slices/phase-4/ai-credits-enforcement-3b-plan.md](./ai-credits-enforcement-3b-plan.md) (the gate-wiring precedent)

---

## 1. Context

The AI-credit arc closed out at `97327fbb7` (gate wired before the paid planner,
flag-OFF, bills the workflow-owning account). The deterministic workflow diagnosis
(AI-DIAG-1) ships: "Check workflow" runs `diagnoseWorkflowForAgent` →
`AgentWorkflowDiagnosisDTO` → rendered by `DiagnosisBody`. It is **0-credit and
ungated** and makes **no model call**.

AI-DIAG-2 adds an **optional LLM explanation layer** on top of that safe DTO: the user
asks AI to explain the (already-computed) check in plainer, prioritized language. It is
the **first paid single-call LLM feature beyond the planner** — a clean stepping stone
that exercises the gate + the OpenAI-for-non-planner path with **zero autonomy** (no
patch / apply / repair / mutation / save / loop / memory / Hermes / MCP).

---

## 2. Current codebase findings (verified)

### 2.1 The diagnosis DTO is already safe-by-construction
`diagnoseWorkflowForAgent` ([diagnoseWorkflowForAgent.ts:190](../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts)) returns
`AgentWorkflowDiagnosisDTO` (L94): `access` (OK/NOT_FOUND/NO_ACCESS) + — only when OK —
`overallReady`/`runnable`/`allRequiredConnected`, `findings[]` (`source`,`code`,`severity`,
`title`, `nodeIds?`, `provider?`, `providerName?`, `missingFields?` (NAMES),
`missingScopes?` (public constants), `credentialClass?`), `latestRun` (`status`,
`errorClassification?` = title/description/hint/action/severity), `summaryText`,
`nextSteps[]`. The module's header (L38–L49) documents that **tokens, config values,
integration rows, `providerAccountId`, account metadata, integration display names,
`connectedByUserId`, exact expiry, raw granted scopes never appear** — a leak is
impossible by construction. **This DTO is the safe surface the LLM will summarize.**

### 2.2 The deterministic route stays 0-credit (do NOT touch its gating)
`POST /ai/diagnose` ([route.ts](../../../app/api/workflows/%5Bid%5D/ai/diagnose/route.ts)) is `requireUser` → `diagnoseWorkflowForAgent` →
JSON, plus a **fail-open 0-credit** `ai_cost_events` row (`feature:"other"`,
`isLlmCall:false`, credits 0) recorded **only when `access==="OK"`**. **Caveat (→ OQ-1):**
it resolves the cost-owner via `ensurePersonalAccount(userId)` (L38) — the *personal*
account, **not** the workflow-owning account (this is the pre-`3b-0` pattern; the plan
route was corrected to `loadWorkflowForMember` in `e538a6b0c`, this route was not).

### 2.3 Model infrastructure is structured-output + OpenAI-capable, fail-safe
- `ModelClient` exposes **only** `generateStructuredJson(input)`
  ([modelTypes.ts:167](../../../core/ai/modelTypes.ts)) — there is no `generateText`. So
  the explanation must be requested as a **structured object** via a `responseTool`
  (same mechanism the planner uses), not free prose.
- `createModelClientForModel(getModelForProviderTier("openai","fast"), process.env.OPENAI_API_KEY)`
  yields an OpenAI `fast` client (`gpt-4.1-mini`) and **fails safe to NOT_CONFIGURED**
  when the key is absent ([createModelClient.ts:78](../../../services/ai/modelClients/createModelClient.ts)). `isOpenAiProviderEnabled()` gates whether OpenAI is on.
- `AiFeature` already includes `explanation` with default tier `fast`
  ([models.ts:118](../../../core/ai/models.ts)). `createPlannerModelClient` is
  **planner-specific** routing (`ENABLE_OPENAI_PLANNER`) — we will **not** reuse it.

### 2.4 The credit feature already exists — no policy change needed
`core/billing/aiCreditPolicy.ts` `FEATURE_BASE_CREDITS` already maps
**`workflow_explanation` = 1**. `computeAiCreditCharge({feature:"workflow_explanation",
isLlmCall:true, modelTier:"fast"})` = **1**. The gate (`aiCreditGate`) and the recorder
(`ai_cost_events`) both already understand this feature. **OpenAI is unpriced**
(`estimateModelCostMicros` → `null`, [modelPricing.ts:65](../../../core/ai/modelPricing.ts)) → the recorded `estimated_cost_micros` is `null` while `ai_credits_charged` = 1 (product unit) — consistent with AI-CREDITS-2.

### 2.5 `services/ai/explain/*` is a DIFFERENT thing
`services/ai/explain/explainWorkflow.ts` is the **deterministic** AI-4 patch/workflow
explainer ("NO model calls"). The new LLM diagnosis-explainer must live under
`services/ai/diagnostics/` with a distinct name to avoid confusion. **Do not reuse it.**

### 2.6 The UI already has a diagnosis chat message
`BuilderAiPanel.handleCheckWorkflow` appends a `kind:"diagnosis"` message carrying the
`AgentWorkflowDiagnosis` DTO; `DiagnosisBody` renders `summaryText` + `nextSteps`
(deterministic, no LLM, access-walled). This is where an **"Explain with AI"** affordance
attaches.

---

## 3. Product / model decision

**What it is:** an explanation-only action. The user runs "Check workflow" (deterministic,
0-credit), then optionally taps **"Explain with AI"**; the app re-derives the safe DTO
server-side, sends an **allow-listed projection** to OpenAI (`fast`), and renders a
plainer, prioritized explanation as an assistant message.

**What it is deliberately NOT:** no patch, apply, repair, graph mutation, workflow save,
Hermes, MCP, memory writes, autonomous loop, or **free-text user question** (v1 takes no
user instruction → zero prompt-injection surface; Q&A is a later slice). It never claims
to have changed anything.

**Account model:** the explanation bills the **workflow-owning account** (personal →
personal, team/business → shared pool), resolved server-side via `loadWorkflowForMember`
— consistent with `3b-0`. The deterministic check stays 0-credit and ungated.

---

## 4. Recommended approach (end to end)

1. **New route `POST /api/workflows/[id]/ai/diagnose/explain`** (separate from the
   0-credit `/ai/diagnose`). Flow:
   - `requireUser()` → `userId`.
   - `loadWorkflowForMember(id, userId)` → no-leak 404 if missing/deleted/non-member;
     `accountId = wf.record.accountId` (the cost owner, server-side, never client-supplied).
   - **Re-derive the DTO server-side**: `diagnoseWorkflowForAgent({subjectUserId:userId, workflowId:id})`.
     **Never accept a client-posted DTO** — the prompt context must be the server's own
     sanitized output, not client text. If `access !== "OK"`, return the same wall shape
     `/ai/diagnose` returns (404 / safe access body) — **no gate, no model call**.
   - `aiCreditGate({accountId, feature:"workflow_explanation", plannedTier:"fast"})` —
     **before** the model call. `!ok` → reuse the `3b-i` denial mapping (402
     `AI_CREDITS_EXHAUSTED` / 403 frozen / 503 `gate_error`); the model is **not** called.
   - `explainWorkflowDiagnosis({ dto, modelClient })` (service; client injected) →
     structured `{ explanation, priorities?, missingInfo? }`.
   - Record an `ai_cost_events` model-call event (feature `workflow_explanation`, credits 1,
     cost micros null-if-unpriced) — fail-open, bills `accountId`.
   - Respond `{ ok:true, explanation, priorities?, missingInfo? }` (+ optional safe model
     meta). Model failure → `{ ok:false, code:"MODEL_FAILED", message }` at 503. No raw
     model dump.
2. **New service `services/ai/diagnostics/explainWorkflowDiagnosis.ts`** — model-client
   **injected** (mirrors `planWorkflowFromPromptForAI`), pure orchestration: project DTO →
   build prompt → `generateStructuredJson` with an explanation `responseTool` → parse →
   return the structured result. No DB, no mutation, no account concept (the route owns
   billing/authz).
3. **Pure projector `buildDiagnosisExplainContext(dto)`** — the allow-list seam (Q4),
   unit-tested to prove only safe fields leave.
4. **Model client**: `createModelClientForModel(getModelForProviderTier("openai","fast"),
   process.env.OPENAI_API_KEY)` gated by `isOpenAiProviderEnabled()` → fail-safe
   NOT_CONFIGURED → 503 until OpenAI is configured. **No new env flag** (reuse
   `ENABLE_OPENAI_PROVIDER` + `OPENAI_API_KEY`); **not** the planner flag.
5. **Client `explainDiagnosis(workflowId)`** in `lib/api/ai.ts` + the `AiDiagnosisExplanation`
   view type, using the existing `postStructured` helper (so a 402 structured body renders,
   not throws).
6. **UI (2b)**: an "Explain with AI" button in `DiagnosisBody` (only when `access==="OK"`,
   only on the latest diagnosis message) → append an assistant explanation bubble; denial →
   `AI_CREDITS_EXHAUSTED_MESSAGE`; failure → safe retry copy; explicit "this is an
   explanation, it didn't change your workflow."

### Allow-listed LLM context (Q4)
From the **re-derived** DTO only: `overallReady`/`runnable`/`allRequiredConnected`,
`summaryText`, `nextSteps`, and per finding `{source, code, severity, title, providerName,
missingFields, missingScopes, credentialClass}`, plus `latestRun.errorClassification`
(`title/description/hint/action/severity`) + `latestRun.status`. **Excluded:** `workflowId`,
`runId`, `nodeIds`, and the entire space of raw config / tokens / integration rows /
`providerAccountId` / account metadata / provider account labels / trigger payloads / PII
(none reachable from the DTO type — the projector is defense-in-depth + a no-leak test
anchor).

### Prompt shape (Q5)
- **System:** "You explain an ALREADY-COMPUTED, safe workflow diagnosis in plain language.
  Explain what's wrong, prioritize the most important issues, and state what information or
  action the user must provide. You CANNOT and DID NOT change, fix, apply, or run anything —
  never imply otherwise. Use only the provided context; do not invent providers, fields, or
  causes."
- **User:** the allow-listed context as compact JSON. **No free-text user instruction in v1.**
- **Output tool:** `{ explanation: string, priorities?: string[], missingInfo?: string[] }`
  (constrained, bounded length).

---

## 5. Alternatives considered

| Decision | Options | Verdict |
|---|---|---|
| **Route** | (a) new `/ai/diagnose/explain` · (b) `mode` flag on `/ai/diagnose` · (c) reuse `/ai/plan` | **(a)** — keeps the 0-credit deterministic route clean + untouched; gating/caching reasoned about in one paid place. (b) mixes 0-credit + paid in one handler (gating ambiguity); (c) wrong semantics. |
| **Service home** | (a) `services/ai/diagnostics/explainWorkflowDiagnosis.ts` · (b) inside `diagnoseWorkflowForAgent` · (c) `services/ai/explain/` · (d) component | **(a)** — sibling of the deterministic service, model-client injected. (b) pollutes the pure 0-credit path with an LLM dep; (c) is the DETERMINISTIC AI-4 explainer (different); (d) forbidden (no model calls in client). |
| **LLM input** | (a) re-derive DTO server-side + allow-list projection · (b) accept client-posted DTO | **(a)** — never trust client text in a prompt; re-deriving is cheap + deterministic. (b) is a prompt-injection hole. |
| **Output** | (a) structured `responseTool` object · (b) raw text | **(a)** — the only client method is `generateStructuredJson`; structured output is parseable + bounds the surface. |
| **Model** | (a) OpenAI `fast` via `getModelForProviderTier` · (b) planner routing · (c) Anthropic | **(a)** — cheap, fail-safe, decoupled from planner flags. No escalation. (b) is planner-specific; (c) is runtime-disabled for cost. |
| **User input** | (a) none in v1 · (b) free-text question | **(a)** — zero injection surface; Q&A is a later slice. |

---

## 6. Security / data model

- **No schema / migration / `db:push`.** `account_billing` AI columns + RPC,
  `workflow_explanation` feature, and `ai_cost_events` all already exist.
- **No-leak:** the LLM sees only the projector output (allow-list); the route response
  carries `{explanation, priorities?, missingInfo?}` + safe model meta — never a raw model
  dump, config, token, integration row, account id, or provider account label. A no-leak
  test feeds a DTO seeded with junk extra fields and asserts the projector + the prompt
  context drop them.
- **Authz / cost owner:** `loadWorkflowForMember` gates membership (non-member → no-leak
  404 **before** any model call) and yields the workflow-owning `accountId`; never
  client-supplied. Same posture as `3b-0`.
- **Fail-closed gate:** `aiCreditGate` errors → 503 (no unmetered paid call). Frozen → 403.
- **Server-role:** deduction stays inside the existing SECURITY DEFINER RPC via the gate;
  the route never touches `account_billing`.

---

## 7. API / service / UI expectations

- **Route** `POST /ai/diagnose/explain`: 200 `{ok:true, explanation, priorities?, missingInfo?}`
  · 402 `AI_CREDITS_EXHAUSTED` (flag ON + insufficient) · 403 frozen · 404 not-found/non-member
  · 503 `MODEL_FAILED`/`AI_GATE_ERROR`/NOT_CONFIGURED. **When flag OFF:** the gate is a no-op,
  so the explanation runs **unmetered** if OpenAI is configured, else 503 NOT_CONFIGURED.
- **`/ai/diagnose`** (deterministic): **unchanged** — stays 0-credit, ungated, no model call.
- **Client** `lib/api/ai.ts`: `explainDiagnosis(workflowId): Promise<AiDiagnosisExplanation>`
  via `postStructured`.
- **UI**: "Explain with AI" only on an `access==="OK"` latest diagnosis; explanation bubble
  is clearly an explanation (no apply/fix implication). No fake controls.

---

## 8. Tests required

- **Projector / no-leak**: only allow-listed keys leave; junk/raw fields dropped; the prompt
  context contains no config/token/integration/account/providerAccountId/nodeId-values.
- **Route gating**: gate called **before** the model client; flag ON + insufficient → 402 and
  the model client is **never** invoked; `gate_error` → 503, no model call; frozen → 403.
- **Determinism untouched**: `/ai/diagnose` still has no gate and records 0 credits
  (regression guard).
- **Billing**: explain bills `record.accountId` (personal→personal, team→team); no
  client-supplied `accountId` trusted; non-member/missing → 404 before the model call;
  `ai_cost_events` row recorded with feature `workflow_explanation`, credits 1, fail-open.
- **Model failure**: NOT_CONFIGURED / MODEL_FAILED → safe 503 message, no raw error leak.
- **No raw dump**: route response exposes no secret substrings / no model-internal blob.
- **UI**: renders the explanation; "Explain" hidden on access walls; 402 → credit message;
  no `@/services/**` import in client; **no MCP import** anywhere in the path.

---

## 9. Implementation slice breakdown

- **AI-DIAG-2a — service + route + client + tests (NO UI).** `buildDiagnosisExplainContext`
  projector, `explainWorkflowDiagnosis` service (model-client injected, structured tool),
  the `/ai/diagnose/explain` route (authz → re-derive DTO → gate → model → record → respond),
  the `explainDiagnosis()` client fn + type, and all §8 tests. Gate behind
  `ENABLE_AI_CREDIT_ENFORCEMENT` (flag OFF). OpenAI behind `ENABLE_OPENAI_PROVIDER` +
  `OPENAI_API_KEY` (else 503). **No migration, no `db:push`.** This is the testable proof.
- **AI-DIAG-2b — Builder UI.** "Explain with AI" button in `DiagnosisBody` + explanation
  chat rendering + denial/failure handling + the "didn't change your workflow" copy. UI tests.

Recommend the split (backend-first, fully testable before any UI). A combined slice is
possible but larger; the split keeps each reviewable.

---

## 10. Risks / open questions

- **OQ-1 — deterministic recorder account.** `/ai/diagnose` records its 0-credit event to the
  **personal** account (`ensurePersonalAccount`), not the workflow-owning account (pre-`3b-0`).
  The explain route will use the workflow-owning account. *Recommendation:* align the
  deterministic recorder to `loadWorkflowForMember` as a **tiny separate follow-up** (it's
  0-credit telemetry; out of scope for 2a but worth fixing for consistency).
- **OQ-2 — free-text Q&A.** Deferred (v1 = "explain this check" only, no user instruction →
  no injection surface). *Recommendation:* defer to AI-DIAG-3.
- **OQ-3 — OpenAI pricing.** Unpriced → `estimated_cost_micros` null; credits=1 is the
  product unit. *Recommendation:* accept; do not add unverified prices.
- **OQ-4 — repeat-click double charge.** Each "Explain" click = 1 charge when enforced.
  *Recommendation:* disable the button after a successful explanation (client guard);
  server-side caching deferred.
- **OQ-5 — provider flag.** *Recommendation:* reuse `ENABLE_OPENAI_PROVIDER` +
  `OPENAI_API_KEY`; no new flag, and **not** `ENABLE_OPENAI_PLANNER`.
- **OQ-6 — should the route echo the DTO?** *Recommendation:* no — the client already holds
  it from the prior check; return only the explanation + safe meta.

**Before Hermes?** **Yes.** This is a bounded, single-call, no-autonomy paid feature that
exercises the credit gate + the OpenAI-for-non-planner path and de-risks the agent-runtime
direction. It should land **before** any Hermes runtime planning.

---

## 11. Acceptance criteria

**This planning slice:** doc exists under `docs/slices/phase-4/`, every current-state claim
ties to a read file, no source/test/migration/UI changed, nothing pushed.

**The implementation must later meet:** `/ai/diagnose` stays 0-credit/ungated; the explain
route re-derives the DTO server-side and sends only the allow-listed projection; gate runs
before the model call and bills the workflow-owning account; non-member → 404 before any
model call; no client `accountId` trusted; model failure → safe 503; no raw model/secret
leak; no MCP import; no `@/services/**` import in client; no migration / `db:push`; flag
stays OFF.

---

## 12. Hard boundaries (what this slice did NOT change)

No code, tests, migrations, schema, or UI written. No `db:push`, deploy, PR, or push. No
flag enablement. No production pricing / OpenAI prices added. No Hermes, no MCP tools, no
memory, no repair/apply, no graph mutation. Did not touch the parallel
Apps/connection-sharing/OAuth/reconnect work.

---

## 13. Recommended next step

On approval, implement **AI-DIAG-2a** (service + projector + `/ai/diagnose/explain` route +
client + §8 tests), behind `ENABLE_AI_CREDIT_ENFORCEMENT` (OFF) and
`ENABLE_OPENAI_PROVIDER`, **no migration**, explicit-pathspec local commit. Then **2b**
(Builder UI). Resolve **OQ-1** (deterministic recorder account) as a tiny separate fix and
**OQ-5** (provider flag) before wiring. Hermes runtime planning stays after this.
