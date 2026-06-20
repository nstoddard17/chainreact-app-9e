# REACT-AGENT-CS-5-AUDIT-SEAM-PLAN — React Agent audit seam Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, env, or behavior
changes in this slice. Nothing pushed, nothing deployed, no migration run.**
**Date:** 2026-06-19
**Branch:** `v2-main`

**Source of truth (verified current state — files actually read for this plan):**
[services/ai/reactAgent/index.ts](../../../services/ai/reactAgent/index.ts) (`runAuthorizedCapability` seam) ·
[services/ai/reactAgent/capabilities.ts](../../../services/ai/reactAgent/capabilities.ts) (registry + `creditFeature`/`auditKind`/`mode`) ·
[app/api/workflows/[id]/ai/diagnose/qa/route.ts](../../../app/api/workflows/%5Bid%5D/ai/diagnose/qa/route.ts) + [explain/route.ts](../../../app/api/workflows/%5Bid%5D/ai/diagnose/explain/route.ts) (route owns auth/DTO/gate/telemetry) ·
[services/billing/aiCostEvents.ts](../../../services/billing/aiCostEvents.ts) (`AiEventScope`, `recordAiModelCall*`, `recordAiToolCalled`, `recordAiPatchOutcome`, metadata sanitizer) ·
[repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts) (column map) ·
[supabase/migrations/20260525000001_ai_cost_events.sql](../../../supabase/migrations/20260525000001_ai_cost_events.sql) (base table, RLS, GRANT, CHECK enums) ·
[supabase/migrations/20260531000005_ledger_account_rescope.sql](../../../supabase/migrations/20260531000005_ledger_account_rescope.sql) (added `account_id` owner + membership RLS) ·
[react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md) (OQ-3: separate audit table) ·
[react-agent-cs-4-explain-wiring.md](./react-agent-cs-4-explain-wiring.md) (`d370fb98a`/`e451a1aed`/`1dad9a5e2`).

---

## 1. Context

CS-1..CS-4 built the React Agent boundary (`runAuthorizedCapability`), an explicit capability
registry, and wired two **read-only** capabilities (`diagnosis_qa`, `diagnosis_explain`)
through it — routes still own auth / membership / safe-DTO derivation / `aiCreditGate` /
telemetry. The next capability class is **`proposes_change` / `requires_approval`** (repair
proposal → approved apply). Before any agent action can *propose a change*, we need an audit
trail: **who** ran **what** capability, in **what scope**, with **what outcome**, and — for
proposals — **what patch** and **whose approval**. This plan designs that seam. It implements
nothing.

## 2. Current codebase findings (verified)

### 2.1 The React Agent seam (where audit must hook)
`runAuthorizedCapability({ scope, intent, capabilityId, exec })`
([index.ts](../../../services/ai/reactAgent/index.ts)) is the **single chokepoint** every
capability passes through. It validates scope → registry lookup → intent match → runs `exec`,
returning `{ ok:true, result } | { ok:false, reason }`. The registry
([capabilities.ts](../../../services/ai/reactAgent/capabilities.ts)) already carries the
audit-relevant metadata per capability: `id`, `allowedIntent`, `mode`, `creditFeature`,
`auditKind` (e.g. `react_agent.diagnosis_qa`). **Critical constraint:** the boundary is
**import-fenced** — a guard test fails if it imports `scripts/mcp`, shell, fs, a service-role
client, a workflow-mutation API, or an HTTP client. So the audit **recorder must be injected**,
never imported by the boundary core.

### 2.2 `ai_cost_events` — what it is and what it now has
Originally user-scoped (base migration `20260525000001`), then **rescoped to account
ownership** by `20260531000005` (added `account_id NOT NULL` as owner, kept `user_id` as
actor, added an account index + a membership RLS read policy). The **live** table columns
([repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts) row map) are:
`account_id` (owner), `user_id` (actor), `workflow_id?`, `workflow_run_id?`, `patch_id?`,
`conversation_id?`, `feature` (CHECK enum), `event_type` (CHECK enum), model/token/cost
fields, `tool_name?`, `tool_status?`, `validation_error_code?`, `safety_block_reason?`,
`accepted?`, `success?`, sanitized `metadata jsonb`, `created_at`. Event types include
`ai_tool_called` / `ai_tool_failed` / `ai_patch_proposed` / `ai_patch_previewed` /
`ai_patch_applied` / `ai_patch_rejected`; `recordAiToolCalled` + `recordAiPatchOutcome`
helpers already exist. RLS: read own + account-membership; **all writes via service_role**.
GRANT: `authenticated` SELECT only, `service_role` full. Metadata is sanitized (key denylist +
length caps) before persistence. **Hard rule (stated in the migration): never store raw
prompts/completions/configs/secrets/provider bodies** — only ids/types/counts/costs/codes.

### 2.3 No generic audit table exists
Grep for `*_audit_events` / `admin_audit` / `audit_log` in `supabase/migrations/` returns
nothing. The only AI-observability ledger is `ai_cost_events`.

## 3. Product / model decision — what the audit seam IS and is NOT

**Is:** an **account-scoped governance record** of React Agent capability invocations — every
run (success / denied / failed), the scope, the capability + intent + mode, and — for future
proposes-change — the proposed-patch reference + approval. It supports compliance ("show every
agent action on this account"), debugging, and the approval model for workflow changes.

**Is NOT:** a cost ledger (that stays `ai_cost_events`), a prompt/answer store (no content
retained), a memory store (Hermes is later), or a user-facing feature. It is **append-only**
and **service-role-write-only**. Account is the ownership spine (V2 model) — audit is scoped by
`account_id`, never cross-account.

## 4. Recommended approach

**Recommendation: B — a new, account-scoped `react_agent_audit_events` table**, written
service-role-only at the central seam via an **injected recorder**, and **linked** to
`ai_cost_events` (it references the cost event id; it does not duplicate token/cost data).

Why not just extend `ai_cost_events` (Option A is now genuinely viable — it has `account_id`,
`conversation_id`, `patch_id`, `ai_tool_called`, and a recorder): because the audit trail's
**governance** needs don't fit a cost ledger as first-class data:
- **Denials happen with no model call** (invalid scope / unknown_capability / intent_mismatch /
  credit-exhausted / frozen) — they are not "cost" events and have no natural `event_type`.
- **Approval linkage** (`proposed_patch_ref` + `approval_id` + approver + time) is a governance
  concept, not a cost one.
- **`mode`** (read_only / proposes_change / requires_approval) is governance metadata.
- **Future Hermes memory reads** ("agent read memory key K for scope S") are audit, not cost.
- Overloading the cost ledger's closed `feature` / `event_type` CHECK enums + JSON metadata for
  all of the above makes queries ("all repair approvals in account X") fragile JSON scans and
  blurs the table's stated single purpose.

Cost stays where it belongs (`ai_cost_events`, already wired in both routes); audit gets a
purpose-built, queryable, account-scoped home that references it.

### Emission location — the central seam, via an injected recorder
**`runAuthorizedCapability` is the audit seam** (the task's preferred direction). It already
sees scope + capability + intent + outcome at one chokepoint. To keep the boundary
import-fenced, it takes an **optional injected `recordAudit`** function (same pattern as the
injected `exec`):

```
runAuthorizedCapability({ scope, intent, capabilityId, exec, recordAudit? })
  → validate → on EVERY path (denied / failed / success) call recordAudit(safeAuditRecord)
  → recordAudit is provided by the route/service factory; the DB write + service-role client
    live OUTSIDE the boundary (services/ai/reactAgent/audit + a repository).
```

- The boundary builds the **safe** audit record from data it already holds (account/user/
  workflow/conversation ids, capability_id, intent, mode, credit_feature, audit_kind, outcome,
  reason). It calls the injected sink; it never imports the DB.
- The **route still owns** auth / membership / safe-DTO / `aiCreditGate` / `ai_cost_events`
  telemetry. The route also **attaches the `ai_cost_event_id`** (it owns the model call + cost
  write) — so the model/cost link is set route-side after the cost event is recorded
  (hybrid: seam emits the audit shell; route attaches the cost/patch/approval ids). For CS-5
  read-only capabilities the shell + outcome is enough; patch/approval columns stay null.
- **Fail-open:** audit write failures must never break the user response (mirrors
  `recordQaEvent`'s try/catch).

## 5. Alternatives considered

| Option | Migration | Account-scoped? | Fits governance (denials/approval/mode/memory) | Separation of concerns | Verdict |
|---|---|---|---|---|---|
| **A. Extend `ai_cost_events` (model runs as `ai_tool_called` + metadata)** | none | yes (already) | **partial** — denials/approvals/mode live in JSON; closed CHECK enums don't fit | overloads the cost ledger's stated single purpose | **Rejected as the target** (viable stop-gap for read-only only; see §9 CS-5a fallback) |
| **B. New `react_agent_audit_events` table, linked to `ai_cost_events`** | 1 new table | yes (first-class `account_id`) | **yes** — first-class columns for outcome/reason/mode/patch_ref/approval_id; extensible for memory reads | clean: audit ≠ cost; references cost by id | **RECOMMENDED** |
| **C. Reuse an existing workflow audit/event table** | n/a | n/a | n/a | n/a | **Rejected** — no such table exists |

## 6. Security / data model

### Proposed table (sketch — built in a later slice, not now)
```sql
CREATE TABLE public.react_agent_audit_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,  -- owner spine
  actor_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,      -- who acted
  workflow_id        uuid REFERENCES public.workflows(id) ON DELETE SET NULL,         -- nullable
  conversation_id    text,                                                            -- session-local, nullable
  capability_id      text NOT NULL,                 -- registry id (e.g. diagnosis_qa)
  intent             text NOT NULL,                 -- ReactAgentIntent
  mode               text NOT NULL,                 -- read_only | proposes_change | requires_approval
  credit_feature     text,                          -- capability.creditFeature (nullable for 0-credit)
  audit_kind         text NOT NULL,                 -- registry auditKind (react_agent.*)
  outcome            text NOT NULL,                 -- success | denied | failed
  reason             text,                          -- SAFE enum only (invalid_scope/unknown_capability/
                                                    --   intent_mismatch/credits_exhausted/frozen/model_failed)
  proposed_patch_ref text,                          -- future: opaque ref, NOT a patch body
  approval_id        text,                          -- future: approval record id
  ai_cost_event_id   uuid REFERENCES public.ai_cost_events(id) ON DELETE SET NULL,    -- link, no dup cost
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- sanitized; ids/enums/counts only
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX react_agent_audit_account_idx  ON public.react_agent_audit_events (account_id, created_at DESC);
CREATE INDEX react_agent_audit_workflow_idx ON public.react_agent_audit_events (workflow_id, created_at DESC);
CREATE INDEX react_agent_audit_capability_idx ON public.react_agent_audit_events (capability_id, created_at DESC);

ALTER TABLE public.react_agent_audit_events ENABLE ROW LEVEL SECURITY;
-- Reads: account members only (mirrors ai_cost_events account-membership policy). Writes:
-- service_role only (default-deny for authenticated) so an actor can't fabricate/erase audit.
GRANT SELECT ON public.react_agent_audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.react_agent_audit_events TO service_role;
-- + a member-of-account SELECT policy (EXISTS over account_members), no INSERT/UPDATE/DELETE policy.
```
(Account-deletion / anonymization should cascade or anonymize alongside `ai_cost_events` —
follow the `account_deletion_lifecycle` / `ledger_anonymization` migrations' precedent.)

### Privacy / no-leak rules (hard)
- **NEVER store** raw prompts, the user question, the model answer/explanation, workflow
  config, `{{...}}` references, secrets, tokens, provider payloads, or raw error bodies.
- **Store only** ids (uuid/opaque), registry enums (`capability_id`/`intent`/`mode`/
  `audit_kind`), a **safe** outcome/reason enum, the cost-event link, and sanitized metadata
  (ids/enums/counts — routed through the existing `sanitizeAiEventMetadata`).
- `reason` is a closed safe enum, never a raw message. `proposed_patch_ref` is an opaque id,
  never a patch body.
- Append-only, service-role-write-only, RLS account-scoped. A non-member can't read or infer
  another account's agent activity.

## 7. How it relates to `ai_cost_events`

Complementary, not duplicative. `ai_cost_events` = **cost/observability** (tokens, $, model,
latency, per the routes' existing `recordAiModelCall*`). `react_agent_audit_events` =
**governance** (capability/outcome/approval). The audit row **references** the cost event
(`ai_cost_event_id`) so one can join "this Q&A audit row → its model-cost event," without
copying cost data or storing content in either.

## 8. How it supports future repair / approved apply / Hermes memory

- **Repair proposal (`proposes_change`):** the audit row records `outcome=success`,
  `mode=proposes_change`, `proposed_patch_ref=<preview id>` — a record that a patch was
  *proposed*, with no patch body.
- **Approved apply (`requires_approval`):** a second audit row (or an update) records the
  approval (`approval_id`, actor, time) and the apply outcome — the human-in-the-loop trail
  the approval model requires.
- **Hermes memory reads (later):** a `memory_read` capability/auditKind records that the agent
  read a scoped memory key — same table, same account-scoping, no content stored. This is why a
  dedicated, extensible table beats overloading the cost ledger.

## 9. Implementation slice breakdown (AFTER Marcus approval — nothing built here)

- **CS-5a (optional stop-gap, no migration):** record read-only capability runs as
  `ai_tool_called` / `ai_tool_failed` in `ai_cost_events` via the existing `recordAiToolCalled`
  (tool_name=`capability_id`, tool_status=outcome, metadata=intent/mode/audit_kind), injected
  into `runAuthorizedCapability`. Ships audit *signal* immediately while the table lands.
  **Only if** Marcus wants audit before the migration; otherwise skip straight to CS-5b.
- **CS-5b (migration):** create `react_agent_audit_events` (table + indexes + RLS + GRANTs).
  `db:push` to dev DB only (per posture); **not** pushed/prod until deploy. `lint:migrations`.
- **CS-5c (repository + recorder):** `repositories/reactAgentAuditEvents.ts` (service-role
  insert) + `services/ai/reactAgent/audit/recordReactAgentAudit.ts` (builds the safe record,
  sanitizes metadata). NOT imported by the boundary core.
- **CS-5d (seam injection):** add optional `recordAudit` to `runAuthorizedCapability`; emit on
  every path (denied/failed/success); fail-open. Routes pass the recorder + attach
  `ai_cost_event_id`. Import guard stays green (recorder injected, not imported).
- **CS-5e (consistency assertion):** non-blocking dev assertion/log that the route's gated
  `aiCreditGate` feature equals `capability.creditFeature` (see §10). No hard block.
- **CS-5f (tests):** no-leak (no prompt/answer/config/secret in any column or metadata); RLS
  (non-member can't read another account's rows; authenticated can't write); outcome/reason
  enums; fail-open; cost-event link; seam emits on all three outcomes.

## 10. Registry / gate consistency — decision

- **Now:** **test-only** — the CS-4 test already locks each capability's `creditFeature` to its
  route's `aiCreditGate` feature key. Keep it.
- **At CS-5 implementation:** add a **non-blocking dev assertion/log** (e.g. when
  `process.env.NODE_ENV !== 'production'`, log a warning if the route's gated feature ≠
  `capability.creditFeature`). Clean, cheap, surfaces drift in dev/CI.
- **Do NOT** make it a hard runtime precondition that blocks live requests — not until the
  audit table exists and the behavior is proven. The route's `aiCreditGate` remains the single
  enforcement point; the registry is metadata.

## 11. Risks / open questions

- **OQ-1 — Table vs stop-gap:** land `react_agent_audit_events` (CS-5b) directly, or ship the
  `ai_cost_events` `ai_tool_called` stop-gap (CS-5a) first? *Recommendation:* go straight to the
  dedicated table — repair proposal is the next capability and needs the approval columns.
- **OQ-2 — Retention / anonymization:** mirror `ai_cost_events`' anonymization +
  account-deletion lifecycle for the audit table? *Recommendation:* yes — reuse the precedent
  migrations' approach.
- **OQ-3 — Conversation persistence:** `conversation_id` is session-local today (no table). Keep
  it as a free-text column (nullable) until a conversation model lands? *Recommendation:* yes —
  text column now, FK later if a conversations table is built.
- **OQ-4 — Emit on read-only denials too?** Recording denials (credit-exhausted, scope-invalid)
  is valuable for abuse/debugging but adds rows. *Recommendation:* yes, record all outcomes;
  they're cheap and the governance value is the point.
- **OQ-5 — Approval model location:** does `approval_id` reference a future `approvals` table or
  ride inline? *Recommendation:* decide at the repair-apply slice; leave the column nullable
  text now.

## 12. Acceptance criteria

**This planning slice:** doc exists at the path below; every current-state claim ties to a file
read; storage recommendation + emission location + schema + no-leak rules + slice breakdown
recorded; **no source/test/migration/schema/UI/env changed; nothing pushed/deployed/migrated.**

**Later implementation must meet:** account-scoped, service-role-write-only, RLS members-only
read, append-only; no content/secret/config stored (tested); audit emitted at the seam on all
outcomes, fail-open; cost stays in `ai_cost_events` and is linked, not duplicated; boundary
import guard stays green.

## 13. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, schema, UI, or env changes. No `db:push`. No new table created. No
deploy / push. Only this planning doc was written.

## 14. Recommended next step

Get Marcus's call on **OQ-1**. If approved, pick up **CS-5b** (create
`react_agent_audit_events`, dev-DB `db:push` only) followed by CS-5c/5d. Hold all
`proposes_change` capability wiring (repair proposal) until the audit seam (CS-5d) is in place,
so the first change-proposing capability is audited from its first invocation.
