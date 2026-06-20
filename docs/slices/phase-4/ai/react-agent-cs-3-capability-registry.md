# REACT-AGENT-CS-3-CAPABILITY-REGISTRY — Implementation note

**Type:** Implementation slice (code). Local commit, **nothing pushed**. No migration, env,
provider, UI, or model-behavior change. Q&A route response contract **unchanged**.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md) → CS-3 ·
builds on [CS-2](./react-agent-cs-2-diagnosis-qa-wiring.md) (`d370fb98a`).

## Why the registry exists

CS-2's `runAuthorizedCapability` accepted an arbitrary `{ intent, exec }` pair — fine for the
first wiring, but as more brains land that becomes a generic "run anything" pipe. CS-3 adds an
**explicit allow-list** so only a known `(capabilityId → allowedIntent)` pair can execute
through the agent seam. A route can no longer route an unexpected intent/exec combination
through the boundary.

## What was added

- **`services/ai/reactAgent/capabilities.ts`** — the registry:
  - `ReactAgentCapabilityId` (`"diagnosis_qa"` today).
  - `ReactAgentCapabilityMode` (`read_only | proposes_change | requires_approval`).
  - `ReactAgentCapabilityDefinition` (`id`, `allowedIntent`, `mode`, `creditFeature`,
    `auditKind`).
  - `REACT_AGENT_CAPABILITIES` (frozen map) — `diagnosis_qa → { allowedIntent:
    "answer_diagnosis_question", mode: "read_only", creditFeature: "workflow_qa",
    auditKind: "react_agent.diagnosis_qa" }`.
  - `getReactAgentCapability(id)` — accepts any string, **fails closed** (`undefined`) for
    unknown ids.
- **`services/ai/reactAgent/index.ts`** — `runAuthorizedCapability` now **requires
  `capabilityId`** and validates: valid scope → capability exists → request intent matches
  `capability.allowedIntent` → run `exec`. Any failed check returns a safe outcome **without
  running `exec`**.
- **`services/ai/reactAgent/types.ts`** — two new `ReactAgentRejectionReason`s
  (`unknown_capability`, `intent_mismatch`); `ReactAgentService.runAuthorizedCapability`
  signature gains `capabilityId`.
- **`app/api/workflows/[id]/ai/diagnose/qa/route.ts`** — passes
  `capabilityId: "diagnosis_qa"`. Nothing else changed; **frontend response is unchanged**.

## Exact safety behavior

| Condition | Result | `exec` run? |
|---|---|---|
| valid scope + registered capability + matching intent | `{ ok: true, result }` | **yes** |
| blank `userId`/`accountId` | `{ ok:false, reason:"invalid_scope" }` | no |
| `capabilityId` not in registry | `{ ok:false, reason:"unknown_capability" }` | **no** |
| intent ≠ `capability.allowedIntent` | `{ ok:false, reason:"intent_mismatch" }` | **no** |

Rejection messages are static, generic, and **never echo the capability id or intent**
(asserted by test). Validation runs **before** `exec`, so an unknown/mismatched capability
has no side effect.

## What the registry does and does NOT guarantee

- **Does:** ensures only a registered capability, called with its declared intent, reaches
  `exec`. Records the credit-feature + audit-kind metadata for each capability (documentation
  + the future CS-4 audit trail).
- **Does NOT:** authorize the caller, check account membership, derive the safe DTO, charge
  credits, or run telemetry. **The route still owns all of that** — `creditFeature` here is
  metadata, not an enforcement point; the route's `aiCreditGate` remains the single gate.

## What this is NOT

- **Not Hermes** — no runtime/memory; just a static allow-list + the existing seam.
- **Not MCP** — no external adapter; the boundary still imports no `scripts/mcp`, shell, fs,
  service-role client, workflow-mutation API, or HTTP route client (import guard still green).

## Intentionally not implemented

No new capability is wired (`diagnosis_qa` only). `proposes_change` / `requires_approval`
modes are declared for the repair-proposal/apply capabilities that land later, but no
explain/repair capability is registered yet. No audit emission (CS-4), no queue (CS-5), no
conversation persistence, no Hermes.

## Next likely capability

`diagnosis_explain` (Explain with AI) or `repair_proposal` — each adds one registry entry
(`allowedIntent` + `mode` + `creditFeature`) and routes its existing brain call through the
same seam with the new `capabilityId`.

## Verification (this slice)

reactAgent + `ai-diagnose-qa-route.test.ts` → **3 suites, 45 passed**; builder Q&A client
(`lib/api/ai.test.ts`) → **38 passed** (response contract intact); `eslint` touched 0;
`typecheck` clean; `lint:structure` OK.
