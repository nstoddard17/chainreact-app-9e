# REACT-AGENT-CS-1-SERVICE-BOUNDARY — Implementation note

**Type:** Implementation slice (code). Local commit, **nothing pushed**. No migration, no
env, no provider, no route, no UI, no model call.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md) → CS-1.

## What was added

The first, narrow **React Agent service boundary** — types + a no-op dispatcher:

- [`services/ai/reactAgent/types.ts`](../../../services/ai/reactAgent/types.ts) —
  `ReactAgentScope` (account-scoped: `userId` + `accountId` required; `workflowId?`,
  `conversationId?` optional/session-local), `ReactAgentIntent`
  (`explain_diagnosis | answer_diagnosis_question | propose_repair | unknown`),
  `ReactAgentInput` (user **text only** — never a raw DTO/config), `ReactAgentRequest`,
  `ReactAgentResponse` (discriminated `ok:true` safe message + optional `nextAction` /
  `proposedPatchRef`, or `ok:false` with a `reason` + safe copy), and the
  `ReactAgentService` interface.
- [`services/ai/reactAgent/index.ts`](../../../services/ai/reactAgent/index.ts) —
  `isValidReactAgentScope`, the side-effect-free `dispatchReactAgentRequest`, and a
  `reactAgentService` object implementing the interface.

Dispatcher decision logic (CS-1): invalid scope → `invalid_scope`; `unknown`/unrecognized
intent → `unsupported_intent`; recognized intent → `not_yet_available`. All branches return
static, leak-safe copy.

## What it intentionally does NOT do

- No model call, no tool execution, **no workflow mutation**, no DB/Supabase/service-role
  access, no MCP import, no `child_process`/shell, no arbitrary `fs`.
- No route/UI/endpoint. No persisted conversation/memory. No queue/`agent_jobs`. No Hermes.
- Does **not** re-implement or bypass route-level auth, account-membership, credit-gating, or
  telemetry — those stay owned by the existing AI routes. The boundary enforces scope
  **shape** only; it does not grant access.

A durable guard test ([`tests/unit/services/ai/reactAgent/boundary-imports.test.ts`](../../../tests/unit/services/ai/reactAgent/boundary-imports.test.ts))
statically scans the boundary source and fails if any of those forbidden surfaces appears,
so the promise can't silently regress as the boundary grows.

## How later slices plug in safely

CS-2+ replace each `not_yet_available` branch with delegation to the **existing gated
brains through their routes** — `answerWorkflowQuestion` /
`explainWorkflowDiagnosis` / the deterministic repair preview — so account-membership +
`aiCreditGate` + `ai_cost_events` telemetry continue to run exactly where they do today. The
boundary carries only scope ids + user text; the safe diagnosis **DTO is re-derived
server-side** by the route (the current AI-DIAG pattern), never posted through the boundary.
`proposedPatchRef` stays an opaque reference to a patch produced by the existing repair
preview — never a raw patch body, and apply stays **approval-gated** (explicit, draft-only).

## Why Hermes remains later

Hermes is a **scoped runtime/memory layer behind `AgentRuntimeAdapter`**, gated by the
agent-runtime plan's §9 preconditions. It lands only after the boundary (CS-1), the internal
tool registry (CS-3), the audit-event model (CS-4), and the queued-job model (CS-5) — never
before. This slice deliberately ships the seam Hermes will later sit behind, and nothing more.

## Verification (this slice)

`npx jest tests/unit/services/ai/reactAgent/` → **2 suites, 16 passed**; `npm run typecheck`,
`eslint` on touched files, `npm run lint:structure` — see the slice report.
