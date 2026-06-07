# 4.BILLING-BUSINESS-UPGRADE-1 — Team → Business Upgrade Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, Stripe, or
billing-behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[personal-pro-team-choice-plan.md](./personal-pro-team-choice-plan.md) (D1 = this work) ·
[plan-metadata-stripe-billing-plan.md](./plan-metadata-stripe-billing-plan.md) (account.type vs plan model, §4) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (`ALLOWED_PLANS_BY_TYPE`: team→[team], organization→[business,enterprise]; `isPlanAllowedForType`, `defaultPlanForAccountType`, `planLimitsFor`) ·
[services/accounts/createTeamAccount.ts](../../../../services/accounts/createTeamAccount.ts) + [app/api/accounts/route.ts](../../../../app/api/accounts/route.ts) (`POST` creates `type='team'` ONLY; org "via a future in-place upgrade") ·
[repositories/accounts.ts](../../../../repositories/accounts.ts) (`getByIdServiceRole`, `createTeamAccountServiceRole`, `transferAccountOwnershipServiceRole`, `setDeletionPendingServiceRole` — NO type-mutation function exists) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) (`memberLimitFor(type)` = `planLimitsFor(defaultPlanForAccountType(type)).memberLimit`; team 5 / org 25) ·
[services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) (`folderLimitFor(type)`; team 100 / org 250) ·
[services/billing/platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts) (CS-3 `createCheckoutSession`: `isPlanAllowedForType(account.type, requestedPlan)` → `invalid_plan_for_type`; metadata + `subscription_data.metadata` = {accountId, plan}) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (CS-4/D2: `resolveEvent` drops a plan when `!isPlanAllowedForType(account.type, plan)`; `applyBillingSubscriptionSyncServiceRole` writes `account_billing` only) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`account_billing` 1:1 per account; `applyBillingSubscriptionSyncServiceRole`) ·
[features/account/CheckoutChoiceButton.tsx](../../../../features/account/CheckoutChoiceButton.tsx) (PPT-4, generic over plan) · [lib/api/billingCheckout.ts](../../../../lib/api/billingCheckout.ts) (`startCheckout(accountId, plan)`) ·
[features/team/accountTypeLabel.ts](../../../../features/team/accountTypeLabel.ts) (organization → "Business", never "Organization") ·
[contracts/accounts.ts](../../../../contracts/accounts.ts) (`AccountType = personal | team | organization`).
Prior commits: CS-1 `d9e669e0c` · CS-3 `98028890e` · CS-4 `e9f80dc2e` · CS-5 `e13963a3a` · PPT-4 `020e7883a`.

> **Headline:** Team → Business is an **in-place upgrade on the same `account_id`** — no new
> account, no data migration. The Stripe **webhook is the sole authority** that activates
> Business: on a verified Business subscription whose trusted metadata says
> `{ accountId, plan:'business', targetAccountType:'organization' }`, it **atomically** sets
> `accounts.type='organization'` + `account_billing.plan='business'` + status (one
> transaction, via an RPC). `accounts.type` is **never** flipped before a verified event.
> Member (5→25) and folder (100→250) caps then change **automatically** — the limit seams
> read `account.type` (findings #2/#5), so no separate limit write is needed. Two real code
> blockers exist today (findings #3/#4) and must be addressed: CS-3 checkout and the CS-4
> webhook both **reject `business` on a `team` account**, and **no `accounts.type` mutation
> path exists**. The PPT-4 choice component is already generic over plan, so the Personal-Pro
> dialog integrates unchanged. Business → Team **downgrade is deferred**.

---

## 1. Context

Business upgrade is **D1**, the missing dependency the Personal-Pro choice plan called out:
the "Business" half of that flow is unreachable because the `organization` (Business)
creation/upgrade path does not exist. This doc designs Team → Business as an in-place
upgrade so the billing arc (CS-1…CS-5, PPT-1…PPT-4) can complete its Business surface. It
implements **nothing**. It anchors to two already-decided invariants from the parent plans:
**account-scoped billing** (one customer+subscription per `account_id`) and
**`account.type` = structural shape, `plan` = billing tier, kept orthogonal** (plan-metadata
plan §4): a Team account upgrading to Business changes BOTH (shape `team`→`organization`,
tier `team`→`business`) **in place**.

---

## 2. Current codebase findings (verified)

1. **`account.type` vs `plan` are orthogonal but coupled for shared accounts.** `ALLOWED_
   PLANS_BY_TYPE` ([planPolicy.ts](../../../../core/billing/planPolicy.ts)) pins `team→[team]`
   and `organization→[business, enterprise]`. So "Business plan" structurally requires
   `account.type='organization'`. A Team account on the Business plan is an **invalid**
   `(type, plan)` combination — the upgrade must move both together.

2. **Member + folder caps are derived from `account.type`, not stored.**
   `memberLimitFor(type)` = `planLimitsFor(defaultPlanForAccountType(type)).memberLimit`
   (team 5 / org 25) and `folderLimitFor(type)` (team 100 / org 250). ⇒ **Flipping
   `accounts.type` to `organization` raises both caps automatically** — there is no
   per-account stored cap to migrate. `account_billing.tasks_limit` is the only stored cap;
   business taskLimit = `planLimitsFor('business').taskLimit` (= 100 today, same as team).

3. **CS-3 checkout REJECTS `business` on a `team` account.** `createCheckoutSession`
   ([platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts))
   does `if (!isPlanAllowedForType(account.type, requestedPlan)) return invalid_plan_for_type`.
   `isPlanAllowedForType('team','business')` is **false**. ⇒ The upgrade checkout must be
   explicitly permitted as a recognized team→business **upgrade** (Q2) — the flat check
   blocks it today.

4. **No `accounts.type` mutation path exists.** `repositories/accounts.ts` has create /
   transfer-ownership / deletion-status updaters but **nothing that changes `type`**. ⇒ A new
   **service-role** type updater is required (no client write path on `accounts`).

5. **CS-4 webhook drops a plan disallowed for the type.** `resolveEvent`
   ([stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts)) only sets
   `fields.plan = plan` when `isPlanAllowedForType(account.type, plan)`. For a Business
   subscription event on an account still typed `team`, plan `business` would be **dropped**.
   ⇒ The webhook upgrade path must perform the **type flip first/atomically**, not rely on the
   existing per-field validation.

6. **The webhook writes `account_billing` ONLY.** `applyBillingSubscriptionSyncServiceRole`
   updates `account_billing`; it cannot touch `accounts`. ⇒ An **atomic cross-table** operation
   (RPC) is needed so the type flip and the plan write commit together (finding #2 means a
   half-applied state — plan=business but type=team — would give wrong caps).

7. **PPT-4 `CheckoutChoiceButton` is generic over plan** and `startCheckout(accountId, plan)`
   already accepts `'business'`. ⇒ The Personal-Pro choice dialog integrates with Business
   checkout with **zero component change** — only a mount with `plan='business'` (Q11).

8. **`organization` already maps to "Business"** everywhere user-facing
   ([accountTypeLabel.ts](../../../../features/team/accountTypeLabel.ts), CS-5 billing label).
   ⇒ Once `type` flips, the UI shows "Business" automatically; never "Organization".

---

## 3. Product model

**What it IS:** an in-place tier+shape upgrade of one Team account to Business, on the same
`account_id`. The Stripe Business subscription attaches to that account (CS-2/CS-3 per-account
customer+subscription); a verified webhook flips `accounts.type`→`organization` and
`account_billing.plan`→`business` atomically; member/folder caps rise automatically.

**What it is deliberately NOT:**
- **Not** a new account / workspace. Workflows, integrations, runs, folders, API keys, and
  the billing row all stay on the same `account_id` (no migration).
- **Not** a pre-payment change. `accounts.type` is never flipped before a verified Stripe
  event (no optimistic upgrade).
- **Not** per-seat. Business stays an account-level plan (cap 25, not 25 paid seats).
- **Not** a downgrade. Business → Team is a separate, deferred slice.
- **Not** Enterprise. `enterprise` (custom/contact-sales) is out of scope.

---

## 4. Checkout flow recommendation (Q2)

- Start the Business checkout **from the Team account** (`checkoutAccountId` = the team id),
  `plan='business'`, behind `ENABLE_PLATFORM_BILLING` (default OFF), owner/admin (Q12).
- Because CS-3's flat `isPlanAllowedForType` rejects business-on-team (finding #3), introduce
  a small **upgrade-allow** seam: `isUpgradeAllowed(fromType, toPlan)` in `planPolicy`
  (e.g. `team → business` ✓; everything else not an upgrade). `createCheckoutSession` accepts
  the request when **either** `isPlanAllowedForType(type, plan)` **or** `isUpgradeAllowed(type,
  plan)`. The price still resolves server-side (`STRIPE_PRICE_BUSINESS`); the client never
  sends a price (CS-3 posture unchanged).
- **Metadata carries the upgrade intent** so the webhook can act safely:
  `metadata` + `subscription_data.metadata` = `{ accountId, plan:'business',
  targetAccountType:'organization' }`. This is the ONLY new field vs CS-3.
- Everything else (customer get-or-create, success/cancel urls, returning only `{ url }`)
  is unchanged.

---

## 5. Webhook / source-of-truth recommendation (Q1/Q3)

- **The webhook is the only writer of plan AND type.** No checkout-time mutation (consistent
  with CS-3/CS-4 — checkout success is not proof; the signed event is).
- On `checkout.session.completed` / `customer.subscription.created|updated` where the
  verified metadata is `{ plan:'business', targetAccountType:'organization' }` and the account
  is currently `team`: validate, then call an **atomic upgrade RPC** that sets, in one
  transaction:
  - `accounts.type = 'organization'`
  - `account_billing.plan = 'business'`, `plan_status` (mapped from Stripe status),
    `current_period_end`, `cancel_at_period_end`, `stripe_subscription_id`,
    `stripe_customer_id`, and `tasks_limit = planLimitsFor('business').taskLimit`.
- The per-field `isPlanAllowedForType` drop (finding #5) is bypassed **only** on this
  recognized upgrade path — the RPC re-validates `(targetAccountType='organization' AND
  plan='business')` server-side before writing, so a forged "business" metadata on a
  non-upgrade event can't escalate type.
- Idempotent: the existing `stripe_billing_events` dedup + an already-`organization` /
  already-`business` no-op make replays safe.

---

## 6. Data / model changes needed (Q4)

- **New service-role type updater** + an **atomic upgrade RPC** (the only migration):
  `apply_business_upgrade(p_account_id, p_plan_status, p_current_period_end,
  p_cancel_at_period_end, p_subscription_id, p_customer_id)` — a SECURITY DEFINER function that
  updates `accounts.type` and `account_billing` in one transaction, guarded to only act when
  the account is currently `team` (no-op otherwise). REVOKE from public/anon/authenticated;
  GRANT EXECUTE to `service_role` (mirrors the existing billing RPCs).
- **No pending-upgrade table/column for v1.** Metadata-on-subscription + the webhook flip is
  sufficient (Q4); an abandoned checkout simply never fires the event (Q5). A
  `pending_upgrade` column was considered (to render "upgrade in progress" between redirect
  and webhook) and is **deferred** — it's a UX nicety, not required for correctness, and would
  add a second source of truth.
- **No data migration**: all account-owned rows keep their `account_id` (finding #2 — caps are
  derived, not stored).

---

## 7. Account type transition (Q1/Q6)

- **team → organization, only on a verified event, atomically with the plan write** (§5).
- **Q6 — Stripe succeeds but the account update fails:** the RPC is one transaction, so it
  either fully applies or not. If the RPC throws, the webhook returns non-2xx → Stripe retries
  → the dedup ledger + the `team`-guard make the retry safe (re-apply or no-op). We **never**
  end in plan=business / type=team (the half-state that would mis-size caps).
- The flip is **idempotent**: an account already `organization` on `business` is a no-op.

---

## 8. Plan / limit transition (Q8/Q9)

- **Member cap 5 → 25 (Q8)** and **folder cap 100 → 250 (Q9)** happen **automatically** the
  instant `accounts.type` becomes `organization`, because `memberLimitFor`/`folderLimitFor`
  read the type (finding #2). **Immediate after webhook success**, no separate write, no data
  change. The CS-5 BillingSection then shows "Business / 25 members / 250 folders" with no UI
  logic change (it already reads these seams).
- `account_billing.tasks_limit` is set from `planLimitsFor('business').taskLimit` in the same
  RPC (= 100 today; correct if business diverges later).

---

## 9. Personal Pro choice integration (Q11)

- **Zero new dialog work.** PPT-4 `CheckoutChoiceButton` is generic over plan (finding #7).
  Mounting it with `plan='business'`, `checkoutAccountId` = the Team account, and
  `personalAccountId` = the user's personal account makes the Business upgrade trigger the
  **same** Personal-Pro choice (Keep / Downgrade-personal-to-Free-at-period-end) before the
  Business checkout, exactly as for Team. No change to the component or the choice flow.

---

## 10. UI expectations (Q10/Q12, described not built)

- On a **Team** account's Account Settings → Plan & billing (owner/admin, `ENABLE_PLATFORM_
  BILLING` ON, not frozen): a real **"Upgrade to Business"** affordance = the PPT-4
  `CheckoutChoiceButton` with `plan='business'`. This is the natural home and is part of the
  same billing-UI mount work as CS-7; no pricing-table redesign.
- After the webhook flips the account, the existing CS-5 BillingSection renders **Business**,
  25-member / 250-folder caps, and the lifecycle banner — **no new UI** beyond the upgrade
  button (label "Business", never "Organization").
- **Q12 — owner-only vs owner/admin:** recommend **owner/admin** for consistency with the
  CS-3 checkout route and PPT-1 routes. Changing `account.type` is structural, so owner-only
  is a defensible stricter alternative (open decision §13).

---

## 11. Security / billing risks (security-review lens)

- **Type escalation via forged metadata:** the metadata lives on a **signature-verified**
  Stripe subscription that **our own** checkout created — but the webhook must still
  re-validate server-side (`targetAccountType='organization'` AND `plan='business'` AND the
  account is currently `team`) inside the RPC before flipping type. Never derive a type change
  from arbitrary event metadata on a non-upgrade event. A `business`-metadata event for an
  already-`organization` account is a no-op (idempotent), not a re-escalation.
- **Atomicity (finding #6):** type + plan must commit together (single RPC/transaction) so caps
  are never mis-sized. This is the central correctness risk.
- **Service-role only:** `accounts.type` and the upgrade RPC are service-role; no client write
  path on `accounts`. The checkout route stays owner/admin + account-scoped + freeze-rejecting;
  the client never sends a price or a type.
- **No-leak:** checkout still returns only `{ url }`; no Stripe id is exposed (CS-2/CS-3 posture).
- **Freeze:** a frozen (`pending_deletion`) account must not upgrade — CS-3 checkout already
  freeze-rejects; the webhook RPC should also no-op on a frozen account (defense-in-depth).
- **Webhook authenticity + idempotency:** unchanged from CS-4 (signature verify + dedup);
  the upgrade adds the cross-table RPC behind that same gate.
- **Downgrade safety is NOT introduced here** (Q13) — see deferral. Until a downgrade slice
  ships, a canceled Business subscription does **not** revert type (avoids stranding members
  over a Team cap with no migration path).

---

## 12. Implementation slice breakdown (future — not this slice)

Each small, flag-gated (`ENABLE_PLATFORM_BILLING`, default OFF):

- **BU-1 — Atomic upgrade primitive.** Migration: `apply_business_upgrade` RPC (team-guarded,
  service-role) + a `setAccountTypeServiceRole` repo helper. Static + gated DB tests
  (team→organization + plan=business atomically; no-op when not team / frozen). No wiring.
- **BU-2 — Checkout permits the upgrade.** `isUpgradeAllowed(team,'business')` in planPolicy;
  `createCheckoutSession` accepts business-on-team and writes `targetAccountType` metadata.
  Tests: team can start business checkout; non-upgrade cross-type still rejected; price still
  server-resolved; no type mutation at checkout.
- **BU-3 — Webhook applies the upgrade.** On a verified business event with the upgrade
  metadata, call `apply_business_upgrade`. Tests: team→organization+business on verified event;
  idempotent replay; forged/non-upgrade business metadata does not escalate type; team/org
  unaffected otherwise; freeze no-op.
- **BU-4 — UI.** Mount the PPT-4 `CheckoutChoiceButton` (plan='business') as "Upgrade to
  Business" on a Team account (owner/admin, flag ON). Tests: button shown only when eligible;
  Personal-Pro dialog still integrates; Business label.
- **Deferred (separate slices):** Business → Team **downgrade** (BU-5: reuse CS-5
  `evaluateDowngrade(target='team')` for over-cap — block when members > 5 or folders > 100 —
  + type revert on `subscription.deleted`); pending-upgrade UX state; Enterprise; proration.

---

## 13. Test plan (for the implementation slices)

- **Atomic upgrade (BU-1):** RPC flips `accounts.type`→organization AND `account_billing.plan`
  →business + tasks_limit in one transaction; no-op when account is not `team` or is frozen;
  idempotent.
- **Checkout (BU-2):** a Team owner/admin can start a `business` checkout; the metadata carries
  `targetAccountType='organization'`; a non-upgrade cross-type request still 400s; price is
  server-resolved; checkout does NOT mutate type/plan.
- **Webhook (BU-3):** verified business event → atomic upgrade; replay idempotent; an event
  whose metadata claims business but isn't a recognized upgrade does NOT change type; team/org
  plans without upgrade metadata behave as CS-4; frozen account no-op.
- **Limits (BU-1/BU-3):** post-upgrade `memberLimitFor`/`folderLimitFor` return 25 / 250 with
  no extra write.
- **UI (BU-4):** "Upgrade to Business" appears only for an eligible Team account; the
  Personal-Pro choice dialog fires for a paid-Pro personal user; Business label never
  "Organization".
- **No-leak / security:** no Stripe id in any response; type writes are service-role only;
  forged metadata can't escalate type.

---

## 14. Open decisions

- **O1 — owner-only vs owner/admin (Q12):** recommend **owner/admin** (route consistency);
  owner-only is the stricter alternative for a structural type change. *Recommendation:
  owner/admin.*
- **O2 — pending-upgrade state (Q4):** recommend **none** for v1 (metadata + webhook). Add a
  `pending_upgrade` column only if the "upgrade in progress" UX between redirect and webhook
  proves necessary. *Recommendation: defer.*
- **O3 — RPC vs two-write (Q6):** recommend a single **SECURITY DEFINER RPC** for atomicity
  over two sequential service-role writes (which could half-apply). *Recommendation: RPC.*
- **O4 — `subscription.deleted` for Business (Q7):** recommend **mirror CS-4** for now
  (`plan_status='canceled'`, LEAVE plan + type) until the downgrade slice handles type revert
  + over-cap. *Recommendation: no type revert yet.*
- **O5 — Downgrade Business → Team over-cap (Q13):** recommend reuse of CS-5
  `evaluateDowngrade('team')` to **block** when over 5 members / 100 folders; deferred slice.
- **O6 — Trials / proration on upgrade:** Stripe-config decision; defer.

---

## 15. Acceptance criteria

**For this planning slice:** a committed doc at this path; no source/migrations/tests/UI/
Stripe/behavior changes; nothing pushed. Every current-state claim traces to a file (§2),
including the three that shape the plan: **no type-mutation path** (#4), **checkout+webhook
reject business-on-team** (#3/#5), and **caps are type-derived** (#2). Locks the model:
in-place same-`account_id` upgrade; webhook-authoritative atomic `type`+`plan` flip; no
pre-flip; caps auto-update; PPT-4 reused; downgrade deferred.

**For the implementation arc (BU-1…BU-4):** type flips only on a verified, re-validated event;
type+plan are atomic; forged metadata can't escalate type; caps become 25/250 with no data
migration; checkout/webhook stay owner/admin + service-role + flag-gated; nothing is pushed
without the flag.

---

## 16. Hard boundaries (what this slice did NOT change)

Planning doc only. No source, migrations, schema, tests, UI, Stripe code, or billing behavior
changed. `accounts`, `account_billing`, the CS-3 checkout route, and the CS-4 webhook are
untouched. `ENABLE_PLATFORM_BILLING` remains default OFF. Nothing pushed.

---

## 17. Recommended next step

**BU-1 — the atomic upgrade primitive** (`apply_business_upgrade` RPC + `setAccountType
ServiceRole`, migration + gated DB tests, no wiring). It is the correctness foundation
(finding #6 atomicity) that BU-2 (checkout) and BU-3 (webhook) build on, and is independently
testable without touching the live checkout/webhook paths.
