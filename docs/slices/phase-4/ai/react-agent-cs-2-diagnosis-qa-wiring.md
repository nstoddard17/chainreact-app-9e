# REACT-AGENT-CS-2-DIAGNOSIS-QA-WIRING — Implementation note

**Type:** Implementation slice (code). Local commit, **nothing pushed**. No migration, env,
provider, UI, or model-behavior change. Route response contract **unchanged**.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md) → CS-2 ·
builds on [react-agent-cs-1-service-boundary.md](./react-agent-cs-1-service-boundary.md) (`193627693`).

## What this slice does

Routes the **already-authorized, already-gated** diagnosis Q&A *execution* through the
React Agent service boundary — without moving any guard/gate/DTO/telemetry responsibility.

**Wiring path (exactly as the architecture requires):**
```
Q&A route: requireUser → loadWorkflowForMember → re-derive safe DTO server-side →
           OpenAI-configured check → aiCreditGate (BEFORE model)
        → reactAgentService.runAuthorizedCapability({ scope, intent, exec })
        → exec = answerWorkflowQuestion({ dto, question, selectedNode?, modelClient, tier })
        → route records ai_cost_events telemetry → safe response mapping (unchanged)
```
NOT `React Agent → HTTP route`. NOT `React Agent bypasses guard/gate`. The boundary imports
no brain, calls no HTTP, re-implements no auth/credit gate.

## What was added/changed

- **`services/ai/reactAgent/types.ts`** — `ReactAgentCapabilityOutcome<T>` and a second seam
  on `ReactAgentService`: `runAuthorizedCapability<T>({ scope, intent, exec })`.
- **`services/ai/reactAgent/index.ts`** — `runAuthorizedCapability`: validates scope SHAPE +
  rejects `unknown` intent, then runs the injected `exec` and returns its **exact** result.
  Pure — no model/HTTP/gate/mutation; the boundary stays import-fenced (the CS-1 import-guard
  test still passes).
- **`app/api/workflows/[id]/ai/diagnose/qa/route.ts`** — the single
  `answerWorkflowQuestion(...)` call now runs **through** `runAuthorizedCapability` with
  `intent: "answer_diagnosis_question"` and `scope: { userId, accountId, workflowId }`. A
  defensive `!outcome.ok` branch maps to the same safe 503 (unreachable on the wired path), so
  the **frontend response contract is byte-for-byte unchanged**.

## Two seams, kept distinct (important)

- `handle` (CS-1, user-facing text seam) **still returns `not_yet_available`** for
  `answer_diagnosis_question` — a future React Agent chat UI doesn't have a server-derived DTO,
  so it can't run Q&A directly. The route is the authority that prepares the safe context.
- `runAuthorizedCapability` (CS-2, server execution seam) is what the **route** uses. CS-3
  (internal tool registry) will connect the two so the user-facing path can reach the same
  gated capability through a registry, not by duplicating the route.

## What it intentionally does NOT do

No workflow mutation, no Apply/Preview, no memory/conversation persistence, no queue, no MCP,
no Hermes. The other recognized intents (`explain_diagnosis`, `propose_repair`) remain unwired
(`not_yet_available`). No change to model behavior, credit charge, telemetry shape, or the safe
no-leak response (the model still sees only the server-built safe context; ids/config/tokens
never rendered).

## Verification (this slice)

reactAgent suites + `ai-diagnose-qa-route.test.ts` + `answerWorkflowQuestion.test.ts` →
**4 suites, 48 passed**; builder Q&A client (`lib/api/ai.test.ts`) → **38 passed** (response
contract intact); `eslint` touched 0; `lint:structure` OK; `typecheck` clean for the touched
files (the one error is unrelated parallel analytics WIP in `WidgetConfigPanel.tsx`).
