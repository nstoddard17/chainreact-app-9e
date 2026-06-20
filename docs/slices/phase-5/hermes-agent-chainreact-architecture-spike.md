# Spike — Hermes Agent ↔ ChainReact architecture

**Status:** Architecture spike (HERMES-AGENT-PIVOT, 2026-06-20). Direction-setting only — no app
routes, UI, workflow mutation, migrations, or live wiring ship from this doc.

**Supersedes the direct-Nous-hosted-model approach.** Earlier plans had ChainReact call a hosted
Nous model endpoint directly (Nous Portal / `HERMES_*` model config, `nousHermesAdapter`, the opt-in
live smoke). That code/config/docs were **removed**. ChainReact will **not** call any hosted LLM
model API directly, and Nous Portal is **not** kept as a fallback or backup. The historical plans
([`phase-5/hosted-hermes-workflow-guidance-brain-plan.md`](./hosted-hermes-workflow-guidance-brain-plan.md),
[`phase-4/ai/hosted-hermes-workflow-guidance-plan.md`](../phase-4/ai/hosted-hermes-workflow-guidance-plan.md),
[`phase-4/hermes/hermes-hosting-plan.md`](../phase-4/hermes/hermes-hosting-plan.md)) are retained as
history but their "ChainReact → hosted model" path is replaced by the architecture below.

## 1. The target architecture

```
ChainReact app
   │  (1) safe DTO only: generalized workflow shape + guidance kind + safe finding codes + user goal text
   ▼
Hermes Agent  ── internal service (the learning/skills brain) ──┐
   │                                                            │ (2) prompts an LLM provider
   │  (4) advisory guidance / WorkflowPlan (JSON)               ▼
   │                                                      OpenAI (first LLM provider, under the Agent)
   ▼
ChainReact validation + decision
   │  (5) validate EVERY plan against the real provider/action registry; ChainReact decides.
   ▼
Deterministic builder / validator / apply pipeline  ← the ONLY thing that can change a workflow
```

1. **Hermes Agent is the internal learning/skills brain.** It owns prompting, model orchestration,
   and its own generalized skills/memory. It is an internal service ChainReact talks to over a
   private, token-authenticated boundary — never exposed to the browser.
2. **OpenAI is the first LLM provider _underneath_ Hermes Agent.** The model provider is an
   implementation detail of the Agent, swappable later. ChainReact does not know or call the model.
3. **ChainReact remains the governed product boundary.** All product rules, auth, billing,
   capability truth, and mutation stay in ChainReact.
4. **ChainReact sends safe DTOs to Hermes Agent** — the existing
   [`WorkflowGuidanceRequest`](../../../contracts/aiGuidance.ts): generalized node shape
   (`kind/provider/type` + edge topology by opaque `n0/n1` refs), the guidance kind, safe finding
   CODES, and the user's own goal text. Never config values, secrets, tokens, credentials, PII, or
   real workflow/account/user/node ids. The
   [`sanitizeWorkflowForGuidance`](../../../services/ai-guidance/sanitizeWorkflowForGuidance.ts)
   boundary is the enforcement point and the real-id map stays ChainReact-side.
5. **Hermes Agent returns advisory guidance / a WorkflowPlan.** Suggestions, clarifying questions,
   or a proposed plan — all advice.
6. **ChainReact validates every plan and makes the final decision.** Every trigger/action step's
   `provider:type` MUST resolve in the discovery registry via
   [`validateWorkflowPlan`](../../../services/ai-guidance/validateWorkflowPlan.ts); a plan that
   references a capability ChainReact lacks is rejected. The Agent may hallucinate capabilities —
   ChainReact is the source of truth.

## 2. Hard boundaries (non-negotiable)

- **Hermes Agent must not mutate workflows directly.** Guidance is advice. The deterministic
  ChainReact builder/validator/apply pipeline (approval-gated) is the only mutation path.
- **Hermes Agent must not access Supabase, the service-role client, OAuth access/refresh tokens,
  API keys, raw integration rows, or private provider configs.** It receives only the safe DTO.
  ChainReact never forwards credentials or DB rows across the boundary.
- **Workflow execution must never depend on Hermes Agent.** If the Agent is slow, down, or
  disabled, workflows still build, validate, run, and recover. Guidance is strictly additive.
- **Global skills/memory must contain generalized guidance skills, not raw private user/account
  data.** Only a sanitized, generalized
  [`SanitizedSkillEvent`](../../../contracts/guidanceSkillEvents.ts) (capability shape + safe
  outcome + counts — no ids, no text, no PII) may cross from a private, account-scoped session into
  the Agent's global learning, via
  [`toSanitizedSkillEvent`](../../../services/ai-guidance/skillEventBoundary.ts).

## 3. What ChainReact already has (retained through the pivot)

These generic, transport-neutral primitives survive and are exactly the ChainReact-side seam for
the Agent. They are NOT tied to any model API:

| Piece | File | Role in target arch |
|---|---|---|
| Guidance contracts | [`contracts/aiGuidance.ts`](../../../contracts/aiGuidance.ts) | The safe DTO + advisory response/result shapes that cross the boundary. |
| Provider port | [`services/ai-guidance/types.ts`](../../../services/ai-guidance/types.ts) | `WorkflowGuidanceProvider` — the Hermes Agent **client** will implement this. |
| Safe-DTO sanitizer | [`sanitizeWorkflowForGuidance.ts`](../../../services/ai-guidance/sanitizeWorkflowForGuidance.ts) | Builds the de-identified request; keeps the real-id map ChainReact-side. |
| Intake seam | [`workflowGuidanceIntake.ts`](../../../services/ai-guidance/workflowGuidanceIntake.ts) | sanitize → ask a provider; never mutates, never calls a model directly. Default = noop. |
| Plan validator | [`validateWorkflowPlan.ts`](../../../services/ai-guidance/validateWorkflowPlan.ts) | ChainReact's deterministic capability gate over any returned plan. |
| Session/plan contracts | [`contracts/guidanceSession.ts`](../../../contracts/guidanceSession.ts) | `WorkflowPlan` (advisory, `notApplied: true`). |
| Private→global boundary | [`skillEventBoundary.ts`](../../../services/ai-guidance/skillEventBoundary.ts) + [`contracts/guidanceSkillEvents.ts`](../../../contracts/guidanceSkillEvents.ts) | Only generalized skill events reach the Agent's global memory. |

**Removed in the pivot** (do not reintroduce as a ChainReact-direct path): the Nous hosted-model
adapter, `HERMES_*` Nous-model config + flag, the model prompt builder, the OpenAI fallback policy,
the opt-in live Nous smoke, and the hosted-hermes setup runbook.

## 4. What is intentionally NOT decided here

- The Agent's wire protocol (REST/gRPC shape, request/response envelope) beyond "ChainReact posts
  the safe DTO and gets advisory JSON back". A later slice defines the client + contract.
- The Agent's internal prompt/model orchestration and its skills/memory store design.
- Any ChainReact app route, React Agent capability, or UI surface that consumes guidance — all
  future, scope-validated, audited slices.

## 5. Recommended next slices

1. **HERMES-AGENT-SANDBOX** — stand up the Agent locally (Docker + persistent volume + OpenAI
   provider config) per [`docs/runbooks/hermes-agent-sandbox.md`](../../runbooks/hermes-agent-sandbox.md).
   Prove the service boots and answers a trivial health/echo with no ChainReact wiring.
2. **HERMES-AGENT-CLIENT (inert)** — a `WorkflowGuidanceProvider` implementation in
   `services/ai-guidance` that POSTs the safe DTO to `HERMES_AGENT_BASE_URL` with the internal
   token, behind a default-OFF flag, with mocked-fetch tests (no live call in CI). Still not routed.
3. **HERMES-AGENT-RESPONSE-CONTRACT** — strict structured guidance/plan schema returned by the
   Agent + deterministic ChainReact validation (Zod + `validateWorkflowPlan`), advisory only.
