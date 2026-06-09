# Plan-Enforcement & Task-Period Re-Audit (billing)

**Type:** Read-only audit / findings. **No source, migration, test, or UI changes. Nothing pushed.**
**Date:** 2026-06-08
**Branch:** `builder-ui-v1-audit-1`
**Why:** The V2 replacement-readiness audit listed "plan limits not enforced at run-time (only
budget-row)" as a medium billing gap. Before scoping a fix that changes outward-facing run-blocking
behavior, this re-audits every path that sets `account_billing.plan` vs `tasks_limit`.

---

## TL;DR — the audit's framing was wrong (twice)

1. **Plan limits ARE enforced.** The execution billing gate already refuses over-cap runs, and
   `tasks_limit` *is* kept in sync with `plan` by every real write path. There is **no code path that
   produces `plan='pro'` with `tasks_limit=100`.** The "wire the gate to read the plan" fix is
   unnecessary and would risk a regression (double-cap / conflict with the Stripe-set limit).
2. **The real billing gap is elsewhere: `tasks_used` never resets.** There is no period-reset cron and
   the deduct RPC does no rollover, so task caps behave as a **lifetime** limit, not monthly. This is
   the billing item that actually blocks credible live testing.

---

## Method

Traced, read-only, every writer of `account_billing.plan` and/or `account_billing.tasks_limit`, plus
the enforcement path and the period-reset path. Files cited inline.

---

## A. Enforcement path (already correct)

- [executionBillingGate.ts:68-77](../../../../services/billing/executionBillingGate.ts#L68-L77) →
  `deductTasks(accountId, 1)` → RPC refuses when `tasks_used + amount > tasks_limit` → `limit_reached`
  → engine surfaces `BILLING_EXHAUSTED`. (Also gates on account-freeze first; test-mode skips billing.)
- The cap it enforces is `account_billing.tasks_limit` (the RPC body in
  [20260531000001_account_billing_foundation.sql](../../../../supabase/migrations/20260531000001_account_billing_foundation.sql)
  — `UPDATE … SET tasks_used = tasks_used + p_amount WHERE … tasks_used + p_amount <= tasks_limit`).
- `PLAN_LIMITS` ([core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts)): free 100 ·
  **pro 1000** · team 100 · business 100 · enterprise ∞. **Pro is the only tier whose cap ≠ 100.**

## B. Every `plan` / `tasks_limit` write path

| Path | Sets `plan` | Sets `tasks_limit` | Synced? |
|---|---|---|---|
| Column defaults (`20260531000001`) | `'free'` | `100` | ✅ free=100 |
| `initAccountBillingServiceRole` (only caller: `createTeamAccount.ts:56`, passes `defaultPlanForAccountType` → team/business) | team/business | default 100 | ✅ team/business cap=100 |
| `apply_business_upgrade` RPC | `'business'` | `planLimitsFor('business')`=100 | ✅ both |
| `apply_business_downgrade` RPC | `'team'` | `planLimitsFor('team')`=100 | ✅ both |
| Stripe webhook → `applyResolvedPlan` ([stripeBillingWebhook.ts:150-162](../../../../services/billing/stripeBillingWebhook.ts#L150-L162)) | resolved plan | **personal only:** `planLimitsFor(plan)` (Pro→1000) | ✅ personal pairs plan+cap |
| Stripe webhook → `subscription.deleted` (personal) | `'free'` | `planLimitsFor('free')`=100 | ✅ both |
| `applyBillingSubscriptionSyncServiceRole` | only keys present | only keys present | ⚠️ see C |

**Key fact:** Pro (the only cap≠100) is set *exclusively* via the Stripe webhook's `applyResolvedPlan`,
which for personal accounts sets `fields.plan` **and** `fields.tasksLimit` together. A grep for any
`plan='pro'` write **outside** the webhook returns nothing. So the divergence the readiness audit
worried about (`plan='pro'` + `tasks_limit=100`) has **no producing code path today**.

## C. Residual divergence surface (low, theoretical)

The invariant `tasks_limit == PLAN_LIMITS[plan].taskLimit` is maintained **by convention across
paths, not structurally enforced**. Two latent vectors, both benign *today*:

1. `applyBillingSubscriptionSyncServiceRole` writes only the keys present on `fields`. A *future*
   caller that sets `plan` without `tasksLimit` would diverge. (No such caller exists; the webhook is
   the sole plan writer and pairs them for personal.)
2. The webhook sets `plan` but **not** `tasks_limit` for **team/org** accounts (by design — comment
   line 147). Benign now (all team/org caps = 100), but a **future paid-Team tier with cap ≠ 100**
   would silently diverge. This is the one to remember when paid-Team lands.

**Mitigation (cheap, non-behavioral):** a unit/invariant test asserting, for each tier, that the
write paths set `tasks_limit = PLAN_LIMITS[plan].taskLimit`; optionally a reconciliation query. No
gate change. This is defense-in-depth, not a current bug fix.

## D. The real gap — `tasks_used` never resets (period rollover missing)

- The deduct RPC (`deduct_tasks_if_available_v2`,
  [20260531000001](../../../../supabase/migrations/20260531000001_account_billing_foundation.sql))
  **only** does `tasks_used = tasks_used + amount` with a `<= tasks_limit` guard — **no
  `period_started_at` comparison, no reset.**
- The cron inventory (`app/api/cron/`) has **no** period-reset / reset-task-usage route:
  `cleanup-workflow-files`, `poll-triggers`, `purge-anonymized-ledgers`, `purge-pending-deletions`,
  `purge-trashed-workflows`, `release-expired-reservations`, `renew-watch-subscriptions`,
  `run-scheduled-triggers`, `sweep-stale-runs`.
- A repo-wide grep for `tasks_used = 0` / period reset returns nothing.
- `account_billing.period_started_at` exists (`DEFAULT now()`) but **nothing ever reads or advances
  it.** A policy comment notes "a user cannot reset `period_started_at`" — implying a server/cron
  reset was intended but never built in V2 (V1 had a `reset-task-usage` cron).

**Effect:** task caps are a **lifetime** limit. A Free account is `BILLING_EXHAUSTED` permanently after
100 total runs (ever); a Pro account after 1000 — no monthly recovery. This will surface immediately
in live testing (every test run consumes the lifetime quota and never returns).

**Severity:** this is the genuine billing blocker for live testing — higher priority than the
mis-framed "plan-enforcement" item.

---

## E. Recommendation

1. **Drop / reclassify the "plan-enforcement" item.** The gate already enforces a plan-synced cap;
   no gate change is warranted. At most, add the **invariant test** from §C (cheap, non-behavioral).
2. **Make the next billing slice "task-period reset."** Two viable shapes (pick when scoping):
   - **(a) Lazy rollover in the deduct/reserve RPCs** — when `now() >= period_started_at + interval
     '1 month'`, reset `tasks_used = 0` (and `tasks_reserved`?) and advance `period_started_at` before
     the cap check. Self-healing, no cron, atomic. Touches the SECURITY DEFINER RPCs (careful) +
     reserve/reconcile parity.
   - **(b) A `reset-task-usage` cron** — daily sweep resetting rows whose period elapsed. Mirrors V1;
     simpler RPC, but adds a cron + a lag window vs lazy reset.
   - Decision needed: monthly anchored to `period_started_at` vs calendar month; whether reset also
     clears `tasks_reserved`; interaction with the (flag-off) reserve/reconcile model.
3. **Update the readiness audit** billing risk row: the "plan limits not enforced" entry is
   inaccurate; replace with "no task-period reset (lifetime caps)."

---

## F. What this audit did NOT change

Read-only. No gate change, no RPC change, no migration, no cron added, no test added. `account_billing`
RLS / grants / Stripe attachment untouched. The reserve/reconcile model (flag `OFF`) was not exercised.
