# REACT-AGENT-CS-5D-AUDIT-EMISSION-READONLY — Implementation note

**Type:** Implementation slice (runtime wiring — seam injection + read-only emission). Local
commit, **nothing pushed**. No migration, no env/provider change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-5b-audit-storage.md](./react-agent-cs-5b-audit-storage.md) →
[react-agent-cs-5c-audit-recorder.md](./react-agent-cs-5c-audit-recorder.md) → CS-5d.

## What changed

Runtime audit emission is now **active** for the two read-only React Agent capabilities.
`runAuthorizedCapability` accepts an injected fail-open recorder and emits exactly one
`react_agent_audit_events` row per call; the gated Q&A and Explain routes inject the live
recorder.

- **Contract moved to the boundary core.** `ReactAgentAuditRecorder` /
  `ReactAgentAuditRecorderInput` / `ReactAgentAuditOutcome` now live in
  `services/ai/reactAgent/types.ts` (pure types, no DB import). The `audit/` submodule
  re-exports them. This lets `index.ts` reference the recorder type **without** importing
  the `audit/` submodule or any repository — the CS-5c import guard stays green, unchanged.
- **Seam emission** (`services/ai/reactAgent/index.ts`): `runAuthorizedCapability` gained two
  optional inputs — `auditRecorder?` and `classifyResult?`. Emission map:
  - `invalid_scope` / `unknown_capability` / `intent_mismatch` → **denied** (reason = the
    rejection reason), `exec` NOT run.
  - `exec` throws → **failed** (reason `exec_error`), then **re-throws** (route error
    behavior unchanged).
  - `exec` resolves → `classifyResult(result)` (default `success`); the routes map a brain
    `{ ok: false }` model failure → **failed** (reason `exec_failed`).
- **Routes** (`.../ai/diagnose/qa/route.ts`, `.../explain/route.ts`): inject
  `reactAgentAuditRecorder` + `classifyResult: (r) => r.ok ? "success" : "failed"`. Emission
  happens **inside** the already-authorized path (after auth → membership → DTO re-derive →
  OpenAI-config → `aiCreditGate`). A denial before the seam (401/404/402/403/503/400) emits
  **no** audit row.

## Fail-open (two layers)

The injected recorder is fail-open (CS-5c swallows repo errors). The **seam also** wraps
`emit` in `try/catch` as defense in depth, so even a misbehaving/rejecting recorder can never
throw into — or change the outcome of — Q&A/Explain. Proven by tests at both the seam level
(rejecting recorder → result unchanged) and the route level (recorder rejects → still 200).

## No-leak

**No metadata is attached at the seam.** The audit input carries only scope ids + registry
enums (capabilityId / intent / mode / creditFeature / auditKind) + a safe `outcome`/`reason`
enum. The raw question, model answer/explanation, safe DTO, workflow config, and provider
payloads never enter the audit path. Tests assert the recorded input has no `metadata` and
contains none of the question/answer/explanation text.

## ai_cost_event_id — DEFERRED (documented follow-up)

The cost-event link is **not** populated in CS-5d. Reason: audit emission is central at the
seam and runs **before** the route records the `ai_cost_events` row (`recordQaEvent` /
`recordExplainEvent` after the seam returns), and `repositories/aiCostEvents.insertEvent`
returns `void` (no id surfaced). Linking would require either surfacing the cost id up through
the billing recorder (invasive to the billing layer) or moving audit emission after cost
recording (decentralizes it away from the seam). Per the slice brief, the link is deferred
rather than distorting the route/billing contracts. The two ledgers remain correlatable by
`(account_id, actor_user_id, workflow_id, credit_feature, created_at)`; the
`react_agent_audit_events.ai_cost_event_id` column stays nullable and unused for now. A future
slice can surface the cost id and thread it (e.g. seam emits, route updates) when warranted.

## Scope / unchanged boundaries

- **Routes still own** auth, account membership, safe-DTO re-derivation, OpenAI-config check,
  `aiCreditGate`, cost telemetry, and response mapping. The boundary only validates scope +
  capability registry + intent and emits the audit row.
- **Response contracts unchanged** — the seam returns exactly what it did before; audit is a
  pure side effect. Q&A/Explain success + failure + denial bodies/status are untouched.
- **No repair / proposes-change** wired (that capability mode stays declared-only).
- DB **default-grant** finding (CS-5b: `authenticated` has schema-default writes, RLS denies)
  remains deferred to broader DB hardening.

## Tests / verification

- Seam (`reactAgent.test.ts`): success (Q&A + Explain) with exact registry+scope fields;
  classifier → failed; denied for invalid_scope / unknown_capability (synthetic auditKind) /
  intent_mismatch with no `exec`; exec-throw → failed + re-throw; rejecting recorder swallowed;
  no metadata / no-leak; no-recorder backward-compat.
- Routes (qa + explain): success emits the right row; metadata-free / no-leak; model failure →
  failed; recorder failure → still 200; no emission when the gate denies.
- Ran: focused React Agent + recorder + both route + repo + migration suites (**115 passed**),
  `npm run typecheck` (clean), `eslint` touched files (0), `npm run lint:structure` (OK).

## Next

Optionally surface + link `ai_cost_event_id`. Then the repair-proposal capability
(`proposes_change` / `requires_approval`) audit + approval governance (CS-6+).
