# 4.AI-CREDITS-3 — AI Credit Enforcement (Planning)

**Type:** Planning / design only. **No source, migrations, RPCs, billing changes,
pricing, or UI. Nothing wired. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Goal:** plan the enforcement layer that moves AI credits from recording-only
(AI-CREDITS-2, shipped `7dfaa7d45`) to a **billable usage dimension** with
limits / gate / (later) reserve+reconcile — **before** any paid LLM repair or
deep-loop feature ships. Enforcement lands **flag-OFF**; flipping it on is the
owner's pricing decision.

**Source of truth (verified — every file below was read):**
[supabase/migrations/20260531000001_account_billing_foundation.sql](../../../supabase/migrations/20260531000001_account_billing_foundation.sql) (table + 5 task RPCs) ·
[supabase/migrations/20260531000004_account_billing_canonical_cleanup.sql](../../../supabase/migrations/20260531000004_account_billing_canonical_cleanup.sql) (RPC rename) ·
[supabase/migrations/20260611000000_account_billing_plan_metadata.sql](../../../supabase/migrations/20260611000000_account_billing_plan_metadata.sql) ·
[supabase/migrations/20260620000000_lazy_task_period_rollover.sql](../../../supabase/migrations/20260620000000_lazy_task_period_rollover.sql) (`account_billing_period_start`, lazy reset) ·
[repositories/accountBilling.ts](../../../repositories/accountBilling.ts) ·
[services/billing/executionBillingGate.ts](../../../services/billing/executionBillingGate.ts) (fail-closed gate) ·
[services/billing/reserveReconcileBilling.ts](../../../services/billing/reserveReconcileBilling.ts) + [app/api/cron/release-expired-reservations/route.ts](../../../app/api/cron/release-expired-reservations/route.ts) ·
[core/billing/planPolicy.ts](../../../core/billing/planPolicy.ts) (`PlanLimits`) ·
[core/billing/aiCreditPolicy.ts](../../../core/billing/aiCreditPolicy.ts) (AI-CREDITS-2 `computeAiCreditCharge`) ·
[services/ai/events/recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts) (records `ai_credits_charged`) ·
[repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts) (`ai_cost_events`) ·
[docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md](./ai-credits-and-agent-runtime-plan.md)

The guiding principle: **mirror the task-credit machinery exactly**, with AI
counters on the same `account_billing` row, and **do not touch the live task
RPCs**.

---

## 1. Account billing model (Q1)

**Put AI counters on `account_billing` (same row), NOT a separate table.** They are
per-account scalars with the same RLS, the same lazy-rollover home, and benefit
from atomic co-location with the task counters. (A reservation *ledger* is a
separate table — but only when deep loops need it; see Q2/Q11.)

Additive `ALTER TABLE public.account_billing`:

| Column | Type | Default | Mirror of |
|---|---|---|---|
| `ai_credits_limit` | int NOT NULL | per-plan (backfill) | `tasks_limit` |
| `ai_credits_used` | int NOT NULL | 0 | `tasks_used` |
| `ai_credits_reserved` | int NOT NULL `CHECK (>= 0)` | 0 | `tasks_reserved` |
| `ai_credits_period_started_at` | timestamptz NOT NULL | `now()` | `period_started_at` |

**Reset-period field: yes — a SEPARATE AI anchor** (`ai_credits_period_started_at`).
Rationale: the live task RPCs embed their own lazy rollover keyed on
`period_started_at` ([20260620000000](../../../supabase/migrations/20260620000000_lazy_task_period_rollover.sql));
a separate AI anchor lets the new AI RPC self-heal its period **without editing the
production task RPCs** (a deliberate blast-radius reduction). Both anchors default
to account creation, so in practice they stay aligned. The existing IMMUTABLE
`account_billing_period_start(anchor, now)` is **reused unchanged**. See Q6.

`available_ai_credits = ai_credits_limit − ai_credits_used − ai_credits_reserved`
(identical algebra to tasks).

---

## 2. RPC / service shape (Q2)

**Yes — mirror tasks**, but stage it. The task family is `deduct` (flat) +
`reserve`/`reconcile`/`release`/`release_expired` (reserve path, flag-gated). AI
needs the same eventually, but the **first paid features (explanation, repair) are
single-call**, so the first slice ships **deduct-only**; reserve/reconcile arrives
with deep loops.

Proposed RPCs (SECURITY DEFINER, service-role only, `REVOKE ALL … FROM public,
anon, authenticated` + `GRANT EXECUTE … TO service_role` — the established pattern):

| RPC | Slice | Predicate / behavior |
|---|---|---|
| **`deduct_ai_credits_if_available(p_account_id uuid, p_amount int)`** → `{ok, used, limit}` | **AI-CREDITS-3** | lazy AI rollover first; then `ai_credits_used + p_amount <= ai_credits_limit` (flat — mirrors `deduct_tasks_if_available`). `p_amount = 0` is a valid no-op (deterministic 0-credit calls never block). |
| `reserve_ai_credits_if_available(p_account_id, p_amount, p_reservation_id uuid, p_expires_at)` → `{ok, reason, used, reserved, limit, amount}` | **AI-CREDITS-4 (deep loops)** | `ai_credits_used + ai_credits_reserved + p_amount <= ai_credits_limit`. Needs a reservation home (below). |
| `reconcile_ai_credit_reservation(p_account_id, p_reservation_id, p_actual)` → `{ok, charged, refunded, …}` | AI-CREDITS-4 | `charge = LEAST(actual, reserved)`, refund rest, clamp `GREATEST(0, …)`. |
| `release_ai_credit_reservation` / `release_expired_ai_credit_reservations` | AI-CREDITS-4 | release + janitor sweep (cron, not flag-gated). |

**Reservation home (the one place AI ≠ tasks):** task reservations store
`reserved_task_cost`/`reservation_expires_at`/`billing_status` **on `workflow_runs`**.
AI multi-step loops have **no equivalent row** today. So the reserve path needs a
small **`ai_credit_reservations(id, account_id, amount, status, expires_at,
created_at)`** ledger — **deferred to AI-CREDITS-4** with the deep-loop feature. The
first slice avoids it entirely.

**Service:** **`services/billing/aiCreditGate.ts`** — `aiCreditGate(input)` mirroring
`executionBillingGate`:

```
aiCreditGate({ accountId, feature, plannedTier, testMode?, escalated? }):
  Promise<AiCreditGateOutcome>
AiCreditGateOutcome =
  | { ok: true; charged: number; used: number; limit: number }
  | { ok: true; skipped: true; reason: "test_mode" | "enforcement_disabled" | "zero_credit" }
  | { ok: false; reason: "insufficient_ai_credits"; used: number; limit: number }
  | { ok: false; reason: "account_frozen"; used: number; limit: number }
```

The gate computes the charge via the AI-CREDITS-2 `computeAiCreditCharge({feature,
isLlmCall:true, modelTier:plannedTier, escalated})`, then deducts it. **Deterministic
(0-credit) work never calls the gate** (it's free; it stays recording-only).

---

## 3. Enforcement flow (Q3)

For a single-call paid feature (first slice):

1. **Gate before the LLM call** — `aiCreditGate({accountId, feature, plannedTier})`.
   - flag OFF → `skipped: enforcement_disabled` (today's behavior, no DB write).
   - frozen → `account_frozen` (checked FIRST, like the task gate).
   - test mode → `skipped: test_mode` (never charged).
   - `charge === 0` → `skipped: zero_credit` (never blocks).
   - else `deduct_ai_credits_if_available(accountId, charge)` →
     `insufficient_ai_credits` (with a typed "upgrade" outcome) when over limit.
2. **Make the model call** only when the gate returned `ok`.
3. **Record actual** credits + cost — **unchanged from AI-CREDITS-2** (the recorder
   already writes `ai_credits_charged` + `estimated_cost_micros` per call).
4. **Reconcile** (reserve path, AI-CREDITS-4 only) — for variable-cost loops, reserve
   an estimate up front, reconcile actual after, refund the difference.

**Fail policy (owner-confirmed):**
- **Credit GATE errors → FAIL-CLOSED.** An RPC throw / unexpected error → refuse the
  LLM call (mirrors `executionBillingGate`, which lets a deduct error propagate as a
  refusal). A user is never given paid AI work we couldn't meter.
- **RECORDING errors → FAIL-OPEN.** Post-call telemetry (AI-CREDITS-2) never breaks
  the response (already true).

Single-call deduct-only has a known, bounded drift: if escalation makes *actual* >
*pre-deducted estimate*, `account_billing` under-counts while `ai_cost_events` holds
the truth. For non-escalating single calls estimate == actual (no drift). Variable
calls use reserve/reconcile (AI-CREDITS-4). See Q7.

---

## 4. Tier policy (Q4)

Extend `PlanLimits` with **`aiCreditsMonthlyLimit: number | null`** (null =
uncapped/config = enterprise), plus `aiCreditsMonthlyLimitFor(plan)` — same shape as
`taskLimit`/`templateLimit`. **Placeholder numbers** (owner sets final pricing):

| Tier | `aiCreditsMonthlyLimit` (placeholder) | Pool behavior |
|---|---|---|
| free | 20 | personal, single user |
| pro | 500 | personal, single user |
| team | 2,000 | **shared account pool** (any member draws from the one `account_billing` row) |
| business | 10,000 | shared account pool |
| enterprise | `null` | custom (set on `ai_credits_limit` directly) |

**Shared-pool behavior** is automatic: `account_billing` is keyed by `account_id`, so
every member's AI usage deducts from the same row (atomic via the RPC's row lock) —
identical to how task credits already pool. **Per-user sublimits inside a team/biz
account are NOT modeled** (OQ-4). Enterprise = set `ai_credits_limit` to a custom
value; `null` policy limit means "don't overwrite the DB value on plan sync."

The authoritative limit is **`account_billing.ai_credits_limit`** (like `tasks_limit`);
`planPolicy.aiCreditsMonthlyLimit` is the **single source of the number** that the
backfill + plan-activation paths stamp onto the column (mirrors the Pro task-cap
pattern in `planPolicy.ts`).

---

## 5. Backward compatibility (Q5)

- **Backfill existing `account_billing` rows:** the ALTER adds the columns with
  `ai_credits_used=0`, `ai_credits_reserved=0`, `ai_credits_period_started_at=now()`.
  `ai_credits_limit` is then set by a **one-time backfill UPDATE keyed on the existing
  `plan` column** (hardcoding the per-plan AI numbers in the migration SQL to match
  `planPolicy` — exactly how task limits are seeded). New accounts:
  `initAccountBillingServiceRole(accountId, plan)` also stamps `ai_credits_limit`.
- **Existing `ai_cost_events` rows:** they are **recording-only history** —
  **do NOT count toward the current period's `ai_credits_used`.** Enforcement starts
  fresh at flag-on; `ai_credits_used` begins at 0 for everyone. Historical events stay
  for analytics / ROI only.
- **Historical usage vs current period:** explicitly **NOT** retroactively charged.
  Pre-enforcement usage was free by definition.

---

## 6. Reset behavior (Q6)

- **Confirmed: a reset mechanism EXISTS — lazy in-RPC rollover, no cron**
  ([20260620000000](../../../supabase/migrations/20260620000000_lazy_task_period_rollover.sql)).
  `deduct_tasks_if_available` / `reserve_tasks_if_available` compute
  `account_billing_period_start(period_started_at, now())` under a row lock and reset
  `tasks_used=0, tasks_reserved=0, period_started_at=new_start` when the month
  advances. **`tasks_limit` is never touched** (custom/Stripe caps survive).
- **AI credits reset the SAME way, on the SEPARATE AI anchor:**
  `deduct_ai_credits_if_available` runs its own lazy rollover via
  `account_billing_period_start(ai_credits_period_started_at, now())`, resetting
  `ai_credits_used=0, ai_credits_reserved=0` and advancing the AI anchor. **No new
  cron; the live task RPCs are untouched.** Reusing the existing IMMUTABLE anchor
  function keeps the month math identical.
- **Why a separate anchor, not a unified reset:** if AI reset were folded into the
  *task* RPCs, the "first RPC of the new period resets only its own counters" hazard
  appears (a task deduct advances the shared anchor before any AI deduct runs, so AI
  never resets). A separate AI anchor sidesteps that entirely and isolates risk from
  production task billing. (OQ-5 if the owner later wants a single unified period.)

---

## 7. Model routing + escalation (Q7)

- **Cheap default vs premium fallback:** the gate's `plannedTier` is the cheap default
  (e.g. `fast`). For a **single call**, deduct the cheap estimate.
- **Escalation charge:** `computeAiCreditCharge` already applies a tier multiplier
  (`strong=2×`) + an `escalated` multiplier (AI-CREDITS-2). When a call escalates, the
  *recorded* `ai_credits_charged` reflects the higher tier — and, on the **reserve
  path** (AI-CREDITS-4), reconcile charges the actual (escalated) amount, refunding the
  unused reservation. In deduct-only mode, escalation is bounded drift (Q3).
- **Prevent unlimited fallback loops:** a **hard per-interaction cap** (max model
  calls / max credits per loop), enforced in the loop orchestrator AND backed by the
  reservation ceiling (a loop can't reserve beyond `available_ai_credits`). This is a
  hard prerequisite for any deep-loop feature (carried from the AI-CREDITS-1 plan §9).

---

## 8. Product gates (Q8)

| Feature | `ai_cost_events.feature` | Credits | Gate? |
|---|---|---|---|
| Deterministic workflow check (diagnosis) | `other` | **0** | **No gate** — free, recording-only (already shipped). |
| AI explanation | `workflow_explanation` | 1 (×tier) | **Gate before call** (when shipped). |
| Repair planning | `workflow_repair` | 4 (×tier) | **Gate before call** (when repair becomes an LLM call). |
| Deep multi-step repair / agent loop | (repair) | premium, per-call | **Reserve + reconcile + hard cap** (AI-CREDITS-4). |
| Workflow creation/editing (the planner) | `workflow_creation`/`editing` | 2 (×tier) | **Gate, flag-OFF** — turning it on is a **pricing decision** (gating the core builder), the owner's call. |

**Free users limited by** their small `ai_credits_limit` (placeholder 20/mo): a few
explanations, **no repair** (repair charge exceeds a near-empty Free balance quickly),
deterministic checks always free. Free abuse of the 0-credit deterministic check is a
**rate-limit** concern, not a credit one (OQ-3).

---

## 9. Observability (Q9)

- **Usage API:** extend `AccountBillingUsage` (`repositories/accountBilling.ts`
  `getUsage`) with `aiCreditsUsed / aiCreditsLimit / aiCreditsRemaining /
  aiCreditsPeriodStartedAt`, surfaced through the existing account billing/usage
  endpoint. `GET /api/ai/usage` already sums `ai_credits_charged` per feature/model —
  add the **remaining-balance** view alongside the spend view.
- **Admin/debug:** the admin billing view already reads `account_billing`; add the AI
  columns. The dev cost guard (`aiCostDebug`) can log the gate decision.
- **Attribution:** already account/user/workflow on `ai_cost_events` (AI-CREDITS-2). No
  change.
- **ROI:** `ai_cost_events` carries `estimated_cost_micros` (internal cost) **and**
  `ai_credits_charged` (product unit) → margin per account/feature is a pure roll-up
  (the existing `summarizeAiCostEvents` already totals both). The credit↔dollar
  price (OQ in the AI-CREDITS-1 plan) closes the ROI loop.

---

## 10. Safety (Q10)

- **No token/config/provider metadata in billing rows:** `account_billing` holds only
  integers + timestamps + plan enums — no free text. `ai_cost_events` metadata is
  already sanitized (key denylist + caps). The gate writes **counts only**.
- **No cross-account leakage:** RLS on `account_billing` is membership-gated (SELECT
  by `account_memberships` join); all AI RPCs are **service-role-only, account-keyed,
  atomic** (row lock) — a member can never deduct another account's pool, and the
  gate resolves the cost-owner account server-side (never client-supplied).
- **Service-role / RLS:** new RPCs follow the established `REVOKE ALL FROM public,
  anon, authenticated` + `GRANT EXECUTE TO service_role` + `SECURITY DEFINER SET
  search_path = public` pattern. No client write path; reads stay RLS-gated.
- **Tests required:** gate fail-closed on RPC error; atomic deduction race (two
  concurrent deducts can't exceed the limit); lazy AI rollover resets used/reserved at
  the month boundary without touching the limit; backfill stamps per-plan limits;
  `charge=0` never blocks; frozen→refuse; test-mode→skip; flag-OFF→skip; no-leak (no
  text in billing rows); structural-auth + RLS coverage for any new route.

---

## 11. Smallest first implementation slice (Q11)

**AI-CREDITS-3 = deduct-only enforcement infra, flag-OFF, NOT yet wired to a live
route.** Smallest set that makes AI credits enforceable without touching the live
planner or building a reservation ledger:

1. **Migration (one, additive):** `ALTER account_billing ADD ai_credits_limit / used /
   reserved / ai_credits_period_started_at` + CHECK(`reserved >= 0`) + per-plan
   backfill UPDATE + **`deduct_ai_credits_if_available` RPC** (with lazy AI rollover) +
   REVOKE/GRANT. **No reservation table, no reconcile RPC.** *(Migration authored but
   `db:push` only on explicit approval.)*
2. **Repo:** `accountBilling.ts` += `deductAiCredits(accountId, amount)` + extend
   `getUsage` with the AI fields.
3. **Service:** `services/billing/aiCreditGate.ts` — `aiCreditGate(...)` (compute
   charge → frozen/test/flag/zero short-circuits → deduct → typed outcome), fail-closed.
4. **Policy:** `planPolicy.ts` += `aiCreditsMonthlyLimit` per tier + helper;
   `initAccountBillingServiceRole` stamps `ai_credits_limit` from the plan.
5. **Flag:** `ENABLE_AI_CREDIT_ENFORCEMENT` (default **OFF**) — gate returns
   `skipped: enforcement_disabled` until flipped.
6. **Tests:** RPC/repo (deduct, rollover, race), gate (all outcomes, fail-closed),
   policy (limits), backfill, no-leak.
7. **NOT in slice 1:** wiring the gate into a live route, reserve/reconcile, the
   `ai_credit_reservations` table, deep loops, UI, pricing flip, OpenAI pricing.

**Then:** AI-CREDITS-3b wires the gate into the first paid feature (behind the flag);
AI-CREDITS-4 adds reserve/reconcile + the reservation ledger + the deep-loop cap.

---

## 12. Open questions (owner decisions) (Q12)

- **OQ-1 — actual monthly credit amounts** per tier (placeholders above).
- **OQ-2 — confirmed OpenAI pricing** (still absent; blocks `estimated_cost_micros`
  for the default planner, not credits).
- **OQ-3 — deterministic 0-credit abuse controls:** should the free deterministic
  check have a **separate rate-limit** (it never costs credits but does cost compute)?
  *Recommendation: yes, a lightweight per-account/min rate-limit, separate from credits.*
- **OQ-4 — per-user sublimits inside team/business** accounts (shared pool today).
  *Recommendation: defer; ship the shared pool first, add sublimits only on demand.*
- **OQ-5 — unified vs separate task/AI period anchor.** *Recommendation: separate AI
  anchor (this plan) to avoid editing live task RPCs; unify later only if needed.*
- **OQ-6 — does gating the core planner (`workflow_creation`) at flag-on match the
  pricing intent**, or should creation stay free and only explanation/repair/loops
  cost credits? *Pricing decision — owner.*
- **OQ-7 — credit ↔ dollar price** (for ROI + overage), carried from AI-CREDITS-1.

---

## 13. Proposed files (when AI-CREDITS-3 is approved)

| File | Change |
|---|---|
| `supabase/migrations/<ts>_account_billing_ai_credits.sql` | **new** — AI columns + backfill + `deduct_ai_credits_if_available` + grants |
| `repositories/accountBilling.ts` | + `deductAiCredits`; extend `getUsage`/`AccountBillingUsage`; stamp `ai_credits_limit` in `initAccountBillingServiceRole` |
| `services/billing/aiCreditGate.ts` | **new** — the gate |
| `core/billing/planPolicy.ts` | + `aiCreditsMonthlyLimit` + helper |
| `lib/featureFlags*` / env | + `ENABLE_AI_CREDIT_ENFORCEMENT` (default OFF) |
| `tests/unit/...` | RPC/repo, gate, policy, backfill, no-leak |

No route/UI wiring, no reservation table, no reconcile in slice 1.

---

## 14. Acceptance criteria (this planning slice)

This doc exists under `docs/slices/phase-4/`, every current-state claim ties to a
read file, no source/migration/billing/pricing/UI changed, nothing pushed. The
schema/RPC/tier proposals are **proposals** for AI-CREDITS-3 (deduct-only,
flag-OFF) and AI-CREDITS-4 (reserve/reconcile + deep loops).

## 15. Recommended next step

On approval, implement **AI-CREDITS-3 slice 1** (Q11): the additive migration + RPC +
`accountBilling` repo helpers + `aiCreditGate` + `planPolicy` limits + flag-OFF +
tests — **not wired to a live route**. Hold the migration `db:push` for explicit
approval. Do not start reserve/reconcile, deep loops, or any pricing flip until the
owner answers OQ-1/OQ-6/OQ-7.
