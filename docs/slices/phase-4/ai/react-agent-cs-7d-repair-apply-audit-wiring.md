# REACT-AGENT-CS-7D-REPAIR-APPLY-AUDIT-WIRING — Implementation note

**Type:** Implementation slice (route wiring + audit). Local commit, **nothing pushed**.
No new apply behavior, no model call, no credit gate, no migration/schema, no env/provider
change, no UI change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-7c-repair-apply-capability.md](./react-agent-cs-7c-repair-apply-capability.md)
(registered `repair_apply`) · [react-agent-cs-7b-repair-patch-ref.md](./react-agent-cs-7b-repair-patch-ref.md)
(`repairPatchRef`) · [react-agent-cs-7-approval-governance-plan.md](./react-agent-cs-7-approval-governance-plan.md)
(§10 CS-7d).

## What changed

The existing guarded apply endpoint now runs its deterministic apply **through the React
Agent seam**, emitting one `react_agent.repair_apply` (`requires_approval`) audit row per
execution. **The apply safety model and response contract are unchanged.**

[app/api/workflows/[id]/ai/repair/apply/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply/route.ts):
- Wraps the existing `applyRepairPatch(...)` call as the seam `exec`:
  `reactAgentService.runAuthorizedCapability({ capabilityId: "repair_apply", intent: "apply_repair", auditRecorder: reactAgentAuditRecorder, classifyResult: (r) => r.ok ? "success" : "failed", deriveProposedPatchRef, exec })`.
- The unreachable `outcome.ok === false` branch (server invariant) maps to the route's existing
  `NOT_APPLYABLE` 422 shape — nothing applied.
- The resolved `outcome.result` flows into the **unchanged** result mapping
  (`200 {ok,applied,currentRevision,appliedOperations}` / `409 STALE_PATCH` / `422 NOT_APPLYABLE`
  + `blockedCategories` / `422 EXECUTION_FAILED`).

## Wiring path (unchanged guards, new seam)

```
requireUser (401) → parseJsonBody (400) → loadWorkflowForMember (no-leak 404)
  → assertWorkflowRunEditAllowed (403)            ← all still route-owned, BEFORE the seam
  → reactAgentService.runAuthorizedCapability({ repair_apply / apply_repair, recorder, ... ,
        exec: () => applyRepairPatch(...) })       ← seam validates scope+capability+intent, emits audit
  → applyRepairPatch: validateWorkflowPatch → assessApplyReadiness → executeWorkflowPatch
        → optimistic updateDraftDefinitionIfRevisionMatches   ← ALL safety unchanged, owned by the service
  → existing response mapping                        ← byte-for-byte unchanged
```

The seam **does not** re-validate, does not move auth/membership into itself, adds **no model
call**, and adds **no `aiCreditGate`** (`creditFeature: null`). Auth/membership/edit-gate run
**before** the seam, so a pre-seam denial emits no audit row.

## Audit behavior

| Path | Outcome | Notes |
|------|---------|-------|
| apply succeeds (`result.ok`) | **success** | mode `requires_approval`, auditKind `react_agent.repair_apply`. |
| apply returns `STALE_PATCH` / `NOT_APPLYABLE` / `EXECUTION_FAILED` | **failed** (reason `exec_failed`) | response unchanged (409/422). |
| invalid scope / unknown capability / intent mismatch | **denied** | exec never runs (unreachable on the wired route). |

Row fields: `accountId` (workflow-owning), `actorUserId` (the approving editor), `workflowId`,
`capabilityId: repair_apply`, `intent: apply_repair`, `mode: requires_approval`,
`creditFeature: null`, `auditKind: react_agent.repair_apply`, `outcome`, safe `reason`, and
`proposedPatchRef` (below). **No metadata at the seam** — no raw operations, workflow
draft/config, node config values, provider payload, secrets, model output, or prompt (apply
makes no model call at all). Recorder remains fail-open at both layers.

## proposedPatchRef correlation

The route computes `proposedPatchRef = repairPatchRef({ workflowId: id, baseRevision, operations })`
from the **apply request input** (the operations + baseRevision the client forwarded from the
preview), and the seam attaches it via `deriveProposedPatchRef`. Because CS-7b's preview row used
`repairPatchRef({ workflowId: preview.workflowId, baseRevision: preview.apply.baseRevision, operations: preview.apply.operations })`
over the **same** canonical `{ workflowId, baseRevision, operations }`, the apply row's
`proposed_patch_ref` **equals** the preview proposal row's — closing the proposal↔apply
correlation with **no approval table** (verified by test). It is derived from the request input
(not the result's value-free `appliedOperations` summary, which omits config), and is **null**
when `baseRevision`/`operations` are absent (then no correlation is possible — documented).

## Unchanged / not done

- **No new apply behavior, no model call, no `aiCreditGate`** (apply stays deterministic /
  0-credit). The route's boundary test still asserts no `modelClient`/`aiCreditGate`/lifecycle
  import.
- **Apply safety unchanged** — all validation/readiness/executor/optimistic-revision logic stays
  inside `applyRepairPatch` (untouched); unsafe patches + stale/graph-changed still fail closed.
- **Response contract unchanged** — audit is a fail-open side effect.
- No schema/migration, no UI, no env/provider change.

## Tests / verification

[tests/unit/app/api/workflows/ai-repair-apply-route.test.ts](../../../../tests/unit/app/api/workflows/ai-repair-apply-route.test.ts):
- success → one `react_agent.repair_apply` success row, mode `requires_approval`, correct scope;
  `mockApply` ran through the seam.
- `proposedPatchRef` equals `repairPatchRef({wf-1, rev-1, operations})` (preview-correlation).
- STALE_PATCH/NOT_APPLYABLE/EXECUTION_FAILED → `failed` audit, response unchanged (409/422).
- no metadata / no `updateNodeConfig` / `n1` / config value leak into the audit input.
- recorder failure swallowed → apply still 200; pre-seam denial (403) → no audit, no apply.
- Existing apply authz + result-mapping + no-leak + persistence-boundary tests still green.

Ran: apply route + React Agent seam + both repair routes + Q&A + Explain + repairPatchRef
(**227 passed, 9 suites**); `npm run typecheck` clean for this slice; `eslint` touched files (0);
`npm run lint:structure` (OK).

## Next slice

**CS-7e** — live smoke / manual verification of the apply audit rows (query
`react_agent_audit_events` by `auditKind = react_agent.repair_apply`: success/stale/blocked
rows, `proposed_patch_ref` matching the proposal, no model call, no deactivation), or the
apply-governance arc closeout.
