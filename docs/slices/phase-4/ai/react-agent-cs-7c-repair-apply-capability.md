# REACT-AGENT-CS-7C-REPAIR-APPLY-CAPABILITY — Implementation note

**Type:** Implementation slice (registry + types + tests). Local commit, **nothing pushed**.
No apply wiring, no workflow mutation, no migration/schema, no env/provider change, no UI change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-7-approval-governance-plan.md](./react-agent-cs-7-approval-governance-plan.md)
(§10 CS-7c) → builds on [react-agent-cs-7b-repair-patch-ref.md](./react-agent-cs-7b-repair-patch-ref.md).

## What changed

Registers the first `requires_approval` capability in the React Agent registry so a later
slice can route the approved apply path through the seam. **Registration only — the apply
route/service is untouched, and nothing mutates a workflow.**

- **New intent** `apply_repair` ([services/ai/reactAgent/types.ts](../../../../services/ai/reactAgent/types.ts)):
  added to the `ReactAgentIntent` union so the registry's `allowedIntent` type-checks and
  `runAuthorizedCapability` can match it. **Deliberately NOT added to
  `RECOGNIZED_REACT_AGENT_INTENTS`** — apply is a mutation that must only run through the
  explicit-approval `runAuthorizedCapability` seam, so the free-text `handle()` path refuses it
  (`unsupported_intent`) and can never initiate an apply.
- **New capability** `repair_apply` ([services/ai/reactAgent/capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts)):
  - `allowedIntent: "apply_repair"`
  - `mode: "requires_approval"`
  - `creditFeature: null` (apply is deterministic / 0-credit — never a model call)
  - `auditKind: "react_agent.repair_apply"`

## Why this is safe with no route wiring

A capability in the registry does nothing on its own — it only becomes reachable when a route
calls `runAuthorizedCapability({ capabilityId: "repair_apply", intent: "apply_repair", exec })`.
No route does that yet (CS-7d). So registering the id + intent:

- adds no execution path (no `exec` is bound anywhere),
- mutates no workflow,
- changes no route response,
- and the free-text `handle()` seam refuses `apply_repair` outright.

## Tests / verification

Added to [tests/unit/services/ai/reactAgent/reactAgent.test.ts](../../../../tests/unit/services/ai/reactAgent/reactAgent.test.ts):
- `repair_apply` registered with the exact metadata (`apply_repair` / `requires_approval` /
  `creditFeature: null` / `react_agent.repair_apply`).
- `runAuthorizedCapability` runs `repair_apply` **only** for `apply_repair`; any other intent
  (`propose_repair` / `answer_diagnosis_question` / `explain_diagnosis` / `unknown`) →
  `intent_mismatch` with **no exec**.
- Unknown capability still fails closed (`unknown_capability`); invalid scope still fails closed
  (`invalid_scope`) — existing seam guards, re-confirmed.
- `handle()` REFUSES `apply_repair` (`unsupported_intent`) — never initiates apply.
- Existing Q&A / Explain / repair_proposal registry + route suites still green; import guard green.

Ran: focused React Agent suite + both repair routes + Q&A + Explain (**193 passed, 7 suites**);
`npm run typecheck` clean for this slice; `eslint` on touched files (0); `npm run lint:structure`
(OK).

## Unchanged / not done

- **Apply route + service untouched** — `…/ai/repair/apply/route.ts`, `applyRepairPatch`,
  `executeWorkflowPatch` not modified (read-only awareness only). No workflow mutation.
- No schema/migration, no env/provider change, no UI.
- `repairPatchRef` (CS-7b) is not yet used by an apply path — that lands in CS-7d.

## Next slice

**CS-7d** — route the existing guarded apply path through `runAuthorizedCapability`
(`capabilityId: "repair_apply"`, `intent: "apply_repair"`, live recorder), emit the
`react_agent.repair_apply` audit row (success/failed/denied), and reuse `repairPatchRef` over the
applied operations so the apply row's `proposed_patch_ref` matches the proposal row's — closing
the proposal↔apply correlation. Apply still never calls the model; response contract unchanged.
