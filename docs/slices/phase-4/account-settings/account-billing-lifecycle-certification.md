# 4.ACCOUNT-BILLING-LIFECYCLE-2 — Certification & Rollout

> **Type:** Implementation + operational doc.
> **Repo/branch:** ChainReactV2 @ `v2-main` (local only — not pushed).
> **Migrations:** none.
> **Live Stripe certification status:** ⚠️ **NOT PERFORMED** — see §3. Everything below that
> is marked *verified* was verified by an automated suite that ran; nothing else is claimed.

Continues [`account-billing-lifecycle-closeout.md`](./account-billing-lifecycle-closeout.md)
(commit `da445ef3a`), which built the cancel-vs-delete lifecycle but left two operational
gaps: the durable retry was never scheduled, and the sole-owner guard was route-only.

---

## 1. What changed in this slice

### 1.1 The retry is now scheduled — on its own non-destructive route

CS-1 put `reconcilePendingDeletionBilling()` on `/api/cron/purge-pending-deletions`. That
route is **deliberately absent from `vercel.json`**: V2-READY-38 keeps every destructive
purge cron unscheduled so "a schedule exists" can never combine with "someone flipped
`ENABLE_ACCOUNT_PURGE_CRON`". A tripwire test enforces it.

Rather than weaken that decision, the schedulable work moved to a dedicated route:

| Route | In `vercel.json`? | Can purge? |
|---|---|---|
| `/api/cron/reconcile-deletion-billing` | ✅ hourly (`0 * * * *`) | **No — structurally impossible** |
| `/api/cron/purge-pending-deletions` | ❌ (tripwired) | Yes, when `ENABLE_ACCOUNT_PURGE_CRON=true` |

`reconcile-deletion-billing` imports exactly one service function. It imports no purge
service, no purge flag, and no delete/anonymize repository — asserted by a source-level test
(`"structurally non-destructive"`), not just by behavior. That is a stronger guarantee than
flag-gating: **there is no configuration of the scheduled route that can destroy data.**

The purge route keeps its own reconcile-then-purge ordering for the day the flag is enabled.

**Cadence — hourly.** The retry only matters for accounts stuck in a failed-cancellation
state. Hourly bounds "still billable after a Stripe outage clears" to ≤ 1 hour, while costing
one indexed query per tick that normally returns zero rows. Deletion→renewal is days or
weeks away, so anything faster buys nothing.

### 1.2 The sole-owner guard moved into the service

**This was a real gap.** The "you still own Team/Business accounts" check lived *only* in
`app/api/account/delete/route.ts`. That was survivable while the service merely flipped a
status column — but CS-1 made `requestAccountDeletion` **cancel a live Stripe subscription**,
so any other entry point (an admin/system caller, a script, a future deletion surface) would
have frozen the account and cancelled billing with **no ownership check at all**.

It is now the first thing `requestAccountDeletion` does:

```
requestAccountDeletion
  ├─ read account once (type + ownerUserId + deletionStatus)
  ├─ already pending? → retry billing only (no transition to guard)
  ├─ ► assertOwnerMayDeletePersonalAccount()   ◄── throws OwnedAccountsBlockDeletionError
  ├─ freeze (deletion_status = pending_deletion, purge_after)
  ├─ insert account_deletions audit row
  └─ cancel the account's Stripe subscription
```

The route no longer re-implements it — it **projects** the typed refusal into HTTP 409 with
the remediation list. There is exactly one enforcement point.

Ownership is read from `accounts.owner_user_id` (via `listOwnedTeamOrgAccountSummaries`) for
**the owner of the account being deleted** — never the caller, never the active-account
selection, never a client-supplied claim — and it spans *all* of that user's accounts.

**Deliberate side effect:** password step-up now runs *before* the ownership refusal is
observable. A session-holding caller can no longer learn "you own 2 teams" without proving
the password first. That is a small security improvement, not a regression.

**Scope:** the guard applies to `type === 'personal'` only. Deleting a team account *is* the
resolution of that ownership, so blocking it would be self-contradictory. It also does not
re-run on the already-frozen retry path — re-checking there would strand a frozen account
that could never finish cancelling its subscription, which is the opposite of the goal.

### 1.3 Blocked accounts can never reach a worklist

Both sweeps derive their worklist from `deletion_status = 'pending_deletion'`
(`listPendingDeletionAccounts`, `listDuePendingAccounts`). A blocked request never writes
that status, so a blocked account is **structurally unreachable** by reconciliation and by
purge. Verified by test.

---

## 2. Owner behavior matrix

| Action | Personal account | Team account | Team ownership |
|---|---|---|---|
| Cancel personal subscription | Stops renewing; moves to Free at period end | **Unchanged** | **Unchanged** |
| Keep personal plan | Renewal restored | **Unchanged** | **Unchanged** |
| Delete personal account **while team owner** | **Blocked** — nothing changes | **Unchanged** | Must transfer/delete team first |
| Transfer team ownership | Unchanged | **Unchanged** (incl. subscription) | Moves to new owner |
| Delete personal account **after transfer** | Enters 30-day deletion; personal billing cancelled immediately | **Unchanged** | New owner remains |
| Delete personal account **as non-owner member** | Enters 30-day deletion | Team remains, billing remains | Existing owner remains |
| Leave team | Unchanged | Team remains | Unchanged (owner must transfer first) |

Canonical rule: **billing is account-scoped.** There is no user→subscription lookup anywhere
in `services/billing/subscriptionCancellation.ts` — asserted by a source-level test that
fails if `byUser` / `ownerUserId` / `userId` ever appears in its code.

---

## 3. Live Stripe test-mode certification — NOT PERFORMED

**No Stripe API call and no webhook delivery occurred in this batch.** Flows A–H of the
certification plan are **not certified**. Claiming otherwise would be false.

**Why:** platform billing is unconfigured in this environment.

| Variable | Present locally? | Needed for |
|---|---|---|
| `STRIPE_SECRET_KEY` | ❌ | every platform Stripe call |
| `STRIPE_BILLING_WEBHOOK_SECRET` | ❌ | webhook signature verification |
| `STRIPE_PRICE_*` | ❌ | checkout / subscription creation |
| `STRIPE_CLIENT_ID` / `STRIPE_CLIENT_SECRET` / `STRIPE_WEBHOOK_SECRET` | ✅ | **the workflow provider only** — unrelated to ChainReact's own billing |

The last row is the trap: `.env.local` *looks* Stripe-configured, but those are the
per-merchant OAuth credentials for `integrations/stripe/` (the customer's Stripe account used
inside workflows). They cannot authenticate platform billing and must never be used for it.

### 3.1 What ships instead: a ready-to-run certification script

`npm run certify:billing` → [`scripts/certify-billing-lifecycle.mjs`](../../../../scripts/certify-billing-lifecycle.mjs)

It exercises the real platform Stripe REST surface that mocks cannot prove: that Stripe
accepts our `cancel_at_period_end` payload, that `DELETE /v1/subscriptions/{id}` ends a
subscription immediately, that cancellation metadata survives, that a missing subscription
raises `resource_missing`, and that a cancelled subscription reads back terminal (which is
what the purge fail-closed guard depends on). It creates its own disposable test-mode
objects, asserts personal↔team isolation on every step, and cleans up after itself.

**Safety, verified by actually running it in this batch:**

| Condition | Behavior | Verified |
|---|---|---|
| `STRIPE_SECRET_KEY` unset | Refuses, exit **2**, no network call | ✅ run |
| Key is `sk_live_…` | Refuses, exit **2**, **before any request** | ✅ run |
| Key is `sk_test_…` | Proceeds to Stripe | ✅ run (reached Stripe auth) |

There is no override flag and no force path. It prints only 4-character id suffixes — never a
key, a full id, an email, or customer detail.

### 3.2 What the automated suites DID verify

Everything except the Stripe wire behavior above. The suites run the **real** services,
repositories, authorization, account scoping, ownership guard, and cron orchestration, and
mock only the external Stripe boundary — so account isolation and the ownership guard are
genuinely exercised, not stubbed.

| Flow | Automated coverage | Live |
|---|---|---|
| A — personal cancel at period end, Keep plan, idempotency, team untouched | ✅ | ❌ |
| B — team cancel isolation, owner-only, admin read-only | ✅ | ❌ |
| C — webhook-driven downgrade, signature, idempotent replay | ✅ (existing webhook suites) | ❌ |
| D — sole-owner block, before every side effect | ✅ | ❌ |
| E — deletion after ownership transfer | ✅ (guard-level) | ❌ |
| F — non-owner member deletion | ✅ (guard-level) | ❌ |
| G — deletion cancels immediately, no proration, reason metadata | ✅ | ❌ |
| H — failure + cron retry, purge stays disabled, batch isolation | ✅ | ❌ |

Flows E and F are certified at the **guard/billing** level (ownership detection and that only
the personal subscription is touched). Their team-side data assertions — that a departing
member's workflows and integrations stay with the team — rest on the pre-existing
offboarding contract and were **not** re-verified end-to-end here.

---

## 4. Deployment checklist

Sequential. **Nothing below was performed in this batch.**

1. **Push and deploy** the approved commits to `v2-main` (requires Marcus's explicit
   per-batch approval; this deploys to production).
2. **Confirm environment values** in Vercel: `CRON_SECRET` (required — the cron 500s without
   it), `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_PRICE_*`.
   Confirm `ENABLE_ACCOUNT_PURGE_CRON` is **unset or false**.
3. **Confirm the cron appears** in Vercel → Project → Cron Jobs:
   `/api/cron/reconcile-deletion-billing`, hourly. Confirm
   `/api/cron/purge-pending-deletions` is **absent**.
4. **Leave `ENABLE_ACCOUNT_PURGE_CRON` off.** Nothing in this slice requires it.
5. **Observe reconciliation runs** for at least 24 h. Expected steady state on a healthy
   system: `{scanned: 0, canceled: 0, alreadyClear: 0, failed: 0}`.
6. **Review logs and counts** — `cron.reconcile_deletion_billing.done`. A persistently
   non-zero `failed` means Stripe cancellations are not completing; investigate before
   considering purge. Counts only; no identifiers are logged.
7. **Confirm the sole-owner block** in production-safe smoke testing: with a disposable
   account that owns a team, request personal deletion → expect **409
   `ACCOUNT_HAS_OWNED_TEAMS`**, the account still `active`, and no subscription change.
8. **Confirm personal↔team isolation**: cancel a disposable personal subscription and verify
   in the Stripe Dashboard that the separately billed team subscription is untouched.
9. **Run `npm run certify:billing`** against test mode (and, if desired, the production-safe
   smoke of step 7–8) before trusting the lifecycle with real customers.
10. **Enable destructive purge only after explicit owner approval** and retention-policy
    verification — see §5.

---

## 5. What must be true before `ENABLE_ACCOUNT_PURGE_CRON` can be enabled

Purge permanently deletes accounts, auth users, workflows, runs, files, integrations,
memberships, and billing rows. Before it is turned on:

- Live Stripe certification (§3) completed, so the fail-closed guard is known to work against
  real Stripe responses — a wrong answer there is the difference between "refuses to purge"
  and "destroys the account while the customer is still billable".
- Reconciliation observed healthy (step 6) with a stable `failed: 0`.
- Retention policy confirmed for the 90-day anonymized-ledger window against the actual
  accounting/legal requirement now that real payments exist.
- Explicit owner (Marcus) approval, recorded.
- The V2-READY-38 tripwire updated deliberately in the same batch that enables it.

---

## 6. Remaining risks & non-goals

- **Live Stripe behavior is unproven.** The single largest remaining risk in this arc.
- **Team / organization account deletion remains a separate future slice.** It does not
  exist; `NonPersonalDangerNote` says so. The cancellation service is type-agnostic and the
  guard deliberately exempts non-personal accounts, so that slice inherits correct behavior —
  but nothing in this batch built or certified it.
- **Ownership transferred *to* a frozen user** is an untested edge: the already-pending retry
  path intentionally skips the guard, so a user who somehow gained team ownership after their
  own freeze would not be re-blocked. Transfer-to-frozen-user should itself be rejected;
  worth a follow-up assertion in the transfer service.
- **The reconciliation cron is unauthenticated-safe but unmonitored.** No ops alert fires on
  a rising `failed` count; step 6 is a manual review today.
- **OAuth-only users** still cannot complete the password step-up (pre-existing).
