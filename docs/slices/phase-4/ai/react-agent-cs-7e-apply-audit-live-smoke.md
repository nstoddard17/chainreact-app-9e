# REACT-AGENT-CS-7E-APPLY-AUDIT-LIVE-SMOKE — Smoke note

**Type:** Live-smoke / verification slice (one gated integration test added). Local commit,
**nothing pushed**. No migration/schema, no env/provider change, no UI, no source behavior change.
**Date:** 2026-06-20
**Branch:** `v2-main`
**Parent:** [react-agent-cs-7d-repair-apply-audit-wiring.md](./react-agent-cs-7d-repair-apply-audit-wiring.md)
(§"Next slice" CS-7e).

## What was done

Added a **gated, self-cleaning** live-DB smoke test that exercises the React Agent repair
proposal/apply audit trail against the V2 Supabase project (`qcepijemjlkssfkvzlio`) and asserts
the live `react_agent_audit_events` rows, then ran it.

- **Test:** [tests/integration/ai/react-agent-repair-apply-audit.dev.test.ts](../../../../tests/integration/ai/react-agent-repair-apply-audit.dev.test.ts)
  — opt-in via `ALLOW_DB_INTEGRATION_TESTS=true` (+ URL + service key); `describe.skip` otherwise,
  so CI never runs it. Mirrors the existing `tests/integration/**/*.dev.test.ts` pattern
  (throwaway user + personal account + smoke workflow, `afterAll` cleanup).

## What it exercises (live) vs. what it does not

**Live (real machinery against the live DB):** the real `runAuthorizedCapability` seam, the real
`reactAgentAuditRecorder` (service-role insert into `react_agent_audit_events`), the real
`repairPatchRef`, and the real deterministic apply pipeline (`assessApplyReadiness` +
`executeWorkflowPatch`). The same applyable `moveNode` patch is used for proposal + apply so the
refs MUST correlate.

**Not exercised (out of scope, by design):** the HTTP route + its SSR-cookie-gated persistence
(`updateDraftDefinitionIfRevisionMatches`) and the OpenAI model call — both need a browser/cookie
session or a paid non-deterministic model call, neither of which is CS-7's audit-governance
subject. The route wiring + status mapping are covered by the CS-7d unit tests. The apply
persistence is reproduced with the SAME pure executor + an optimistic service-role write that
mirrors the repo's `(id, account_id, updated_at)` guard.

## Results (run 2026-06-20, `ALLOW_DB_INTEGRATION_TESTS=true`) — 4/4 passed

| # | Scenario | Result |
|---|----------|--------|
| 1 | repair PROPOSAL success | `react_agent.repair_proposal` row: `capability_id=repair_proposal`, `mode=proposes_change`, `outcome=success`, `proposed_patch_ref` = `repair_patch_sha256:<hex>` (non-null), metadata `{}`. |
| 2 | approved APPLY success | `react_agent.repair_apply` row: `capability_id=repair_apply`, `mode=requires_approval`, `credit_feature=null`, `outcome=success`, `proposed_patch_ref` **== the proposal row's ref**. Draft mutated (node moved to `{123,456}`); workflow `state` **unchanged** (no deactivation); `updated_at` bumped; **0** `ai_cost_events` rows for the workflow (no model call). |
| 3 | STALE apply (old revision) | `react_agent.repair_apply` `outcome=failed` with a safe reason; draft **unchanged** (optimistic guard held). |
| 4 | BLOCKED apply (`removeNode`) | `react_agent.repair_apply` `outcome=failed` (not-applyable, no write attempted). |

No-leak: every audit row asserted `metadata = {}` and the serialized row contains no
`moveNode`/`removeNode`/`position`/config values/node id — only ids, registry enums, a safe
reason, and the one-way ref.

## Confirmations

- **proposed_patch_ref correlation:** the apply row's ref equals the proposal row's ref for the
  same `{ workflowId, baseRevision, operations }` — proposal↔apply correlation works live with
  **no approval table**.
- **No model call / no `aiCreditGate` / no cost event for apply:** asserted 0 `ai_cost_events`
  rows for the workflow; apply path imports no model client (CS-7d boundary test).
- **No lifecycle deactivation:** workflow `state` unchanged across a draft-only apply (trigger
  changes stay blocked by readiness).
- **Cleanup verified:** `afterAll` deletes the audit rows (by id + account sweep) **before** the
  account, so the `ON DELETE SET NULL` FKs leave **no orphaned NULL-account rows**. Post-run
  catalog check confirmed: 0 leftover smoke workflows, **0 orphaned NULL-account audit rows**, 0
  recent `repair_*` audit rows, 0 leftover smoke users. The V2 DB is pristine.

## Checks run

- Live smoke: **4/4 passed** (`ALLOW_DB_INTEGRATION_TESTS=true`).
- Unit: apply route + preview route + React Agent suites — **141 passed, 5 suites**.
- `eslint` on the new test (0); `npm run lint:structure` (OK); `npm run typecheck` clean for the
  new test.

## Next

Apply-governance arc closeout (CS-7), or — if/when a browser-session smoke harness exists — an
HTTP-level smoke of the route + SSR persistence. The deferred items from the CS-7 plan remain:
`ai_cost_event_id` link, the optional durable `react_agent_approvals` table (CS-7f, only if a
driver appears), and the cross-ledger DB grant-layer hardening.
