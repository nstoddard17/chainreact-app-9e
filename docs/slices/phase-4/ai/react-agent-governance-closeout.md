# React Agent Governance Arc — Closeout

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in this slice. Nothing pushed.**
**Date:** 2026-06-20
**Branch:** `v2-main` (local-only; the arc is unpushed)
**Marker:** REACT-AGENT-GOVERNANCE-CLOSEOUT-1

Closes out the React Agent governance arc: the in-app, customer-facing assistant now runs its
read-only and change-making capabilities through a single account/workflow/user-scoped seam that
validates scope + registry + intent and emits a governance audit row — with approved repair apply
gated behind explicit approval, deterministic, and model-free.

---

## 1. Summary (per slice)

- **CS-1** — React Agent service boundary: types + a side-effect-free no-op dispatcher (no model,
  no tool, no DB, no MCP).
- **CS-2** — routed diagnosis **Q&A** through the boundary's server-side execution seam.
- **CS-3** — capability **registry / allow-list**: only a registered `(capabilityId → allowedIntent)`
  pair can run through the seam.
- **CS-4** — routed **Explain** through the registry-gated seam.
- **CS-5 / 5b / 5c / 5d** — audit **seam plan → storage (`react_agent_audit_events` + RLS + repo)
  → fail-open recorder → runtime emission** for the read-only Q&A / Explain capabilities.
- **CS-6** — wired **repair proposal** (the first `proposes_change` capability) through the seam
  for both LLM proposal routes (plan + preview).
- **CS-7 / 7b / 7c / 7d / 7e** — approved-apply **governance plan → deterministic
  `proposed_patch_ref` → `repair_apply` capability registration → apply route through the seam +
  audit → live smoke** of the proposal/apply audit correlation.

The architecture correction that framed the arc (React Agent vs MCP vs Hermes) is
[`react-agent-hermes-architecture.md`](./react-agent-hermes-architecture.md) (commit `dfb1ad1b8`).

## 2. Completed commit chain (real `git log`, chronological)

- `193627693` — React Agent service boundary — types + no-op dispatcher (CS-1) _(2026-06-19)_
- `d370fb98a` — route diagnosis Q&A through the React Agent boundary (CS-2) _(2026-06-19)_
- `e451a1aed` — React Agent capability registry / allow-list (CS-3) _(2026-06-19)_
- `1dad9a5e2` — wire Explain through the React Agent capability registry (CS-4) _(2026-06-19)_
- `3fe9ccb0a` — React Agent audit-seam plan (CS-5, docs) _(2026-06-19)_
- `ad1bc1475` — audit-event storage — table + RLS + repository (CS-5b) _(2026-06-19)_
- `5481dc5f7` — audit recorder — injectable, fail-open, not yet wired (CS-5c) _(2026-06-19)_
- `959bccabf` — emit audit events for read-only Q&A/Explain (CS-5d) _(2026-06-19)_
- `a67148a9e` — wire repair proposal as first `proposes_change` capability (CS-6) _(2026-06-19)_
- `6f4579d3c` — approved-repair governance plan (CS-7, docs) _(2026-06-19)_
- `116e254a7` — deterministic repair patch-ref + thread into preview audit row (CS-7b) _(2026-06-19)_
- `ae3b25409` — register `repair_apply` `requires_approval` capability (CS-7c) _(2026-06-19)_
- `0dd09204e` — route repair apply through the seam + emit `requires_approval` audit (CS-7d) _(2026-06-20)_
- `c6820d5a1` — live smoke of repair proposal/apply audit trail (CS-7e) _(2026-06-20)_

(The CS-5b migration was applied to the V2 dev DB via `db:push` during CS-5b — see §8.)

## 3. Current behavior (end to end)

Each AI route keeps owning its own gates and runs its already-authorized brain/work call
**through** `reactAgentService.runAuthorizedCapability(...)`. The seam:
1. validates the scope SHAPE (userId + accountId present) — it does **not** grant access;
2. looks up `capabilityId` in the registry (unknown → `unknown_capability`, no exec);
3. checks the request `intent` matches the capability's `allowedIntent` (else `intent_mismatch`,
   no exec);
4. runs the injected `exec` and returns its EXACT result;
5. emits exactly **one** `react_agent_audit_events` row per call (success / failed / denied).

**Current capability registry** ([services/ai/reactAgent/capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts), verified at HEAD):

| capabilityId | allowedIntent | mode | creditFeature | auditKind |
|---|---|---|---|---|
| `diagnosis_qa` | `answer_diagnosis_question` | `read_only` | `workflow_qa` | `react_agent.diagnosis_qa` |
| `diagnosis_explain` | `explain_diagnosis` | `read_only` | `workflow_explanation` | `react_agent.diagnosis_explain` |
| `repair_proposal` | `propose_repair` | `proposes_change` | `workflow_repair` | `react_agent.repair_proposal` |
| `repair_apply` | `apply_repair` | `requires_approval` | `null` | `react_agent.repair_apply` |

`repair_proposal` covers both LLM proposal routes (`/ai/repair/plan` + `/ai/repair/preview`).
`repair_apply` wraps the existing deterministic apply route. The `apply_repair` intent is a valid
`ReactAgentIntent` but is **deliberately excluded** from `RECOGNIZED_REACT_AGENT_INTENTS`, so the
free-text `handle()` seam refuses it — an approved apply can only run through
`runAuthorizedCapability`.

## 4. Audit behavior + security / no-leak guarantees

- **Table:** `react_agent_audit_events` — account-scoped governance ledger, separate from
  `ai_cost_events` (links to it via `ai_cost_event_id`, currently unused — §7). Member-read RLS via
  `account_memberships`; **service-role-write-only** (no user INSERT/UPDATE/DELETE policy/grant);
  deletion is **anonymize-retain** (all FKs `ON DELETE SET NULL`, no cascade). CHECKs:
  `outcome ∈ {success,denied,failed}`, `mode ∈ {read_only,proposes_change,requires_approval}`,
  `jsonb_typeof(metadata)='object'`, text-length caps; **no raw-payload columns**.
- **Outcomes:** `success` (exec resolved ok), `failed` (exec threw → re-thrown; or the route's
  classifier maps a brain `{ok:false}` / apply STALE/NOT_APPLYABLE/EXECUTION_FAILED to failed),
  `denied` (invalid scope / unknown capability / intent mismatch — exec never runs).
- **Fail-open at two layers:** the recorder swallows DB errors; the seam ALSO wraps emission in
  try/catch. An audit-write failure can never throw into, or change the outcome of, the agent/user
  path (proven by unit + live tests).
- **No-leak metadata:** the seam attaches **no** metadata. Audit rows carry only ids, registry
  enums, a safe `reason` enum, and the opaque `proposed_patch_ref`. No raw prompt, model
  output/answer/explanation, safe DTO, workflow config, patch body, provider payload, secrets, or
  tokens ever enter the audit (asserted across the unit suites and the CS-7e live smoke).
- **`proposed_patch_ref` correlation:** `repairPatchRef({ workflowId, baseRevision, operations })`
  — a one-way `repair_patch_sha256:<hex>` digest (canonical SHA-256, sorted keys, preserved op
  order; reuses `hashPayload`). The applyable preview row and the apply row carry the **same** ref
  for the same patch, correlating proposal↔apply with **no approval table**.

## 5. Live verification summary (CS-7e, ran this session — 2026-06-20)

Gated self-cleaning smoke
([tests/integration/ai/react-agent-repair-apply-audit.dev.test.ts](../../../../tests/integration/ai/react-agent-repair-apply-audit.dev.test.ts),
opt-in `ALLOW_DB_INTEGRATION_TESTS`, skipped in CI) drove the **real** seam + **real** live
recorder + **real** `assessApplyReadiness`/`executeWorkflowPatch` + **real** `repairPatchRef`
against the V2 project `qcepijemjlkssfkvzlio`. **4/4 passed:**

- **Proposal row** — `react_agent.repair_proposal`, `proposes_change`, `outcome=success`,
  `proposed_patch_ref` non-null.
- **Apply success row** — `react_agent.repair_apply`, `requires_approval`, `credit_feature=null`,
  `outcome=success`, `proposed_patch_ref` **== the proposal row's ref**. Draft mutated; workflow
  `state` unchanged (no deactivation); revision bumped.
- **Stale failure row** — `outcome=failed` with a safe reason; draft unchanged (optimistic guard).
- **Blocked failure row** — `removeNode` → `outcome=failed`, no write attempted.
- **No cost/model call for apply** — asserted **0** `ai_cost_events` rows for the workflow; apply
  imports no model client and has no `aiCreditGate`.
- **Cleanup verified** — audit rows deleted before the account (vs the `SET NULL` FKs), so post-run
  catalog check showed **0** orphaned NULL-account rows, 0 leftover smoke workflows/users. DB
  pristine.

Not exercised live (out of scope): the HTTP route + its SSR-cookie-gated persistence (covered by
the CS-7d unit tests) and the OpenAI model call (not the audit-governance subject).

## 6. UI behavior

No UI shipped in this arc. The apply route remains **unwired to any builder button** (no Apply
affordance); CS-7d audits it ahead of a future UI, consistent with CS-5d/CS-6 auditing
currently-inert routes. No fake or unsupported controls were added. The customer-facing assistant
surface (a real Apply approval UX) is a separate future slice and must not be implied as live.

## 7. Deferred / known limitations

- **`ai_cost_event_id` link — deferred.** The seam emits before the route records the cost event,
  and `aiCostEvents.insertEvent` returns void; linking would distort the billing layer. The column
  stays nullable; ledgers correlate by `(account_id, actor_user_id, workflow_id, credit_feature,
  created_at)`. (CS-5d / CS-7 plan.)
- **Durable `react_agent_approvals` table — deferred (CS-7f), only if a real driver appears**
  (server-minted proposals referenced by id, one-time-use approval tokens, or a cross-session
  approval queue). Not needed for safe apply today; building it now would be Hermes-style
  over-modeling. (CS-7 plan §5, Option B.)
- **Cross-ledger grant-layer hardening — deferred.** `authenticated` carries schema-default
  grant-level writes on `react_agent_audit_events` (identical to `ai_cost_events`); RLS still denies
  all writes. A least-privilege REVOKE belongs to a broader DB-hardening slice across all ledgers.
  (CS-5b finding.)
- **`docs/PROJECT_MEMORY.md` prune — deferred.** The file is well over its ~150-line target; a
  dedicated curation pass is its own task (this closeout only adds one compact bullet).
- **Hermes scoped runtime/memory — not started.** Hermes is the later, scoped memory/runtime layer
  (NOT a global brain); MCP stays an external/internal adapter only. Governance being in place is
  the precondition for designing it.

## 8. Verification baseline

- **Ran this session (2026-06-20):**
  - CS-7e live smoke: **4/4 passed** (`ALLOW_DB_INTEGRATION_TESTS=true`) against `qcepijemjlkssfkvzlio`,
    with post-run cleanup verified via catalog query (0 orphans/leftovers).
  - Focused unit suites at CS-7e: apply route + preview route + React Agent — **141 passed, 5 suites**.
    (Earlier arc turns this session ran the broader React Agent + route suites green: 193 / 210 / 227.)
  - `npm run typecheck` — clean for the changed files (the only transient full-tree errors were the
    parallel session's actively-edited `features/analytics/**`, gone on re-run; never this arc's files).
  - `eslint` on touched files — 0; `npm run lint:structure` — OK.
  - **`npm run build` — not run this session** (the shared worktree has an active parallel session;
    `tsc --noEmit` covered repo-wide compilation).
- **Migration:** `supabase/migrations/20260705000000_react_agent_audit_events.sql` — **applied**
  (`db:push`) to the V2 dev DB during CS-5b and live-verified; not pushed to git remote.
- **Feature flags:** this arc added **none**. No flag gates the React Agent seam or audit emission;
  governance is always-on for the wired routes. (`repair_apply` is reachable only via the seam, and
  the apply route has no UI entry point yet — §6.)
- **Push state:** entire arc is **local-only, unpushed** on `v2-main`.

## 9. Recommended next tracks

1. **Push/deploy the verified local batch — only with Marcus's explicit approval.** The arc is
   complete and live-verified but unpushed; `v2-main` also carries an unrelated parallel analytics
   track in the shared worktree. Before any push: `git log --oneline` to confirm the interleaved
   chain, and decide batch vs. selective.
2. **Begin Hermes scoped runtime/memory design** now that governance (registry + audit + approval)
   is in place — Hermes as a scoped per-conversation/workflow memory + runtime adapter, NOT a global
   brain; MCP stays an adapter.
3. Smaller follow-ups when a driver appears: the `ai_cost_event_id` link, the `react_agent_approvals`
   table (CS-7f), and the cross-ledger grant hardening.

## 10. Closeout confirmation

Docs-only. Nothing pushed, nothing deployed, no env/migration/schema/source/test/UI change.
Doc: `docs/slices/phase-4/ai/react-agent-governance-closeout.md`.
