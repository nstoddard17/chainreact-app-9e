# 4.ACCOUNT-BILLING-LIFECYCLE-1 — Cancel vs. Delete Billing Lifecycle Closeout

> **Type:** Implementation closeout (code + tests + docs).
> **Repo/branch:** ChainReactV2 @ `v2-main` (local only — not pushed).
> **Migrations:** **none** (the audit proved none was necessary — see §8).
> **Status:** Shipped locally. Two pre-existing operational gaps remain — see §9.

This is the single page describing what happens when a user **cancels their plan** versus
**deletes their account**, and who is authoritative for what. It supersedes the "Payment /
Stripe retention expansion — no payment data exists today" note in
[`account-deletion-flow-closeout.md`](../account-model/account-deletion-flow-closeout.md),
which predates platform billing.

---

## 1. The problem this slice fixed

Before this slice, **account deletion never touched Stripe.** `requestAccountDeletion`
froze the account and `purgeAccount` deleted `account_billing` (and with it
`stripe_subscription_id`) — but no Stripe call was ever made. A paying user could delete
their account, be told it succeeded, and keep being charged forever, with ChainReact having
destroyed the only handle to the subscription.

Secondarily, the only in-app cancellation was **personal-Pro-only**
(`setPersonalCancelAtPeriodEnd`, hard-gated on `account.type === 'personal'`). Team and
Business owners could cancel only through the Stripe-hosted Customer Portal — no effective
date, no pending state, and no cancellation path at all if the portal was not configured.

---

## 2. Final behavior — cancel vs. delete

| | **Cancel subscription** | **Delete account** |
|---|---|---|
| Where | Account Settings → **Plan & billing** | Account Settings → **Danger zone** |
| Account & data | **Kept**, untouched | Frozen now, purged after 30 days |
| Stripe effect | `cancel_at_period_end = true` | Subscription **cancelled immediately** (`DELETE`) |
| Paid access | Continues to the period end | Ends with the subscription |
| Local plan flip | Only when Stripe confirms the subscription ended | Same — via the webhook |
| Reversible | **Yes** — "Keep plan", any time before the date | Deletion yes (30-day grace); **the subscription is not restored** |
| Authorization | Owner (admin read-only) | Own personal account + typed phrase + password |

The two actions are deliberately separate surfaces with separate copy. The deletion
confirmation explicitly points at Cancel subscription for the "I only want to stop paying"
case, and `BillingSection` renders no delete affordance (asserted in
`tests/unit/features/account/BillingSection.test.tsx`).

---

## 3. Source of truth

| Fact | Authority |
|---|---|
| Subscription **status** (active / canceled / past_due …) | **Stripe** |
| `account_billing.plan` / `plan_status` / `cancel_at_period_end` / `current_period_end` | **The CS-4 webhook only** (`services/billing/stripeBillingWebhook.ts`) |
| Which subscription belongs to an account | `account_billing(account_id)` — **never** a user lookup |
| Whether an account may still be purged | **A live Stripe read**, not the local mirror |
| Deletion lifecycle (`pending_deletion` / `purge_after`) | `accounts` + `account_deletions` (unchanged) |
| Why a subscription was cancelled | Stripe subscription metadata `chainreact_canceled_by=account_deletion` |

**Nothing added in this slice writes `plan` or `plan_status`.** Cancelling changes Stripe;
the local downgrade arrives on the subsequent `customer.subscription.*` event. This is why
the UI never optimistically shows "Free".

---

## 4. What shipped

**New**

| File | Role |
|---|---|
| `core/billing/stripeSubscriptionFacts.ts` | Pure Basil-aware period reader + the conservative "is this subscription still live?" rule. Shared by the webhook and the new service. |
| `services/billing/subscriptionCancellation.ts` | **The canonical account-scoped cancellation service.** Read state · schedule at period end · resume · cancel-for-deletion · purge fail-closed check. |
| `app/api/accounts/[id]/billing/subscription/route.ts` | `GET` state · `POST {action:'cancel'\|'resume'}`. |
| `lib/api/subscription.ts` | Typed client (no Stripe ids in the DTO). |
| `features/account/SubscriptionCancelPanel.tsx` | Team/Business cancel + "Keep plan" UI. |

**Changed**

| File | Change |
|---|---|
| `services/billing/platformStripeClient.ts` | Throws `PlatformStripeApiError` carrying HTTP status + Stripe `error.code`, so idempotency branches on the **condition**, not a message string. Message unchanged. |
| `services/billing/personalPlan.ts` | Keeps the personal-only product gate; **delegates all Stripe work** to the canonical service. One cancellation contract in the codebase. |
| `services/billing/stripeBillingWebhook.ts` | Uses the shared period reader (behavior unchanged). |
| `services/accounts/accountDeletion.ts` | Cancels billing on request; returns `billingCancellation`; the already-pending path **retries** the cancel. |
| `services/accounts/accountPurge.ts` | **Fails closed** on a live/unverifiable subscription; adds `reconcilePendingDeletionBilling()`. |
| `repositories/accountPurge.ts` | `listPendingDeletionAccounts()` — the reconciliation worklist (no grace filter). |
| `app/api/account/delete/route.ts` | **502 `BILLING_CANCELLATION_FAILED`** when the freeze committed but Stripe did not. |
| `app/api/cron/purge-pending-deletions/route.ts` | Runs the reconciliation sweep every tick, **ungated**. |
| `features/account/AccountDeletionCard.tsx` | Full consequence list; partial-failure banner + password-gated retry. |
| `features/account/PersonalPlanPanel.tsx` | Copy → "Cancel subscription" / "Keep plan" / "Your account is not deleted". |
| `features/account/BillingSection.tsx` | Renders the cancel panel for Team/Business. |
| `lib/api/accounts.ts` | `BILLING_CANCELLATION_FAILED` code + the frozen `deletionState` that rides with it. |

---

## 5. Effective dates & restoration

- **Cancel:** paid access ends at `current_period_end`, read back from Stripe's own response
  and surfaced as `effectiveAt`. The UI renders it in the confirmation *before* the user
  commits, and again in the "Canceling — access continues until …" status line.
- **Delete:** the subscription ends immediately. Data is recoverable until `purge_after`
  (30 days).
- **Restoration:** cancelling a deletion restores the **data** and returns the account to
  `active`. It performs **no billing action at all** — a personal account comes back on
  **Free** (the `customer.subscription.deleted` webhook already reverted it), and the user
  must deliberately subscribe again. Silently re-creating a charge the user never
  re-authorized would be wrong, and the deletion confirmation says so up front.
- **No refunds / no proration.** There is no refund policy in the product today, so the
  immediate cancellation deliberately does not pass `prorate` and never issues money back on
  its own. Asserted by test.

---

## 6. Failure recovery & reconciliation

Ordering is **freeze first, then cancel Stripe** — the freeze is local, durable, reversible,
and stops the account consuming anything billable; it must not depend on a third party.

| Scenario | What happens |
|---|---|
| **Local freeze OK, Stripe unavailable** | Account IS frozen. Route returns **502 `BILLING_CANCELLATION_FAILED`** carrying the real pending state. The card shows the pending state **and** a retry banner. |
| **Stripe OK, later local write fails** | The subscription is cancelled and the freeze already committed (step 1), so the user is not billed for an unusable account. Only the audit-row insert remains; a repeat request settles it. |
| **User retries** | Re-POSTing the deletion request hits the idempotent already-pending path, which re-attempts the (idempotent) cancel. No second freeze, no duplicate audit row. |
| **User walks away** | `reconcilePendingDeletionBilling()` re-derives its worklist from `deletion_status='pending_deletion'` every cron tick and retries. Nothing is held in memory. |
| **Purge time** | The purge retries the cancel, then **verifies against Stripe**. Live *or* unverifiable → `skipped: renewable_subscription`, **zero** teardown. |

**The reconciliation sweep is intentionally NOT behind `ENABLE_ACCOUNT_PURGE_CRON`.** It is
non-destructive to data — it only cancels billing for accounts the user already asked to
delete. Gating it behind the destructive-purge flag would keep charging departing customers
for as long as that flag stays off (it is off today). It ignores the grace window entirely:
billing must stop now, not in 30 days. Its failures are logged and counted and never fail
the request or block the purge sweep.

---

## 7. Account scoping (the canonical ownership rule)

Billing is account-scoped. There is **no user→subscription lookup anywhere** in the new code;
every operation resolves through `account_billing(account_id)`.

| Case | Behavior |
|---|---|
| Delete personal account | Cancels **only** the personal account's subscription |
| User belongs to a paid team | That team's subscription is **untouched** |
| Delete a team/org account | Would cancel **only** that account's subscription (service is type-agnostic) |
| Leave a team | Cancels nothing (unchanged) |
| Transfer ownership | Cancels nothing (unchanged) |
| Sole owner of a team/org | Personal deletion **blocked** (`ACCOUNT_HAS_OWNED_TEAMS`, 409, with the accounts to resolve) |
| Non-owner | Cannot cancel (403) or delete another account |

Proven end-to-end in
`tests/unit/services/accounts/deletionBillingAccountScoping.test.ts`, which wires the **real**
deletion service to the **real** cancellation service and mocks only the repositories and
Stripe.

**Authorization.** The new mutation is **owner-only**, matching
[`account-ownership-model.md`](../../../rules/account-ownership-model.md) (owner "manages
billing"; admin "views billing"). Admins keep their existing read access — `GET` returns
`canManage:false` and the panel renders read-only. **No admin permission was expanded.** The
pre-existing personal route keeps its `owner|admin` gate, which is equivalent in practice
(a personal account has exactly one membership).

**This never touches the customer's own Stripe integration.** ChainReact's billing uses the
platform secret key (`services/billing/platformStripeClient.ts`); the workflow Stripe
provider (`integrations/stripe/`) uses a per-merchant OAuth token and is disconnected only by
the normal integration teardown at purge.

---

## 8. Why no migration

The audit found every fact the lifecycle needs already durably stored:

- **Lifecycle state** — `accounts.deletion_status` / `purge_after` + the `account_deletions`
  audit ledger (both exist).
- **Subscription handle** — `account_billing.stripe_subscription_id` /
  `cancel_at_period_end` / `current_period_end` (added in CS-2).
- **Retry worklist** — re-derivable every tick from `deletion_status='pending_deletion'`; a
  status column would only duplicate it and could go stale.
- **"Cancelled because of deletion"** — recorded in **Stripe subscription metadata**
  (`chainreact_canceled_by=account_deletion`), which is durable, observable in the Dashboard,
  and rides on every subsequent webhook event.

No RLS, GRANT, or policy change was needed: no new table or column exists, and the new route
reads/writes only through existing service-role repositories with no client write path.

---

## 9. Known gaps / operational requirements

1. **Team / Business account DELETION does not exist** (pre-existing, not introduced here).
   `NonPersonalDangerNote` explains that only personal deletion is available; there is no
   route or service for shared-account deletion. The cancellation service is deliberately
   type-agnostic and already wired into `requestAccountDeletion`, so shared-account deletion
   inherits correct billing wind-down the day it ships. **That feature — membership
   offboarding, shared-workflow teardown, step-up re-auth — is its own slice.**
2. **Neither purge cron is registered in `vercel.json`,** and `ENABLE_ACCOUNT_PURGE_CRON`
   defaults OFF. The reconciliation sweep therefore only runs when the route is invoked.
   **Registering `/api/cron/purge-pending-deletions` on a schedule is required for the
   durable billing retry to actually fire.** Registering it is safe with the purge flag off:
   reconciliation is non-destructive and the purge stays disabled.
3. **Stripe Dashboard:** no new configuration is required for cancel/resume (the REST calls
   need only `STRIPE_SECRET_KEY`). The Customer Portal remains the path for payment-method
   and invoice management and still needs to be enabled there.
4. **Not verified against live Stripe.** All Stripe behavior is proven against mocks at the
   external boundary. A live pass on a test-mode subscription (cancel → webhook → local
   downgrade; delete → immediate cancel → `customer.subscription.deleted`) is still owed.
5. **OAuth-only users** still cannot complete the password step-up (pre-existing).

---

## 10. Verification baseline

Run at the close of this slice — see the batch report for the exact commands and results.
Focused suites covering this slice:

- `tests/unit/services/billing/subscriptionCancellation.test.ts` (36)
- `tests/unit/core/billing/stripeSubscriptionFacts.test.ts`
- `tests/unit/app/api/accounts/billing-subscription.route.test.ts` (21)
- `tests/unit/services/accounts/accountDeletion.test.ts`
- `tests/unit/services/accounts/accountPurge.test.ts`
- `tests/unit/services/accounts/deletionBillingAccountScoping.test.ts`
- `tests/unit/app/api/account/delete.route.test.ts`
- `tests/unit/app/api/cron/purge-pending-deletions.route.test.ts`
- `tests/unit/features/account/SubscriptionCancelPanel.test.tsx`
- `tests/unit/features/account/AccountDeletionCardBilling.test.tsx`
- `tests/unit/features/account/BillingSection.test.tsx`
- `tests/unit/features/account/PersonalPlanPanel.test.tsx`
- `tests/unit/services/billing/personalPlan.test.ts`
- `tests/unit/services/billing/stripeBillingWebhook.test.ts` (regression on the shared reader)

**No real-database validation was run** — this slice adds no migration and no schema change,
and the gated DB suites (`ALLOW_DB_INTEGRATION_TESTS`) were not executed.
