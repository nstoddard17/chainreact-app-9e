# 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-1 — Personal Pro vs Team/Business Choice Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, Stripe, or
billing-behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[docs/.../plan-metadata-stripe-billing-plan.md](./plan-metadata-stripe-billing-plan.md) (the parent billing plan; §10 = this flow) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (`PLAN_LIMITS`, `defaultPlanForAccountType`, `isPlanAllowedForType`) ·
[core/billing/downgradeRules.ts](../../../../core/billing/downgradeRules.ts) (CS-5 `evaluateDowngrade`) ·
[services/billing/downgradePreview.ts](../../../../services/billing/downgradePreview.ts) (CS-5 `previewDowngrade`) ·
[services/billing/platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts) (CS-3 checkout/portal: per-account customer + subscription) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (CS-4 sync; `subscription.deleted` → `canceled`, plan LEFT) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`account_billing` 1:1 per account; `getUsage`, `getStripeAttachmentServiceRole`, `applyBillingSubscriptionSyncServiceRole`) ·
[services/accounts/createTeamAccount.ts](../../../../services/accounts/createTeamAccount.ts) (creates a SEPARATE team account; never touches personal) ·
[app/api/accounts/route.ts](../../../../app/api/accounts/route.ts) (`POST` creates `type='team'` only; org via a "future in-place upgrade") ·
[app/api/accounts/[id]/billing/checkout/route.ts](../../../../app/api/accounts/[id]/billing/checkout/route.ts) + [portal/route.ts](../../../../app/api/accounts/[id]/billing/portal/route.ts) (CS-3 routes, owner/admin, flag-gated, freeze-rejecting) ·
[features/account/AccountSections.tsx](../../../../features/account/AccountSections.tsx) (CS-5 `BillingSection` lifecycle banner) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) · [services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) (limit seams) ·
prior commits: CS-1 `d9e669e0c` · CS-2 `b7d27ba90` · CS-3 `98028890e` · CS-4 `e9f80dc2e` · CS-5 `e13963a3a`.

> **Headline:** Keep billing **account-scoped** — exactly as CS-2/CS-3 already shipped
> (one Stripe **customer + subscription per `account_id`**, `customer.metadata.accountId`,
> unique index on `account_billing.stripe_customer_id`). A Personal Pro subscription and a
> Team/Business subscription are **independent**. When a Personal-Pro user starts a **paid
> Team/Business checkout**, show an **explicit, skippable** choice — **Keep Personal Pro**
> (default; nothing happens to the personal account) or **Downgrade Personal to Free**
> (schedule the personal subscription to cancel **at period end**, no data deleted). The
> downgrade is **blocked when the personal account exceeds Free limits** (reusing CS-5's
> `evaluateDowngrade`). **Two prerequisites are not yet built and gate this flow** (see
> §2): the Business/`organization` creation+upgrade path, and the plan-**revert**-to-free
> on `subscription.deleted` (CS-4 currently leaves the plan as the last paid plan).

---

## 1. Context

The billing arc CS-1…CS-5 has landed: plan metadata + policy (CS-1), Stripe attachment +
lazy client (CS-2), checkout/portal routes (CS-3), the signature-verified webhook that
makes checkout authoritative (CS-4), and warning-first lifecycle + downgrade validation
(CS-5). The parent plan's **§10 (Personal Pro vs Team/Business interaction)** is the one
remaining product decision in the "what happens to billing when account shapes change"
space. This doc designs that flow end-to-end so a later implementation arc can build it
without re-litigating the model. It implements **nothing**.

This sits at the seam of two already-decided invariants:

- **Account-scoped billing** (parent plan §5/§7; CS-2/CS-3): billing attaches to
  `account_id`, never to the user.
- **Membership ≠ personal Pro** (account model; `createTeamAccount` header): Team/Business
  members do **not** need their own Pro. So "Keep Personal Pro" is purely the user's call,
  never required for team access.

---

## 2. Current codebase findings (verified)

Each claim traces to a file inspected above.

1. **One Stripe customer + subscription per account — already shipped.** CS-3
   `createCheckoutSession` ([platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts))
   lazily creates **one customer per `account_id`** with `metadata: { accountId }`, stores
   it via the race-safe `attachStripeCustomerIfAbsentServiceRole`, and the CS-2 migration
   put a **partial unique index** on `account_billing.stripe_customer_id` /
   `stripe_subscription_id`. So a personal account and a team account each get their **own**
   customer + subscription. **The "customer per account, not per user" question is already
   answered by shipped code** — this plan recommends keeping it.

2. **Personal accounts CAN go Pro; Team is created Free; Business is NOT creatable yet.**
   `POST /api/accounts` ([route.ts](../../../../app/api/accounts/route.ts)) hard-locks the
   body to `type='team'` and the header states `'organization'` "is reached only via the
   future in-place upgrade." `createTeamAccount` seeds **free billing, no Stripe**.
   CS-3 checkout accepts `plan ∈ {pro, team, business}` validated against the account type.
   ⇒ **A Personal-Pro→creates-Team scenario is reachable today** (personal checkout `pro`
   + create team + checkout `team`), **but a Personal-Pro→Business scenario is NOT** — the
   `organization` creation/upgrade path does not exist. **Dependency D1 (§13).**

3. **`free` and `pro` have IDENTICAL limits today.**
   [`PLAN_LIMITS`](../../../../core/billing/planPolicy.ts): `free` and `pro` are both
   `{ memberLimit: 1, folderLimit: 10, taskLimit: 100 }`. ⇒ **A Pro→Free personal
   downgrade can never exceed Free limits today** — the over-limit block is a **forward-
   looking no-op** until Pro's limits are raised. The plan still designs the block (correct
   once Pro diverges) but must label it currently inert.

4. **The only enforced personal limits are folders + tasks (+ structural member=1).**
   Searches found **no** workflow-count limit (`MAX_WORKFLOWS` absent) and **no** API-key-
   count limit. Folder cap is `folderLimitFor` (personal → 10); task cap is
   `account_billing.tasks_limit` (100). Public-API access is a **global** flag
   `ENABLE_PUBLIC_API_KEYS` ([services/apiKeys/flags.ts](../../../../services/apiKeys/flags.ts)),
   not a per-plan gate. ⇒ The §7 "what limits matter for Personal Free" answer is **folders
   + tasks** today; workflows / API-keys / public-API are **not** plan-gated yet.

5. **CS-5 already provides the downgrade-validation primitive.**
   `evaluateDowngrade(usage, targetPlan)` ([downgradeRules.ts](../../../../core/billing/downgradeRules.ts))
   compares member + live-folder counts to the target plan's limits; `previewDowngrade`
   ([downgradePreview.ts](../../../../services/billing/downgradePreview.ts)) gathers the
   real counts. **This is the gate this flow reuses** for the personal Free check (members
   is structurally 1 for personal, so only the folder dimension can ever bind — until §7
   limits expand).

6. **CS-4 does NOT revert the plan on cancellation.**
   [stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts):
   `customer.subscription.deleted` sets `plan_status='canceled'` and **leaves `plan` as the
   last paid plan** (revert is explicitly deferred to "CS-5", which then also chose
   warning-only). ⇒ A "downgrade Personal to Free at period end" will, with today's code,
   end as `plan='pro', plan_status='canceled'` — **not** `plan='free'`. **Dependency D2
   (§13):** a lifecycle slice must revert `plan → defaultPlanForAccountType(personal) =
   'free'` (and reset `tasks_limit` from policy) on `subscription.deleted` for a
   user-initiated personal cancel.

7. **Freeze already blocks plan changes.** CS-3 checkout/portal + the service freeze check
   (`account.deletionStatus === 'pending_deletion'` → `account_frozen`) reject billing
   operations on a frozen account. The choice flow inherits this for free.

8. **CS-5 BillingSection renders a warn-first lifecycle banner** (`deriveBillingLifecycle`)
   + a `Renews on` / `Access ends` dated row, and exposes **zero** payment controls. The
   personal-plan management surface this flow needs is an additive panel, not a redesign.

---

## 3. Product / model decision

**What this feature IS:** an **explicit, non-destructive choice** presented to a
**Personal-Pro** user at the moment they commit to a **paid** Team/Business plan: keep both
subscriptions, or schedule the personal one to lapse at period end. It is a UX + a small
server action that **sets `cancel_at_period_end` on the personal subscription** — nothing
more.

**What it is deliberately NOT:**

- **Not** a migration of data between accounts. Personal workflows/folders/integrations/
  API keys **stay on the personal account** regardless of the choice (account-scoped model).
- **Not** a per-seat or "membership satisfies personal limits" mechanism. A Team/Business
  membership never raises the personal account's limits — the personal account is billed
  and limited on its own plan (parent plan §10; finding #4).
- **Not** an automatic cancellation. Team/Business creation/checkout **never** silently
  touches Personal Pro; the only path to canceling personal is the user explicitly choosing
  "Downgrade Personal to Free."
- **Not** a new Stripe customer model. Keep **one customer per `account_id`** (finding #1).

---

## 4. Recommended product flow

**Trigger point (answers Q1):** show the choice at **paid Team/Business checkout start**,
and **only when** the caller's **personal** account currently has an **active paid Pro
subscription** (`account_billing.plan='pro'` AND `plan_status ∈ {active, trialing}` AND a
non-null `stripe_subscription_id`). Rationale:

- **Not at free team creation** — `createTeamAccount` is Stripe-less and free (finding #2);
  there is nothing to pay for and no reason to disturb personal billing.
- **Not after checkout success** — the user has already paid for Team/Business; surfacing a
  "do you also want to drop personal?" prompt post-payment is jarring and easy to ignore,
  leaving silent double-spend. Presenting it **before** the second charge is the honest
  moment.
- **Checkout start** is where the user is already deciding to spend; it is the natural,
  least-surprising place.

**Required vs skippable (answers Q2):** **skippable, with a safe default of "Keep Personal
Pro."** The choice **must never be required** and the default must be the **non-destructive**
option. Downgrading personal is strictly opt-in. A user who dismisses the dialog keeps both
subscriptions.

**Flow:**

1. Owner/admin of the personal account starts a Team/Business paid checkout
   (`POST /api/accounts/[teamId]/billing/checkout`).
2. The client first asks the server: *does my personal account have an active paid Pro sub?*
   (a small read endpoint, §7). If **no** → proceed straight to checkout (no dialog).
3. If **yes** → show the choice dialog **before** redirecting to Stripe Checkout:
   - **Keep Personal Pro** (default) → proceed to Team/Business checkout unchanged. Two
     independent subscriptions will coexist. (Answers Q3.)
   - **Downgrade Personal to Free** → first run the **personal Free over-limit check**
     (§6). If **blocked**, show the blockers and **do not** offer downgrade (only "Keep");
     if **allowed**, on confirmation the server **schedules the personal subscription to
     cancel at period end** (sets `cancel_at_period_end=true`), then proceeds to the
     Team/Business checkout. (Answers Q4/Q5.)
4. Stripe Checkout completes for Team/Business; the CS-4 webhook activates the Team/Business
   plan. The personal subscription continues until its period end, then Stripe emits
   `customer.subscription.deleted` → the personal account reverts to Free (**requires D2**).

**Two server actions, both additive:**

- `setPersonalCancelAtPeriodEnd(personalAccountId)` — sets `cancel_at_period_end=true` on
  the personal subscription via the platform Stripe client (`POST /v1/subscriptions/{id}`),
  owner-only, freeze-rejecting; the CS-4 webhook syncs `cancel_at_period_end` back. **No
  immediate cancel, no data touch.**
- A read used by step 2/§7 to decide whether the dialog is needed.

---

## 5. Stripe / customer / subscription model (answers Q11/Q12)

**Keep the shipped per-account model. Do not change it.**

| Object | Owner | Source today |
|---|---|---|
| Personal Stripe **customer** | personal `account_id` | `account_billing.stripe_customer_id` (unique), `metadata.accountId` |
| Personal **subscription** (Pro) | personal `account_id` | `account_billing.stripe_subscription_id` |
| Team/Business **customer** | team/org `account_id` | separate row, separate customer |
| Team/Business **subscription** | team/org `account_id` | separate subscription |

- **Separate customers per account**, not one customer per user. This is already enforced
  by the unique index + `metadata.accountId` (finding #1) and keeps invoices, tax, and
  cancellation cleanly scoped to one account. A "single customer per user with multiple
  subscriptions" model was considered and **rejected** (§ Alternatives) — it would break
  the 1:1 `account_billing.stripe_customer_id` invariant and entangle two accounts'
  billing lifecycles.
- **No new Stripe object is introduced by this flow.** The downgrade action only mutates an
  **existing** personal subscription (`cancel_at_period_end`). Keeping personal does
  nothing. So there is **no path that creates a duplicate subscription** (answers Q10 — see
  §10 detail).

### Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| **Per-account customer + subscription** (recommended; already shipped) | ✅ | Matches CS-2/CS-3 invariants; clean per-account invoices/cancel; no cross-account coupling. |
| One customer per user, multiple subscriptions | ❌ | Breaks the 1:1 `stripe_customer_id` per `account_billing`; a personal cancel could disturb the team sub on the same customer; harder RLS/no-leak story. |
| Choice at free team creation | ❌ | Team creation is free + Stripe-less (finding #2); nothing to decide, and it would imply (falsely) that creating a team affects personal billing. |
| Choice after checkout success | ❌ | User already paid; double-spend already happened; prompt reads as an afterthought. |
| Cancel personal immediately on downgrade | ⚠️ rejected default | Forfeits paid-for time; invites refund disputes. Period-end is the safe default (Q5). Immediate stays an open decision only if product wants instant proration. |

---

## 6. Over-limit handling (answers Q6/Q7/Q8/Q9)

- **Block the downgrade when the personal account exceeds Free limits** (Q8 = yes). Reuse
  CS-5 `previewDowngrade(personalAccountId, 'free')` → if `!ok`, show the blockers and
  offer only "Keep Personal Pro." **No data is ever deleted to make a downgrade fit**
  (parent plan §9 + product direction).
- **Limits that matter for Personal Free (Q7), as actually enforced today (finding #4):**
  **folders (10)** and **tasks (100/period)**; member is structurally 1. Workflows,
  API-key count, and public-API access are **not** plan-gated today — list them as
  **future** dimensions to fold into `evaluateDowngrade` if/when they become plan limits,
  but do **not** invent enforcement that the backend doesn't have (no fake limits).
- **Caveat to state loudly:** because `pro` and `free` limits are **identical today**
  (finding #3), the folder check **never blocks** a current Pro→Free move. The block is
  **correct and forward-looking** — it starts mattering the moment Pro's limits are raised.
  Tasks are a **usage counter** that resets per period, not a structural cap, so it should
  **not** block a downgrade (you can't "have too many tasks already used" — the next period
  resets); only **structural** caps (folders, future workflows/keys) gate the downgrade.
- **Grace period (Q9):** the **period-end cancellation is itself the grace** — the user
  keeps Pro features until the paid period ends. Recommend **no additional grace**. (This
  is distinct from the CS-5 `past_due` grace, which is a dunning concept and unrelated.)

---

## 7. API / service / UI expectations (described, not built)

**Read (decide whether to show the dialog):**
- `GET /api/accounts/[id]/billing/personal-plan-state` (or fold into an existing billing
  read) → `{ isPaidPersonalPro: boolean, planStatus, currentPeriodEnd, cancelAtPeriodEnd,
  downgrade: { allowed: boolean, blockers: [...] } }`. Owner/admin only, account-scoped,
  **never** returns Stripe ids (CS-2 no-leak posture). `downgrade` comes from
  `previewDowngrade(id,'free')`.

**Write (the only mutation):**
- `POST /api/accounts/[id]/billing/personal/cancel-at-period-end` → owner-only, freeze-
  rejecting, behind `ENABLE_PLATFORM_BILLING`. Sets `cancel_at_period_end=true` on the
  personal subscription via the platform client; returns `{ ok: true }`. Idempotent
  (setting it twice is a no-op). **Re-enable** path (undo) → `cancel_at_period_end=false`,
  for symmetry. The CS-4 webhook is the authority that syncs the flag back into
  `account_billing` (don't write plan/status from this route — Q15/§9 consistency).

**UI surfaces (Q14):**
- A **pre-checkout choice dialog** at Team/Business paid checkout (the only new modal). Two
  options, default "Keep"; when the personal account is over Free limits, the "Downgrade"
  option is disabled with the blocker copy.
- An additive **"Personal plan"** affordance in Account Settings → Billing (§ below).
- **No fabricated controls** — every button maps to a real route above. The Stripe Customer
  Portal remains the place to change payment method / fully manage the sub; the in-app
  "cancel at period end" is a convenience that mirrors a portal action.

---

## 8. Account Settings Billing implications (answers Q15)

- On the **personal** account's Billing section, when it is paid Pro, show its real
  lifecycle (already rendered by CS-5 `deriveBillingLifecycle`) **plus** a single
  **"Cancel at period end" / "Keep plan"** toggle (the §7 write) behind
  `ENABLE_PLATFORM_BILLING`. When `cancel_at_period_end` is set, CS-5 already renders the
  "Active — canceling / Access ends {date}" banner — **no new banner needed**, just the
  toggle.
- When a downgrade is **blocked** by over-limit, surface the blockers inline (reuse the
  `previewDowngrade` shape) so the user knows what to trim.
- **Business label, never "Organization."** No Stripe ids shown. No pricing-table redesign.

---

## 9. Edge cases

- **Personal not Pro** → no dialog; checkout proceeds. (Most users.)
- **Personal Pro but `past_due`/`incomplete`** → still offer "keep"; "downgrade" should be
  allowed (canceling a delinquent sub is fine) but copy should be clear; defer to portal if
  Stripe rejects the API cancel.
- **Personal already `cancel_at_period_end=true`** → the toggle shows "Keep plan" (undo);
  the dialog's downgrade option is already satisfied.
- **Over Free limits** → downgrade disabled, "Keep" only (§6).
- **Frozen personal account** → no plan changes (finding #7); dialog suppressed.
- **Team/Business checkout abandoned after personal was set to cancel** → the personal
  cancel is independent and **stands** (user explicitly chose it); they keep personal until
  period end regardless of whether they finished the team purchase. Document this so it's a
  deliberate behavior, not a surprise. (Alternative: only set personal-cancel **after**
  team checkout success — see Open decision O3.)
- **Race: two tabs** → the cancel route is idempotent; the read may be momentarily stale but
  the webhook reconciles.

---

## 10. Security / billing risks (security-review lens)

- **No hidden double billing (Q10):** the flow **never creates** a subscription on the
  downgrade path — it only sets `cancel_at_period_end` on an existing one. Keeping personal
  is a no-op. The Team/Business subscription is created by the **existing** CS-3 checkout on
  a **separate** customer (unique `stripe_customer_id` per account). So "two subscriptions"
  only ever happens by **explicit user choice** (keep both), never silently.
- **Server resolves ownership, not the client.** The cancel route takes `accountId` from the
  path and re-resolves owner/admin (`requireAccountRole`) + freeze; the personal
  subscription id is read **service-role** from `account_billing` — the client **never**
  supplies a subscription/customer id (CS-2/CS-3 posture).
- **No-leak:** the read + write responses return booleans/dates only — **never**
  `stripe_customer_id` / `stripe_subscription_id` (CS-2 projection rule). The personal-plan
  read is owner/admin-gated; a co-member/non-member gets the same no-leak 403.
- **Plan/status stays webhook-authoritative:** the cancel route sets only the Stripe flag;
  `plan`/`plan_status`/`cancel_at_period_end` in `account_billing` are written **only** by
  the CS-4 webhook. No route mutates plan directly (preserves the Q15 single-writer rule).
- **Freeze + deletion (Q13):** frozen accounts reject the cancel route. Personal-account
  **deletion** must cancel its subscription best-effort (parent plan §12 / account-deletion
  flow) — this flow does not change that, but the two must stay consistent (an in-flight
  `cancel_at_period_end` plus a deletion should not strand a live subscription).
- **Idempotency:** setting `cancel_at_period_end` is naturally idempotent; no ledger needed.

---

## 11. Dependencies / blockers (must land before or with this flow)

- **D1 — Business (`organization`) creation + paid upgrade path.** Does not exist
  (finding #2). The choice flow's "Business" half is unreachable until an org-creation /
  in-place upgrade slice ships. **The Team half is buildable today.**
- **D2 — Plan revert on user-initiated cancel.** CS-4 leaves `plan` as last-paid on
  `subscription.deleted` (finding #6). For "Downgrade Personal to Free" to actually land on
  Free at period end, a lifecycle slice must, on `subscription.deleted` for a personal
  account, revert `plan → 'free'` and reset `tasks_limit` from policy. Until D2, a downgraded
  personal account would read `plan='pro', plan_status='canceled'` after period end — wrong.
- **D3 — `ENABLE_PLATFORM_BILLING` still default OFF.** The whole surface stays dark until
  the flag flips; this flow ships behind it like CS-3.

---

## 12. Implementation slice breakdown (future — not this slice)

Ordered, each small + flag-gated (`ENABLE_PLATFORM_BILLING`, default OFF):

- **PPT-1 — Personal-plan read + cancel-at-period-end action.** The §7 read endpoint +
  `POST …/billing/personal/cancel-at-period-end` (set/undo) on the platform client, owner-
  only, freeze-rejecting, no-leak. Reuses `previewDowngrade(id,'free')` for the `downgrade`
  block. **Independent of D1/D2** (just sets the Stripe flag + reflects it). Tests: auth/role/
  freeze gates, no-leak, idempotency, blocked-when-over-limit.
- **PPT-2 — Plan revert on personal cancel (D2).** Webhook lifecycle: on
  `subscription.deleted` for a personal account, revert `plan→free` + `tasks_limit` from
  policy (account-type-aware; team/org keep their own revert rules). Tests: deleted→free for
  personal; team/org unaffected; idempotent.
- **PPT-3 — Account Settings personal-plan toggle (UI).** The §8 toggle + blocked-downgrade
  copy behind the flag. No fake controls. Tests: toggle reflects `cancel_at_period_end`,
  blockers shown, Business-never-Organization, no controls when flag OFF.
- **PPT-4 — Pre-checkout choice dialog.** The §4 dialog wired into the Team/Business paid
  checkout start; default "Keep"; downgrade disabled when over-limit. Tests: dialog shown
  only for paid-Pro personal; default keep; downgrade→sets cancel then proceeds; skip→
  proceeds unchanged.
- **PPT-5 (gated on D1) — Business path.** Extend the dialog/flow to the
  `organization`/Business paid upgrade once that path exists.
- **Deferred:** immediate-cancel option, proration/refunds, annual plans, trials, and any
  per-plan limit expansion (workflows/API-keys/public-API) that would make §6 bind.

---

## 13. Test plan (for the implementation slices)

- **Trigger gating:** dialog/flow engages **only** when personal is paid Pro
  (active/trialing + sub id); skipped otherwise.
- **Keep path:** no Stripe mutation on personal; Team/Business checkout proceeds; two
  independent subscriptions.
- **Downgrade path:** sets `cancel_at_period_end=true` on the personal sub (period-end, not
  immediate); no data deleted; webhook syncs the flag.
- **Over-limit:** `previewDowngrade(id,'free')` blocks; downgrade option disabled; blockers
  surfaced; **document the current no-op** (Pro==Free) so the test asserts the *mechanism*,
  not a today-visible block.
- **No-leak:** read/write responses carry no Stripe ids; owner/admin-only; non-member 403.
- **Webhook revert (PPT-2):** personal `subscription.deleted` → `plan='free'`.
- **Freeze/deletion:** frozen → cancel route rejected; deletion cancels sub best-effort
  without stranding.
- **Double-billing guard:** no code path creates a second personal subscription; "keep" is
  a no-op.

---

## 14. Open decisions

- **O1 — Personal cancel timing (Q5).** Recommend **period-end** (no forfeiture). Immediate
  + proration only if product explicitly wants it. *Recommendation: period-end.*
- **O2 — Where to execute the personal cancel:** in-app API (`cancel_at_period_end`) vs
  redirect to the Stripe Customer Portal. Recommend **in-app API** for a controlled,
  single-click choice, with the **Portal as the fallback** for full management.
  *Recommendation: in-app API + portal fallback.*
- **O3 — Order of operations:** set personal-cancel **before** Team/Business checkout (clear
  intent, but personal-cancel stands even if team checkout is abandoned) vs **after** team
  checkout success (no orphaned cancel, but a post-payment prompt). *Recommendation: set
  **before**, and treat an abandoned team checkout as "personal cancel still honored" (§9),
  since the user explicitly chose it; revisit if support load suggests otherwise.*
- **O4 — Does the dialog ever hard-require a choice?** Recommend **no** (always skippable,
  default keep). Only revisit if finance wants to nudge consolidation.
- **O5 — Future personal Free limits (§6/§7).** Whether Pro should grant **higher** folder/
  workflow/API limits than Free (which would make the over-limit block actually bind).
  Product/pricing decision; out of scope here.

---

## 15. Acceptance criteria

**For this planning slice:**
- A committed planning doc at this path; **no** source, migrations, tests, UI, Stripe, or
  billing-behavior changes; nothing pushed.
- Every "current state" claim traces to a file inspected (§2), including the two findings
  that materially shape the plan: **Pro==Free limits today** (#3) and **CS-4 leaves plan on
  cancel** (#6), plus **Business not creatable** (#2).
- Locks the model: account-scoped, per-account customer/subscription kept; explicit +
  skippable choice at paid checkout start; default Keep; downgrade = period-end cancel +
  over-limit block + no data deletion; webhook stays the sole plan writer.

**For the implementation arc (PPT-1…PPT-5):**
- No path silently cancels Personal Pro or creates a duplicate subscription.
- Downgrade is blocked over Free limits and deletes nothing.
- Stripe ids never client-exposed; plan/status webhook-authoritative; flag default OFF.

---

## 16. Hard boundaries (what this slice did NOT change)

Planning doc only. No source, migrations, schema, tests, UI, Stripe code, or billing
behavior changed. `account_billing`, the CS-3 checkout/portal routes, and the CS-4 webhook
are untouched. `ENABLE_PLATFORM_BILLING` remains default OFF. Nothing pushed.

---

## 17. Recommended next step

**PPT-1 — Personal-plan read + cancel-at-period-end action** (behind
`ENABLE_PLATFORM_BILLING`, default OFF). It is independent of D1/D2, reuses CS-5's
`previewDowngrade` and CS-3's platform client + route posture, and unblocks the dialog
(PPT-4) and the Settings toggle (PPT-3). Land **D2 (plan revert on cancel)** alongside or
immediately after so a downgraded personal account actually reaches Free at period end.
