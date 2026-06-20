# REACT-AGENT-CS-6-REPAIR-PROPOSAL-WIRING — Implementation note

**Type:** Implementation slice (registry + seam wiring — first `proposes_change` capability).
Local commit, **nothing pushed**. No migration, no env/provider change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-5d-audit-emission-readonly.md](./react-agent-cs-5d-audit-emission-readonly.md) → CS-6.

## What changed

`repair_proposal` is now the **first non-read-only React Agent capability**. The two existing
LLM repair-proposal routes run their model brain through `runAuthorizedCapability`, so each
emits one governed `react_agent_audit_events` row. **Propose + preview only — no apply, no
workflow mutation.**

- **Capability registry** (`services/ai/reactAgent/capabilities.ts`):
  - id `repair_proposal` · allowedIntent `propose_repair` · mode **`proposes_change`** ·
    creditFeature `workflow_repair` · auditKind `react_agent.repair_proposal`.
- **Routes wired** (model path only, after the existing gate):
  - `…/ai/repair/plan` (`planWorkflowRepair` — natural-language proposal).
  - `…/ai/repair/preview` (`previewWorkflowRepair` — validated-patch preview).

## Naming / mapping decision (plan vs preview)

The repo has **two** live LLM repair-proposal routes — `plan` (NL proposal) and `preview`
(validated-patch preview) — both charging `workflow_repair`, both driven by the builder. To
avoid an audit gap where one AI proposal is governed and the other isn't, the single
`repair_proposal` capability covers **both**. The deterministic, model-free preview paths
(selected-variable / dangling-edge / self-loop / duplicate-edge / deterministic) are **not**
wired — they run before the gate, call no model, cost $0, and are not the AI proposal
capability. The guarded persistence route `…/ai/repair/apply` is **not** a capability and is
left completely untouched.

## Wiring path (both routes)

```
auth (requireUser) → loadWorkflowForMember (account + no-leak 404) → re-derive safe DTO
  → access wall → OpenAI-config check → aiCreditGate (workflow_repair)
  → reactAgentService.runAuthorizedCapability({
        scope:{userId,accountId,workflowId}, intent:"propose_repair",
        capabilityId:"repair_proposal", auditRecorder: reactAgentAuditRecorder,
        classifyResult:(r)=>r.ok?"success":"failed", exec:()=> <proposal brain> })
  → existing fail-open cost telemetry (recordAiModelCall*) → existing response mapping
```

The route still owns auth / membership / DTO / OpenAI-config / `aiCreditGate` / cost telemetry
/ response mapping. The seam only validates scope + registry + intent and emits audit.

## Audit behavior

- **Success** (`result.ok === true`, a proposal/preview produced) → `success`, mode
  `proposes_change`, auditKind `react_agent.repair_proposal`.
- **Model/planner failure** (`result.ok === false`, incl. `NO_SAFE_PATCH`) → `failed`
  (reason `exec_failed`); the existing safe route response is preserved (NO_SAFE_PATCH still
  maps to its handled 200, genuine failures to 503/500 exactly as before).
- **invalid scope / unknown capability / intent mismatch** → `denied`, `exec` never runs
  (unreachable on the wired route; mapped to a safe 503 like Q&A/Explain).
- **`proposedPatchRef` stays null** — there is no stable opaque proposal id yet.
- **No metadata at the seam** — only scope ids + registry enums + safe outcome/reason. No raw
  proposal, patch body, workflow config, prompt, provider payload, or model output enters the
  audit (tests assert `metadata` absent + the proposal/patch summary text never appears).

## No apply / no mutation

This slice wires PROPOSAL generation only. No patch is applied, persisted, run, or activated;
no workflow is mutated. `…/ai/repair/apply` (and `applyRepairPatch` / `executeWorkflowPatch`)
are untouched. The route boundary tests still assert no apply/patch-writer/save/run imports.

## Fail-open

Unchanged from CS-5d: the injected recorder is fail-open, and the seam also swallows in
`emit`. Route tests prove a rejecting recorder still yields the normal 200 proposal/preview.

## Scope / deferred

- **Approved apply** (a `requires_approval` capability + approval persistence) — future slice.
- **`ai_cost_event_id` link** — still deferred (CS-5d rationale unchanged).
- **DB default-grant** hardening — still deferred to broader DB hardening.
- **Hermes / MCP** — out of scope; not a dependency of any of this.

## Tests / verification

- Registry: `repair_proposal` registered (mode `proposes_change`, feature `workflow_repair`);
  creditFeature lock test extended.
- Seam: `proposes_change` success row emitted; no metadata / no proposal-body leak.
- Routes (plan + preview): success emits the right row; metadata-free; model failure → failed;
  recorder failure → still 200; gate denial → no audit; **preview deterministic free path emits
  no audit**; existing auth/gate/no-leak/preview-only/proposal-only assertions still pass.
- Q&A + Explain route suites re-run green (shared seam unchanged behavior).
- Ran: focused React Agent + both repair routes + Q&A + Explain + recorder + repo + migration
  (**193 passed, 9 suites**), `eslint` touched files (0), `npm run lint:structure` (OK).
  `npm run typecheck` clean for this slice (a transient error surfaced once from the parallel
  session's actively-edited `features/analytics/WidgetConfigPanel.tsx`, unrelated to this
  slice, and was gone on re-run; none of this slice's files ever errored).
