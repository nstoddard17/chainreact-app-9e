# REACT-AGENT-CS-4-EXPLAIN-WIRING — Implementation note

**Type:** Implementation slice (code). Local commit, **nothing pushed**. No migration, env,
provider, UI, or model-behavior change. Explain route response contract **unchanged**.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md) → CS-4 ·
builds on [CS-3 registry](./react-agent-cs-3-capability-registry.md) (`e451a1aed`).

## What this slice does

Wires **Explain with AI** as the **second** read-only capability through the React Agent
capability registry — mirroring the CS-2/CS-3 Q&A wiring, with no product behavior change.

## Registry entry added

```
diagnosis_explain → {
  allowedIntent: "explain_diagnosis",
  mode:          "read_only",
  creditFeature: "workflow_explanation",   // matches the Explain route's aiCreditGate feature
  auditKind:     "react_agent.diagnosis_explain",
}
```

`ReactAgentCapabilityId` is now `"diagnosis_qa" | "diagnosis_explain"`.

## Exact Explain wiring path

```
route: requireUser → loadWorkflowForMember → re-derive safe DTO server-side →
       OpenAI-config check → aiCreditGate (feature workflow_explanation, BEFORE model)
    → reactAgentService.runAuthorizedCapability({
        scope: { userId, accountId, workflowId },
        intent: "explain_diagnosis",
        capabilityId: "diagnosis_explain",
        exec: () => explainWorkflowDiagnosis({ dto, modelClient, tier }) })
    → route records ai_cost_events → safe response mapping (unchanged)
```
This is `route guard/DTO/gate → React Agent → brain`. **Not** `agent → HTTP route`. **Not**
a gate bypass. The boundary validates the registered capability + scope + intent, then runs
the injected `exec`; it imports no brain, calls no HTTP, re-implements no auth/credit gate. A
defensive `!outcome.ok` branch maps to the same safe 503, so the **frontend response is
byte-for-byte unchanged**.

## Registry ↔ gate metadata consistency (defense-in-depth)

A test locks each capability's `creditFeature` to the feature key its route actually charges
(`diagnosis_qa → workflow_qa`, `diagnosis_explain → workflow_explanation`), so drift between
the route's `aiCreditGate` feature and the capability metadata is caught in CI. A **runtime**
route↔registry cross-check is intentionally **deferred to the audit slice (CS-5/CS-4-audit)** —
keeping it out of the route avoids any risk of incorrectly blocking a live request, and the
existing feature keys are already clear.

## What it intentionally does NOT do

No repair/propose capability wired (`propose_repair` stays `not_yet_available`). No workflow
mutation, no Apply/Preview, no memory/queue/MCP/Hermes, no migration/env/provider. Explain stays
read-only; the model still sees only the server-built safe DTO; ids/config/tokens never rendered.

## What this is NOT

Still **not Hermes** (no runtime/memory) and **not MCP** (no external adapter). The boundary's
import guard remains green: no `scripts/mcp`, shell, fs, service-role client, workflow-mutation
API, or HTTP route client.

## Verification (this slice)

reactAgent + `ai-diagnose-explain-route.test.ts` + `ai-diagnose-qa-route.test.ts` → **4 suites,
66 passed**; builder AI client (`lib/api/ai.test.ts`) → **38 passed** (Explain + Q&A contracts
intact); `typecheck` clean; `eslint` touched 0; `lint:structure` OK.
