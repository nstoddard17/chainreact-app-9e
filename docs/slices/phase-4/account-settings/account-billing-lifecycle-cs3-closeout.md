# 4.ACCOUNT-BILLING-LIFECYCLE-3 — Ownership Eligibility, Observability & Certification Status

> **Type:** Implementation + operational doc.
> **Repo/branch:** ChainReactV2 @ `v2-main` (local only — not pushed).
> **Migrations:** none.
> **Live Stripe certification:** ⚠️ **STILL NOT PERFORMED** — credentials remain absent. §3.

Continues [`account-billing-lifecycle-certification.md`](./account-billing-lifecycle-certification.md)
(commits `15161629f`, `d517cccbf`).

---

## 1. Ownership-transfer recipient eligibility (new)

### 1.1 Every path that can make someone an owner

Audited exhaustively. There is exactly one:

| Path | Grants owner to *another* user? | Status |
|---|---|---|
| Signup trigger → personal account | No — the user is their own owner | n/a |
| `createTeamAccount` → `insertOwnerMembershipServiceRole` | No — the **creator** becomes owner | n/a |
| **`transferOwnership`** | **Yes** | ← the canonical chokepoint; now guarded |
| Invitations (`invitations.ts`) | No — `owner_not_invitable` at the service floor | already safe |
| Member role change (`membership.ts`) | No — admin↔member only; `owner_target` refused | already safe |
| Admin reassignment | Does not exist | n/a |

The guard therefore lives in `services/accounts/transferOwnership.ts`. The route only
projects the typed reason; a structural test asserts the route does **not** re-implement it.

### 1.2 The rule

**Eligible** = the recipient has a personal account and its `deletion_status` is `active`.

**Ineligible** = `pending_deletion` (frozen, heading for purge), or **no personal account at
all** (identity purged or never provisioned — fails closed; a missing row is never read as
"fine"). An **unreadable** answer also refuses (`transfer_failed`), never proceeds.

**Billing tier is not eligibility.** A recipient on Free, or one whose personal subscription
is scheduled to cancel, is an active user and a perfectly valid owner. The predicate reads
`accounts.deletion_status` only; **no new status column was introduced** and the eligibility
path performs no billing read at all (asserted structurally).

Rejection returns one reason — `target_unavailable` → HTTP **409 `TARGET_UNAVAILABLE`** —
for every ineligible state. The initiating owner is told to choose a different member and is
**not** told that the other person is deleting their account. Verified by a no-leak test:
the response contains no `deleting`/`pending`/`frozen`/`purge`/`grace` wording and no user id.

### 1.3 Ordering — rejection precedes every mutation

The check runs after the cheap validations and **before** the RPC that performs the swap. The
RPC is what moves `accounts.owner_user_id` *and* demotes the previous owner, so never reaching
it means: no ownership change, no role change, no demotion, no audit event claiming success,
no notification, and no billing change. Asserted directly (`expectNoMutation`).

### 1.4 Concurrency — transfer vs. the recipient's deletion

Two interleavings exist:

| Order | Outcome |
|---|---|
| Transfer commits **first**, then the recipient requests deletion | **Safe with no extra work.** Their deletion's sole-owner guard re-reads owned accounts at write time, now sees this account, and blocks. |
| The recipient's deletion commits **between** our check and our swap | Would leave a team owned by a pending-deletion user. **Closed by post-swap re-verification.** |

The service re-reads the recipient *after* the swap; if they are no longer eligible it
**reverts** the swap (the previous owner was demoted to `admin` and is still a member, so the
reverse transfer is valid) and returns `target_unavailable`. A failed reversal is logged at
ERROR — the caller is still never told the transfer succeeded.

**Why compensating action rather than one transaction:** the swap lives in the TL-1
`transfer_account_ownership` SECURITY DEFINER RPC and the deletion write is a separate
statement in another service. True atomicity means pushing the predicate into SQL and taking
a matching `SELECT … FOR UPDATE` on the recipient's personal-account row on **both** paths —
a migration plus RPC change. That is the durable fix and is recorded as the follow-up below;
this slice could not apply and validate a migration (`db:push` is out of scope here), and
shipping an unapplied migration would be worse than the compensating action.

**Residual risk is fail-closed:** in the unhandled tail (swap + failed revert), the purge
still cannot delete a user who owns an account — `accounts.owner_user_id → auth.users
ON DELETE RESTRICT` blocks it. The bad state is "purge refuses", never "team silently
orphaned".

---

## 2. Reconciliation failure visibility (new)

Audited first: the project already has a canonical ops path — `ops_signal_events` +
`services/observability/signalRecorders.ts` (`recordCronRun`, `withCronHeartbeat`) +
`cronExpectations.ts` + the `evaluate-ops-alerts` evaluator. **No new alerting mechanism was
introduced.**

Two wires added:

1. **Heartbeat.** `/api/cron/reconcile-deletion-billing` is wrapped in `withCronHeartbeat`,
   and registered in `MONITORED_CRONS` at 60 minutes. A cron that stops running now alerts —
   which matters here, because a silent cron means departing customers keep being billed with
   nothing retrying.
2. **Explicit failure signal.** A partially-failed sweep still returns HTTP 200 (one
   account's outage must not fail the tick), so the heartbeat alone would record `ok`.
   `failed > 0` therefore also calls
   `recordCronRun("reconcile-deletion-billing", "failed", "billing_cancellation_failed")`
   and logs a structured error.

**Fields logged:** `scanned`, `attempted`, `succeeded`, `failed`, `alreadyClear`,
`errorCategory`, `at`. **Never logged:** account ids, user ids, emails, Stripe customer or
subscription ids, team names, or raw Stripe errors. Asserted by test.

**How an operator discovers repeated failures today:** the `failed` cron signal lands in
`ops_signal_events`; the `evaluate-ops-alerts` cron (every 5 min) turns it into an ops alert
through the existing delivery path, the same as any other cron failure. A missing tick trips
the separate missing-run alert via `cronExpectations`. There is still no billing-specific
dashboard — this rides the generic cron channel deliberately.

---

## 3. Stripe test-mode configuration — audit

**Live certification could not run: platform billing is unconfigured in this environment.**

| Variable / configuration | Purpose | Required for certification? | Present? | Test-mode verified? |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Platform Stripe REST auth (cancel/resume/delete) | **Yes** | ❌ | — |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Verifies inbound billing webhook signatures | **Yes** (flow C) | ❌ | — |
| `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | Pro checkout price | For checkout-based flows | ❌ | — |
| `STRIPE_PRICE_TEAM_MONTHLY` / `_ANNUAL` | Team checkout price | For checkout-based flows | ❌ | — |
| `STRIPE_PRICE_BUSINESS_MONTHLY` / `_ANNUAL` | Business checkout price | For checkout-based flows | ❌ | — |
| Stripe **Customer Portal** configuration | `/v1/billing_portal/sessions` (payment method, invoices) | Not for A/B/D/E/F | ❌ | — |
| `NEXT_PUBLIC_APP_URL` | Checkout/portal redirect base | For checkout flows | ✅ | n/a |
| `CRON_SECRET` | Authorizes the reconciliation cron (flow F) | **Yes** (flow F) | ✅ (`.env.test.local`) | n/a |
| Webhook forwarding (Stripe CLI `stripe listen`) | Delivers signed test events to the real route | **Yes** (flow C) | ❌ | — |

The certification script does **not** need the price vars: it creates subscriptions with
inline `price_data` against a disposable product, so no reusable Stripe objects are required
and none are duplicated.

### 3.1 Explicitly rejected as platform-billing credentials

These **are** present in `.env.local` and are the trap this audit exists to flag — they
belong to the **workflow provider** (`integrations/stripe/`, the customer's own connected
Stripe account used inside their workflows) and can never authenticate ChainReact's billing:

- `STRIPE_CLIENT_ID` — OAuth client id for connecting a merchant account.
- `STRIPE_CLIENT_SECRET` — provider OAuth secret.
- `STRIPE_WEBHOOK_SECRET` — the **provider** trigger endpoint secret, not
  `STRIPE_BILLING_WEBHOOK_SECRET`.
- Any `sk_live_…` key — refused by the script before a single request.
- Production customer / price / subscription / webhook objects — never touched.

A test asserts the script still refuses when *only* the provider credentials are present.

### 3.2 Owner checklist to unblock certification

1. In the Stripe Dashboard, switch to **Test mode**.
2. Copy the test **secret key** (`sk_test_…`) → `.env.local` as `STRIPE_SECRET_KEY`.
3. `stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing` → copy the printed
   `whsec_…` → `.env.local` as `STRIPE_BILLING_WEBHOOK_SECRET`.
4. (Only for checkout-based flows) create test-mode recurring prices and set the
   `STRIPE_PRICE_*` vars.
5. Run `npm run certify:billing`. It refuses unless the key is test-mode.
6. For flow C, exercise a cancellation and confirm the forwarded
   `customer.subscription.deleted` event flips the correct `account_billing` row.

---

## 4. Owner-facing behavior

| Situation | Result |
|---|---|
| Team owner cancels personal subscription | Personal plan ends at period end; team and ownership unchanged |
| Team owner deletes personal account | Blocked until ownership is transferred |
| Team transferred to an active member | Transfer succeeds; team billing unchanged |
| Team transferred to a frozen / pending-deletion member | **Rejected before any mutation** |
| Team transferred to a member on Free, or mid-cancellation | **Allowed** — billing tier is not eligibility |
| Former owner deletes personal account after a valid transfer | Personal deletion proceeds; team remains |
| Personal deletion Stripe cancellation fails | Account remains frozen; hourly reconciliation retries; ops signal on `failed > 0` |
| Purge flag remains off | No permanent deletion occurs |

---

## 5. What is certified, and what is not

| Flow | Automated (real services, Stripe mocked at the boundary) | Live Stripe test mode |
|---|---|---|
| A — personal cancel / Keep plan / isolation / idempotency | ✅ | ❌ not run |
| B — team cancel isolation, owner-only | ✅ | ❌ not run |
| C — webhook authority, signature, replay | ✅ (webhook suites) | ❌ not run |
| D — deletion cancels immediately, no proration, metadata | ✅ | ❌ not run |
| E — sole-owner block, no side effects | ✅ | ❌ not run |
| F — failure + hourly reconciliation retry | ✅ | ❌ not run |
| Recipient eligibility + concurrency revert | ✅ | n/a (no Stripe involvement) |
| Certification script refusal gate | ✅ **executed for real** (no key / `sk_live_` / `rk_live_` → exit 2) | n/a |

**No Stripe API call and no webhook delivery occurred in this batch.** Any statement that the
lifecycle is "Stripe-certified" remains unearned until §3.2 is completed.

---

## 6. Follow-ups

1. **Live Stripe test-mode certification** — the largest remaining risk in this arc.
2. **Transactional recipient eligibility** — push the predicate into the
   `transfer_account_ownership` RPC with a `SELECT … FOR UPDATE` on the recipient's personal
   account row, and take the same lock in the deletion path, replacing the compensating
   revert. Needs a migration + real DB validation.
3. **Team / organization account deletion remains a separate future slice.** Not built, not
   certified, not in scope here.
4. `ENABLE_ACCOUNT_PURGE_CRON` stays off and `/api/cron/purge-pending-deletions` stays out of
   `vercel.json`; the V2-READY-38 tripwire is green.
