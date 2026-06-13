# 4.AI-CREDITS-1 — AI Credit Metering + Agent-Runtime Direction (Planning)

**Type:** Planning / design only. **No source, migrations, billing changes, UI, or
pricing changes. Nothing wired. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Owner decision captured (path forward):** ChainReact meters AI usage with **AI
credits** (a unit distinct from workflow task credits) and uses AI limits as a
reason to upgrade tiers. Deterministic checks are free; AI explanation costs a
little; repair planning more; deep multi-step agent loops are premium. Cheaper
model routing by default, escalate only when needed / on higher tiers. Track AI
cost from day one. A future hosted Hermes-style runtime sits behind an
agent-runtime adapter with OpenAI underneath; ChainReact services remain the
source of truth. MCP stays an external adapter; the in-app React Agent never
depends on MCP internally.

**Source of truth (verified — every file below was read for this plan):**
[supabase/migrations/20260525000001_ai_cost_events.sql](../../../supabase/migrations/20260525000001_ai_cost_events.sql) ·
[supabase/migrations/20260531000005_ledger_account_rescope.sql](../../../supabase/migrations/20260531000005_ledger_account_rescope.sql) (adds `account_id` + RLS) ·
[services/billing/aiCostEvents.ts](../../../services/billing/aiCostEvents.ts) (recorders + metadata sanitizer) ·
[services/ai/events/recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts) (`recordAiPlanOutcome`/`recordAiApplyOutcome`/`recordAiRepairOutcome`) ·
[services/ai/events/aiCostDebug.ts](../../../services/ai/events/aiCostDebug.ts) (dev cost guard) ·
[repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts) (`insertEvent`/`listByAccount`/`listByWorkflow`) ·
[app/api/ai/usage/route.ts](../../../app/api/ai/usage/route.ts) (account-scoped analytics) ·
[core/ai/models.ts](../../../core/ai/models.ts) (`fast`=haiku, `strong`=sonnet; `FEATURE_DEFAULT_TIER`) ·
[core/ai/modelPricing.ts](../../../core/ai/modelPricing.ts) (`MODEL_PRICING`, `estimateModelCostUsd`) ·
[services/ai/modelClients/createModelClient.ts](../../../services/ai/modelClients/createModelClient.ts) (`createPlannerModelClient`, provider routing flags) ·
[core/billing/planPolicy.ts](../../../core/billing/planPolicy.ts) (`PLAN_TIERS`, `PLAN_LIMITS`) ·
[supabase/migrations/20260531000001_account_billing_foundation.sql](../../../supabase/migrations/20260531000001_account_billing_foundation.sql) (`account_billing` + `deduct_tasks_if_available_v2` + reserve/reconcile family) ·
[supabase/migrations/20260611000000_account_billing_plan_metadata.sql](../../../supabase/migrations/20260611000000_account_billing_plan_metadata.sql) (`plan`/`plan_status`/`current_period_end`) ·
[repositories/accountBilling.ts](../../../repositories/accountBilling.ts) (`deductTasks`/`reserve*`/`getUsage`) ·
[services/billing/executionBillingGate.ts](../../../services/billing/executionBillingGate.ts) (task gate) ·
[docs/rules/database-security.md](../../rules/database-security.md) (RLS + GRANT + SECURITY DEFINER RPC pattern) ·
[docs/slices/phase-4/task-cost-billing-model-audit.md](./task-cost-billing-model-audit.md)

This implements nothing. It is the map; enforcement gets its own slices.

---

## 1. What already exists (Q1) — the foundation is substantial

The AI **cost-event ledger is built and partially wired**. AI-CREDITS-1 mostly
*formalizes + completes + plans enforcement* — it does not start from zero.

| Capability | Status | Where |
|---|---|---|
| `ai_cost_events` table (account-scoped, RLS, GRANTs) | **EXISTS** | `20260525000001` + `20260531000005` |
| — columns: `account_id`, `user_id`, `workflow_id`, `workflow_run_id`, `feature`, `event_type`, `model_name`, `model_provider`, `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost_micros`, **`ai_credits_charged`**, `latency_ms`, `success`, `accepted`, sanitized `metadata` | **EXISTS** | same |
| Recorders + emission for plan / apply / repair | **WIRED** | `aiCostEvents.ts`, `recordAiRouteEvents.ts` (called from the `ai/plan` + `ai/apply` routes) |
| Metadata sanitizer (drops prompt/token/secret/config keys; caps depth/len) | **EXISTS** | `aiCostEvents.ts` `sanitizeAiEventMetadata` |
| Account-scoped usage analytics API | **EXISTS** | `GET /api/ai/usage` (counts/tokens/cost by feature+model; no raw text) |
| Model-tier abstraction (`fast`/`strong`) + per-feature default tier | **EXISTS** | `core/ai/models.ts` (`FEATURE_DEFAULT_TIER`: creation/editing/repair→strong, explanation/run_analysis/discovery→fast) |
| Provider routing (OpenAI planner flag, Anthropic fallback flag, "not configured" client) | **EXISTS (flag-gated, default OFF)** | `createModelClient.ts` |
| Per-model USD pricing + cost estimate | **PARTIAL** | `modelPricing.ts` — **Sonnet only**; OpenAI pricing intentionally absent until confirmed |
| Dev cost guard (per-request console cost + full-catalog warning) | **EXISTS (dev-only, flag-gated)** | `aiCostDebug.ts` |
| Account billing (`account_billing`: `tasks_limit/used/reserved`, `plan`, `plan_status`, `current_period_end`, Stripe ids) + atomic task RPCs (`deduct/reserve/reconcile/release_*_v2`) | **EXISTS** | `20260531000001`, `20260611000000`, `accountBilling.ts` |
| Plan tiers + per-tier limits (`free/pro/team/business/enterprise`, member/folder/task/template limits) | **EXISTS** | `core/billing/planPolicy.ts` |

**Absent (the AI-CREDITS work):** no AI-credit **limits** on `account_billing`; no
per-feature **credit-charge policy** (how many credits a feature costs); no
**deduction/gating** for AI; `ai_credits_charged` column exists but is **not
populated by a policy** today; the **deterministic diagnosis path (DIAG-1/1b)
records no event**; OpenAI pricing missing; no "fallback/escalation used" queryable
signal (only ad-hoc metadata).

---

## 2. Separate dimension vs task credits? (Q2)

**Recommendation: AI credits are a SEPARATE usage dimension from workflow tasks**,
tracked on `account_billing` (new columns) and metered through the existing
`ai_cost_events.ai_credits_charged` ledger — mirroring the task model's
deduct/reserve/reconcile shape for consistency, but never sharing the same pool.

Why separate, not merged into task credits:
- The schema **already** separates them — a distinct `ai_credits_charged` column on
  a distinct `ai_cost_events` table, explicitly commented "distinct unit from
  workflow tasks."
- The cost curves differ fundamentally: tasks are **per-action** (1/run today),
  AI is **token-priced** and model-tier-dependent. Merging conflates two economic
  models and muddies upgrade messaging ("you're out of AI credits" vs "out of run
  tasks" are different upgrade triggers).
- Keeps the live task billing gate ([executionBillingGate.ts](../../../services/billing/executionBillingGate.ts))
  untouched — AI gating is a parallel, independent gate.

---

## 3. Credit model per feature (Q3)

A single versioned policy module — `core/billing/aiCreditPolicy.ts` — mirroring
`core/billing/planPolicy.ts` + `services/billing/taskCostPolicy.ts`. Credits are a
**product unit**, deliberately decoupled from raw provider USD cost (so a provider
price change doesn't change what users pay in credits; internal margin is tracked
separately via `estimated_cost_micros`). Charge = `featureBaseCredits ×
modelTierMultiplier`, recorded per LLM call in `ai_credits_charged` with a
`credit_policy_version`.

| Feature | LLM? | Recommended base (tunable placeholder) |
|---|---|---|
| Deterministic diagnosis (`services/diagnostics/*`, DIAG-1/1b) | **No** | **0 credits** — free. Emit a 0-credit observability event (or sample) but NEVER deduct. |
| AI explanation (single `fast` call) | Yes | **1 credit** |
| Repair planning (single `strong` plan) | Yes | **3–5 credits** |
| Deep multi-step repair / agent loop | Yes | **premium** — metered **per model call** inside the loop, hard-capped (e.g. ≥10, reserve→reconcile) |
| Premium model escalation/fallback | Yes | a **multiplier** on the above (escalation to `strong` / a premium model costs proportionally more) |

The numbers are placeholders for the owner to finalize; the plan locks the
**shape**: per-feature base × tier multiplier, versioned, recorded per call,
deterministic-checks-free.

---

## 4. Tier split (Q4)

Extend `PlanLimits` with `aiCreditsMonthlyLimit: number | null` (null = custom).
Team/org accounts share **one account-level pool** (consistent with the
account-scoped billing model). Numbers below are **placeholders** for owner
pricing — the plan stores the shape, not final pricing.

| Tier | AI credits (monthly, placeholder) | AI capability |
|---|---|---|
| **Free** | tiny (~20) | deterministic checks free; a few explanations; **no repair** |
| **Pro** | ~500 | normal building, explanations, light repair |
| **Team** | shared ~2,000 | diagnosis + repair **suggestions** |
| **Business** | ~10,000 | advanced repair planning, memory-backed agent, stronger routing |
| **Enterprise** | `null` (custom) | custom limits + retention/memory controls + admin controls + possible dedicated runtime |

---

## 5. Tables / RPCs / services likely needed later (Q5)

All **additive**; reuse existing patterns. None in this slice.

- **Migration (later):** `ALTER TABLE account_billing ADD ai_credits_limit int NOT
  NULL DEFAULT <policy>`, `ai_credits_used int NOT NULL DEFAULT 0`,
  `ai_credits_reserved int NOT NULL DEFAULT 0` — reset aligned to the existing
  `period_started_at`. (Existing-table ALTER; the new-table GRANT/RLS rule does not
  re-apply, but follow `docs/rules/database-security.md` for any new RPC.)
- **RPCs (later, SECURITY DEFINER, service-role only):**
  `deduct_ai_credits_if_available_v2(account_id, amount)` and — for loops where
  token count is unknown upfront — `reserve_ai_credits_*` / `reconcile_ai_credit_*`
  mirroring the task family in `20260531000001`.
- **Repository:** `accountBilling.ts` += `deductAiCredits`, `getAiCreditUsage`
  (parallel to `deductTasks`/`getUsage`).
- **Policy:** `core/billing/aiCreditPolicy.ts` (per-feature base + tier multiplier +
  version) — pure + tested.
- **Gate:** `services/billing/aiCreditGate.ts` (parallel to `executionBillingGate`)
  → `{ ok } | { ok:false, reason:"insufficient_ai_credits" | "account_frozen" }`.
- **planPolicy.ts:** add `aiCreditsMonthlyLimit` per tier.
- **Already exist (no new build):** the `ai_cost_events` ledger, recorders,
  sanitizer, usage API, model routing/pricing scaffolding.

---

## 6. What to log for every LLM call (Q6)

The owner's required fields map almost entirely onto existing columns:

| Owner field | Ledger column | Status |
|---|---|---|
| account_id | `account_id` | ✅ |
| user_id | `user_id` | ✅ |
| workflow_id (when applicable) | `workflow_id` (+ `workflow_run_id`) | ✅ |
| feature type | `feature` (CHECK-constrained enum) | ✅ |
| model | `model_name` + `model_provider` | ✅ |
| input tokens | `input_tokens` | ✅ |
| output tokens | `output_tokens` (+ `total_tokens`) | ✅ |
| estimated cost | `estimated_cost_micros` (USD millionths) | ✅ (but null for unpriced models — see Q1) |
| credit charge | `ai_credits_charged` | ✅ column exists; **not yet populated by policy** |
| success/failure | `success` (tri-state) | ✅ |
| fallback/escalation used | — | ❌ **gap** — only ad-hoc metadata today |

**Two recording gaps to close:** (a) populate `ai_credits_charged` from
`aiCreditPolicy`; (b) a **queryable fallback/escalation signal**. Recommendation:
standardize a `metadata.escalation` shape first (no migration), and promote to a
dedicated `fallback_used boolean` + `escalation_reason text` column only when
analytics demand it. Keep the sanitizer in front of all metadata.

---

## 7. Hosted Hermes later, without changing the billing model (Q7)

Introduce an **`AgentRuntimeAdapter` port** (interface) with two implementations:
`OpenAiDirectRuntime` (near-term) and `HermesRuntime` (future). Billing is keyed on
**the underlying LLM calls' token usage + feature**, not on which runtime
orchestrated — so swapping runtimes changes nothing in the credit model **provided
the adapter surfaces per-call token usage** to the existing recorder. Invariants:

- Every underlying OpenAI call the runtime makes still emits an `ai_cost_event` and
  charges credits via the same policy.
- Hermes/memory aids **orchestration + context**, but **ChainReact services remain
  the source of truth** — readiness/connection/run facts come from
  `services/diagnostics/*`, never from agent memory.
- MCP stays external; the in-app agent calls services directly (per AI-DIAG-1).
- Enterprise "custom retention/memory controls" is a Hermes-era concern, out of
  scope now.

---

## 8. Model routing later (Q8)

Already scaffolded (`createPlannerModelClient`, `FEATURE_DEFAULT_TIER`, provider
flags). Policy to formalize: **cheap by default** (`fast` / haiku or
gpt-4.1-mini), **escalate to `strong`/premium** on validation failure, low
confidence, or higher tier entitlement. The **credit charge reflects the tier
actually used** (escalation → higher multiplier), and the routing decision (tier +
escalation reason) is recorded on the event so analytics can attribute escalation
cost. Routing stays in the model-client factory; `aiCreditPolicy` reads the
resolved tier from the recorded call.

---

## 9. Enforce before any LLM repair loop ships (Q9)

Hard gates that MUST precede shipping any multi-step / repair loop:

1. **Complete cost-event coverage** — every LLM/agent call records a full
   `ai_cost_event` (tokens, model, feature, success, `ai_credits_charged`,
   escalation). No silent model calls.
2. **Credit gate in front of the loop** — check available credits BEFORE starting;
   **reserve** an estimate; **reconcile** actual after; refuse with a typed
   `insufficient_ai_credits` → "upgrade" outcome when exhausted.
3. **Per-loop hard cap** on model calls / credits (runaway protection), mirroring
   the workflow loop cap.
4. **Tier-gated escalation** — premium models only for entitled tiers.
5. **OpenAI pricing populated** so `estimated_cost_micros` isn't null for the
   default planner model (margin visibility).
6. **No-leak preserved** — the existing metadata sanitizer stays in front of every
   recorder; no prompt/output/secret ever enters the ledger.

---

## 10. Smallest first implementation slice after this plan (Q10)

**AI-CREDITS-2 — "Track AI cost completely, recording-only. No enforcement, no
migration."** This makes *"track AI cost from the beginning"* true before any loop
or gate ships, and is fully reversible:

- Add `core/billing/aiCreditPolicy.ts` (per-feature base credits × tier multiplier +
  `AI_CREDIT_POLICY_VERSION`) — pure + table-tested.
- Populate `ai_credits_charged` + a standardized `metadata.escalation` on every
  existing recorder path (plan / apply / repair).
- Emit a **0-credit** observability event for the deterministic diagnosis path
  (DIAG-1/1b) — records usage, never deducts (or sample if volume is a concern).
- Add **OpenAI model pricing** to `modelPricing.ts` (once the owner confirms the
  numbers) so `estimated_cost_micros` is populated for the default planner.

**Explicitly NOT in AI-CREDITS-2:** no `account_billing` columns, no RPC, no gate,
no enforcement, **no migration**, no UI, no pricing flip. Enforcement
(limits + RPC + `aiCreditGate` + migration, flag-gated) is **AI-CREDITS-3**, and it
must land before any repair loop (Q9).

---

## 11. Docs / project-memory to update now (Q11)

- **This doc** (`ai-credits-and-agent-runtime-plan.md`) — the captured direction.
- **`docs/PROJECT_MEMORY.md`** — one durable-decision entry (AI credits = separate
  dimension, tier-gated, cheap-by-default routing, Hermes-behind-adapter,
  MCP-external) + the AI-CREDITS open thread. *(This slice does that.)*
- Cross-link from [task-cost-billing-model-audit.md](./task-cost-billing-model-audit.md)
  is **optional** and deferred — that doc is in the actively-edited billing track;
  this plan links INTO it instead, avoiding a parallel-work edit.

---

## 12. Risks / open questions (Q12)

- **OQ-1 — final credit numbers + tier limits are owner pricing decisions.** The
  plan stores the shape; numbers are placeholders.
- **OQ-2 — credit ↔ cost relationship.** Recommend credits = a stable product unit
  (per-feature × tier), with `estimated_cost_micros` as the internal economic truth;
  reconcile margin in analytics. Decide the conversion explicitly before pricing.
- **OQ-3 — period reset.** AI-credit reset must align to the billing period
  (`account_billing.period_started_at`). **Unverified:** whether V2 has a
  period-reset cron today — confirm in AI-CREDITS-3 planning; if absent, it's a
  prerequisite.
- **OQ-4 — shared team-pool concurrency.** Atomic deduction (RPC `FOR UPDATE`) like
  the task RPCs; no in-app read-modify-write.
- **OQ-5 — reserve/reconcile for loops.** Token count is unknown upfront → reserve an
  estimate, reconcile actual (mirror task reserve/reconcile).
- **OQ-6 — free-tier abuse.** Deterministic checks are free but spammable →
  rate-limit the diagnosis endpoint even at 0 credits.
- **OQ-7 — 0-credit event volume.** A ledger row per deterministic check adds
  volume; decide record-all vs sample.
- **OQ-8 — OpenAI pricing confirmation.** `modelPricing.ts` deliberately omits
  OpenAI numbers "until confirmed" — confirm before populating.
- **OQ-9 — Hermes data residency / retention** (enterprise memory controls) — out of
  scope now; revisit at the Hermes-runtime slice.

---

## 13. Acceptance criteria (this planning slice)

This doc exists under `docs/slices/phase-4/`, every current-state claim ties to a
file that was read, PROJECT_MEMORY captures the owner decision, no source / test /
migration / billing / pricing / UI changed, nothing pushed. The tool/table/RPC/tier
proposals are **proposals** for the named future slices (AI-CREDITS-2 recording,
AI-CREDITS-3 enforcement).

## 14. Recommended next step

Pick up **AI-CREDITS-2** (recording-only, no migration): author `aiCreditPolicy.ts`
+ populate `ai_credits_charged` on the existing recorders + the 0-credit diagnosis
event. Do **not** start AI-CREDITS-3 (limits/RPC/gate/migration) or any repair loop
until AI-CREDITS-2 lands and OpenAI pricing is confirmed.
