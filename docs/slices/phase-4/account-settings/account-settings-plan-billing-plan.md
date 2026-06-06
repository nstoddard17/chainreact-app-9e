# 4.ACCOUNT-SETTINGS-BILLING-1 — Plan & Billing Settings Plan

**Type:** Planning / design only. No source, migrations, tests, Stripe, billing UI,
or enforcement changes in this slice.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[supabase/migrations/20260531000001_account_billing_foundation.sql](../../../../supabase/migrations/20260531000001_account_billing_foundation.sql) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) ·
[services/billing/executionBillingGate.ts](../../../../services/billing/executionBillingGate.ts) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) ·
[services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) ·
[features/team/accountTypeLabel.ts](../../../../features/team/accountTypeLabel.ts) ·
[features/account/AccountSections.tsx](../../../../features/account/AccountSections.tsx) (`BillingSection`) ·
[contracts/accounts.ts](../../../../contracts/accounts.ts) ·
[docs/slices/phase-4/account-billing-rescope-plan.md](../account-billing-rescope-plan.md).

> **Headline:** ChainReact has **no Stripe billing** today — Stripe is only a
> workflow *integration provider*; there is no ChainReact customer, subscription,
> checkout, portal, invoice, or payment-method code anywhere. Billing today is a
> single account-scoped quota root (`account_billing`) with a flat **1 task / run**
> charge and a default **100-task** limit, atomically enforced. There is **no
> plan/tier metadata** — only account `type` (personal / team / organization).
> Ship a **truthful, read-only, active-account-scoped** Plan & billing overview
> from the data we already have (tier label, real task usage, member + folder
> limits). Defer all payments (checkout/portal/invoices/payment method/per-tier
> pricing/downgrade flows) until a real Stripe slice. No fake meters, invoices,
> payment methods, or next-billing dates.

---

## 1. Context

Account Settings is complete through Security & access + password change
(closeout `77a3b3476`). **Plan & billing** is still an honest placeholder
([`BillingSection`](../../../../features/account/AccountSections.tsx)): a read-only
"{Personal|Team|Business} plan" line + "coming soon" Payment method / Invoices.

This plan decides what Plan & billing should show **before** any Stripe work, and
locks the account-level billing/product model so the eventual payments slice
doesn't fight the foundation.

---

## 2. Current billing model (evidence)

**Schema (live):**
- **`account_billing(account_id PK → accounts.id ON DELETE RESTRICT)`** — the
  canonical per-account quota root: `tasks_limit int DEFAULT 100`,
  `tasks_used int DEFAULT 0`, `tasks_reserved int DEFAULT 0`, `period_started_at`,
  timestamps. RLS = membership-based SELECT (`account_billing_select_account_member`);
  **writes are service-role / RPC only** (no user write policy). `set_updated_at`
  trigger wired. One row per account; new team/org rows via
  `initAccountBillingServiceRole`.
- **`user_billing`** — legacy user-scoped twin, running in parallel, scheduled to
  drop at the rescope cutover (-9c). Not the source of truth going forward.
- **Ledgers** (`task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons`)
  — append-only, currently user-scoped, planned to rekey to `account_id` (-9d).

**Helpers (live):** [`repositories/accountBilling.ts`](../../../../repositories/accountBilling.ts)
- `getUsage(accountId) → { tasksUsed, tasksLimit, periodStartedAt } | null` (SSR
  client, RLS-gated by membership) — **real data the UI can show today.**
- `deductTasks / reserveTasks / reconcileReservation / releaseReservation /
  releaseExpiredReservations` (RPC wrappers); reserve/reconcile is built but
  **flag-gated OFF** (`ENABLE_RESERVE_RECONCILE_BILLING=false`).
- [`executionBillingGate(accountId)`](../../../../services/billing/executionBillingGate.ts)
  — the live model: refuse frozen accounts (`account_frozen`); skip in test mode;
  else **flat `deductTasks(accountId, 1)`** per run; refuse on exhaustion
  (`limit_reached`). Bills "the account that owns the workflow, never the actor."

**Enforcement (live):** the deduct RPC does an atomic
`UPDATE … WHERE tasks_used + amount <= tasks_limit RETURNING …` — concurrent
overspend is impossible; a run that would exceed the limit is blocked.

**Tier signal (live):** account `type` only (`personal | team | organization`,
[contracts/accounts.ts](../../../../contracts/accounts.ts)). **No plan/tier table,
no `plan` column, no Free/Pro/Business plan metadata, no `contracts/billing.ts`.**
All accounts initialize with the same default 100-task limit.

**Labels (live):** [`accountTypeLabel`](../../../../features/team/accountTypeLabel.ts)
— `organization → "Business"`, `personal → "Personal"`, `team → "Team"`.

**Member limits (live):** [`memberLimitFor`](../../../../services/accounts/memberLimits.ts)
— `team → 5` (incl. owner), `personal → 1`, `organization → null` (**uncapped today**).
⚠ The product brief says **Business = up to 25 members**; the code caps
organization at `null`. This is an **open decision** (see §17) — do not change it
in this planning slice.

**Folder limits (live):** [`folderLimitFor`](../../../../services/workflowFolders/folderLimits.ts)
— `personal → 10`, `team → 100`, `organization → 250`; max depth 3 all tiers. Its
header already maps Free/Personal→10, Team→100, Business→250, Enterprise→1000-future.

**Stripe (live):** **absent from billing.** No `stripe` dependency; all 250+
"stripe" matches are the *integration provider* (`integrations/stripe/**`, its
tests, and the user-event webhook). [account-billing-rescope-plan.md](../account-billing-rescope-plan.md)
states explicitly: *"There is no ChainReact-billing Stripe integration … nothing
to migrate."* Forward guidance there: a future Stripe customer attaches to
`account_billing.account_id`, never `user_id`.

**Prior decision (docs):** account-level billing is already the locked direction
(account-billing-rescope-plan.md): `account_billing` is the single root; ledgers
+ RPCs key on `account_id`; writes stay service-role/RPC-only; Stripe (when it
lands) hangs off the account. The four-slice rescope (-9a…-9d) is **planned, not
yet shipped** — but the `account_billing` root + `getUsage` already exist and are
enough for a read-only UI.

---

## 3. Product decisions / locked direction

(From the brief; preserved here as constraints for all billing work.)

- Tiers: **Free, Pro, Team, Business, Enterprise.** "Business" is the user-facing
  name for internal `organization`; **never show "Organization"** as a tier.
- **Team & Business are account-level plans, not per-seat subscriptions** at launch.
  Member caps are **plan limits**, not billed seats.
- **Team members do NOT need their own Pro.** Membership ≠ a paid personal seat.
- **Team/Business billing is separate from Personal Pro billing.** A user may hold
  both, but only by **explicit** choice.
- Starting a paid Team/Business from a **Personal Pro** account must offer an
  explicit **"downgrade Personal to Free"** option to avoid accidental double-billing.
- **Team ≤ 5 total members** (incl. owner). **Business = one shared workspace**,
  brief target **≤ 25 members** (⚠ code currently uncapped — §17).
- **Business has no departments/divisions/sub-teams at launch.** Those are an
  **Enterprise** concern later.
- **Team → Business upgrades in place on the same `account_id`** (no new workspace).
  **Business → Enterprise** later, also in place / plan-metadata driven.
- Team/Business/Enterprise are **NOT** separate folder/workspace systems. **Folder
  limits are tier numbers only, not different folder behavior.** Same for member
  limits.
- **The account owns workflows / integrations / runs / billing.**

---

## 4. Recommended plan model

Introduce a **single plan-policy seam** (future, not this slice) that maps a
**tier** → its limits, replacing the two type-keyed helpers as the source of truth:

```
Tier        Members        Folders   Tasks/period   Notes
Free        1              10        (current 100)  personal default
Pro         1              (Pro #)   (Pro #)        personal paid; numbers TBD
Team        5 (incl owner) 100       (Team #)       account-level paid
Business    25 (brief)     250       (Business #)   account-level paid; 1 workspace
Enterprise  config         1000+     config         departments/groups later
```

- **Where it lives later:** a `plan` (and Stripe ids) on `account_billing`, read
  through one `planPolicy` module. `memberLimits.ts` + `folderLimits.ts` already
  flag themselves as "the single seam to change" — fold both into that module when
  plan metadata lands. **Do not** scatter tier logic across features.
- **Today's mapping is `type`-derived** (personal=Free, team=Team, organization=
  Business); Pro and Enterprise have **no internal representation yet**. The UI
  must derive the tier label from `type` and **not** invent a Pro/Enterprise state.
- Task numbers per tier are **unset** today (all 100). They become real only with
  the payments slice; **do not hardcode marketing numbers into the UI now.**

---

## 5. Personal billing behavior

- Today every personal account = **Free**, default 100 tasks, enforced flat 1/run.
  There is **no Pro** state in code yet.
- Plan & billing for a personal account should show: **tier "Free"** (derived),
  **real task usage** (`getUsage`), the **folder limit** (10), and a truthful
  "Upgrade / billing management coming soon" — **no** Pro toggle, price, or upgrade
  button until Stripe + Pro plan metadata exist.
- When Pro lands: Personal can be Free or Pro; Pro is **personal-scoped** and
  independent of any Team/Business the user owns or joins.

---

## 6. Team billing behavior

- A Team account is an account-level plan. Today creating a Team just initializes
  `account_billing` at the **free default** (100 tasks) — **Team creation does NOT
  bill** anything (no Stripe). That is correct and must stay until payments ship.
- Plan & billing for a Team should show: tier **"Team"**, **shared** task usage
  (one meter for the whole account, `getUsage(teamAccountId)`), **member limit**
  (5, incl. owner) with current count, **folder limit** (100), and copy that the
  plan is **billed as one account with shared usage — members don't need Pro**.
- Paid Team billing (price, payment method, invoices) is **deferred** to the Stripe
  slice; show "coming soon", not fake data.

---

## 7. Business billing behavior

- Business = internal `organization`, **one shared business workspace**. Same model
  as Team but larger caps (folders 250; members per §17). **No departments** at launch.
- Plan & billing for a Business should show: tier **"Business"** (never
  "Organization"), shared usage, member limit/count, folder limit (250), same
  "billed as one account, members don't need Pro" copy, payments coming soon.
- **Team → Business is an in-place upgrade on the same `account_id`** (type/plan
  change), not a migration to a new workspace — the billing root, workflows,
  integrations, and folders stay put.

---

## 8. Enterprise behavior

- **No internal representation today** (no account type, no plan metadata).
- Plan & billing must **not** render an Enterprise state from real accounts. At
  most, a static "Need more? Enterprise is coming" informational line — never a
  fake active Enterprise plan.
- Enterprise is where **departments / groups / divisions / sub-teams** and
  config-driven limits arrive later (its own arc), as an in-place upgrade from
  Business.

---

## 9. Account-scoped Plan & billing UI

- **Scope: the ACTIVE account** (recommended — yes). Unlike Security (per-user),
  billing is an **account** concern: the page already resolves the active account;
  pass its id + type + usage into the section. Switching the active account (via the
  switcher) changes what Plan & billing shows.
- Reuse the existing settings primitives (`Panel` / `SettingRow` / read-only rows /
  coming-soon pills). No redesign.
- **Truthful rows only.** Real: tier label, task usage (used / limit + period
  start), member limit + count (team/business), folder limit. Coming-soon: payment
  method, invoices, next billing date, upgrade/downgrade, Pro.

---

## 10. Limits model

| Limit | Source today | Enforced? |
|---|---|---|
| **Tasks / period** | `account_billing.tasks_limit` (flat 100 all tiers) | ✅ atomically at the execution gate (flat 1/run) |
| **Members** | `memberLimitFor(type)` — team 5, personal 1, org null | ✅ at the invite/seat gate |
| **Folders** | `folderLimitFor(type)` — 10 / 100 / 250 | ✅ at folder creation |
| **Folder depth** | `MAX_FOLDER_DEPTH = 3` (all tiers) | ✅ |
| **Per-tier task quotas** | none (all 100) | ❌ not yet (payments) |
| **Pro vs Free** | none (no Pro) | ❌ not yet |
| **Overage / packs / reserve-reconcile** | built, flag-gated OFF | ❌ not active |

- **Folder limits connect to plan** as tier numbers via `folderLimitFor` — same
  behavior, different cap. **Member limits** likewise via `memberLimitFor`.
- **Task/usage limits connect to plan** via `account_billing.tasks_limit`; today a
  flat default, later set per tier by the plan policy.
- **No limit changes in this slice.** The plan only documents the seam.

---

## 11. Stripe / payment status

- **Absent.** Not a dependency; no ChainReact customer/subscription/checkout/portal/
  invoice/payment-method/webhook-for-billing exists. (`integrations/stripe/**` is a
  user workflow provider — unrelated.)
- **Forward-fit (locked by the rescope doc):** when Stripe lands, the customer +
  subscription attach to **`account_billing.account_id`** (columns like
  `stripe_customer_id`, `stripe_subscription_id`, `plan`), never `user_id`.
- **Until then:** the UI shows real usage + limits + a "Billing management coming
  soon" state. No checkout, no portal, no prices.

---

## 12. Downgrade / upgrade flows (conceptual — all future)

- **Personal Pro → Free (the double-billing guard).** When a Personal-Pro user
  starts a paid Team/Business, present an explicit choice at the **checkout/start
  step** (not ambiently in the billing tab):
  1. **Keep Personal Pro** + start the Team/Business paid plan (two charges).
  2. **Downgrade Personal to Free** + start the Team/Business paid plan (one charge).
  Downgrade **keeps personal data/workflows**, just applies Free limits. Shown
  **only** when (a) Pro exists, (b) the user's personal account is Pro, and (c) they
  are starting a paid Team/Business. Entirely gated on Stripe + Pro metadata.
- **Team → Business:** in-place on the same `account_id` (type/plan change). No new
  workspace; billing root + workflows + folders + integrations stay. Member/folder
  caps move to the Business numbers.
- **Business → Enterprise:** in-place later, plan-metadata driven; introduces
  departments/groups.
- **No per-seat billing at launch** — member caps are plan limits, not billed seats.

---

## 13. Account deletion / freeze / billing interactions

- **Freeze (pending_deletion):** the execution gate already refuses frozen accounts
  (`account_frozen`) **before** any deduction — a frozen account consumes no tasks.
  The billing tab should reflect a frozen state (read-only, "account pending
  deletion") rather than offering upgrades.
- **FK:** `account_billing.account_id → accounts.id ON DELETE RESTRICT` — the purge
  path must remove the billing row (and, future, cancel the Stripe subscription)
  before deleting the account. Document for the payments slice; **no change now.**
- **Future paid:** deletion/transfer must cancel/transfer the subscription; a
  pending-deletion Team/Business must not silently keep charging. Out of scope here.

---

## 14. API surface needed later

- **BILL-1 (shippable now, read-only):** `GET /api/account/billing` — active-account
  tier label + usage (`getUsage`) + member limit/count + folder limit. Self/membership
  gated (mirrors the existing account routes). *Optional:* the page can pass this
  data server-side instead of a route (like `getUsage` server reads), avoiding a new
  endpoint for v1.
- **Future (payments):** `POST /api/account/billing/checkout` (Stripe Checkout),
  `POST /api/account/billing/portal` (billing portal), `POST /api/webhooks/stripe-billing`
  (subscription lifecycle → `account_billing.plan`), and a downgrade-choice endpoint
  for the Personal-Pro guard. All account-scoped, owner/admin-gated.

---

## 15. UI expectations

- **Active-account scoped**, truthful, read-only at launch.
- **Show (real):** tier label (Team/Business, never Organization), task usage
  (used / limit + period start), member limit + current count (team/business),
  folder limit. A real usage meter from `account_billing` is encouraged ("usage if
  backed by real data").
- **Coming soon (no fake data):** payment method, invoices, next billing date,
  prices, upgrade/downgrade buttons, Pro toggle.
- **Copy to include:** "Team and Business are billed as one account with shared
  usage — members don't need their own Pro." + "Paid plans & billing management are
  coming soon." + (future-aware) that a Personal-Pro→Free downgrade choice will be
  offered when starting a paid Team/Business.

---

## 16. Test plan (for the implementation slices)

**BILL-1 (read-only):**
- BillingSection renders tier label (Business for `organization`, never "Organization").
- Renders real usage (used / limit) from injected data; no usage shown when
  `getUsage` returns null (non-member / unavailable) — graceful "—", not a fake meter.
- Personal vs Team vs Business branches (member-limit row only for team/business;
  correct folder-limit numbers).
- Coming-soon rows expose **no** working controls (no checkout/portal buttons).
- Active-account scoping: switching active account changes the rendered account.
- Frozen account → read-only "pending deletion" state, no upgrade affordance.

**Future (payments):** checkout/portal route auth + account-scope; webhook →
`account_billing.plan` mapping; downgrade-choice gating (only Personal-Pro starting
a paid Team/Business); Team→Business in-place upgrade preserves `account_id` + data.

---

## 17. Implementation slice breakdown

- **BILL-1 — Read-only Plan & billing (shippable now, no Stripe).** Make
  `BillingSection` show real tier label + task usage (`getUsage(activeAccountId)`) +
  member limit/count + folder limit, with honest "coming soon" for payments. Page
  passes active-account usage/limits (or a thin `GET /api/account/billing`). Tests
  per §16. *Smallest, truthful, unblocks the section.*
- **BILL-RESCOPE (prereq for clean ledgers, already planned)** — the account-billing
  rescope -9a…-9d (user→account ledger keying + RPC fixes). `account_billing` +
  `getUsage` already exist, so BILL-1 does **not** block on this; but ledger-based
  usage history (invoices-lite) does.
- **BILL-PLAN-METADATA — plan policy + tier limits.** Add `plan` (+ per-tier
  member/folder/task numbers) to `account_billing`; fold `memberLimits` +
  `folderLimits` into one plan-policy seam. No payments yet.
- **BILL-PAYMENTS — Stripe.** Customer/subscription on `account_billing`, checkout,
  portal, webhook, per-tier prices, Personal-Pro→Free downgrade choice, Team→
  Business in-place upgrade, deletion/transfer subscription handling.
- **BILL-ENTERPRISE — future.** Departments/groups + config limits; Business→
  Enterprise in-place.

---

## 18. Risks / open questions

- **Business member cap mismatch:** brief says **25**, code caps `organization` at
  **`null` (uncapped)**. Decide the launch number and whether to change
  `memberLimitFor("organization")` (a separate, non-planning slice). **Do not change
  it here.**
- **Pro tier has no representation.** Personal-Pro flows (and the downgrade guard)
  cannot exist until Pro is modeled (plan metadata on `account_billing`). The UI
  must not imply Pro exists.
- **Per-tier task quotas are all 100 today.** Showing a "Team plan" with the same
  100-task limit as Free could mislead — copy must frame the number as the current
  shared quota, not a marketing tier benefit, until plan metadata lands.
- **Usage meter honesty:** `getUsage` returns live counters; fine to show. But the
  reserve/reconcile path is OFF, so `tasks_reserved` should not be surfaced as
  "in-flight" yet.
- **Account-billing rescope not yet shipped:** ledger history (for an
  invoices/usage-history view) is user-scoped until -9d; BILL-1 should rely on
  `account_billing` counters, not the ledgers, for now.
- **db:push debt:** the Notifications migration `20260605000002` is still unapplied
  (see closeout); unrelated to billing but part of the same launch-hygiene sweep.

---

## 19. Acceptance criteria (for this planning slice)

- A committed planning doc at this path; **no** source, migration, test, Stripe,
  billing-UI, enforcement, account-type, member-limit, or folder-limit changes;
  nothing pushed.
- States unambiguously: **Stripe is absent** from ChainReact billing; billing is
  **account-scoped** via `account_billing` with **flat 1-task/run, default 100**,
  atomically enforced; there is **no plan/tier metadata** (only account `type`);
  the recommended launch UI is **read-only, active-account-scoped, truthful** (tier
  label + real usage + member/folder limits) with **no fake** invoices/payment/
  meters; and records the locked product model (account-level plans, members don't
  need Pro, in-place Team→Business→Enterprise, Personal-Pro→Free downgrade guard).
- Gives a concrete slice breakdown (BILL-1 read-only first → plan metadata →
  Stripe payments → Enterprise) and flags the open decisions (Business member cap,
  Pro modeling).

---

## Report summary

- **Current billing model:** account-scoped `account_billing` root (tasks
  limit/used/reserved, default 100), flat 1-task/run via `executionBillingGate`,
  atomic enforcement, `getUsage(accountId)` available. Legacy `user_billing` is
  dropping. **No Stripe, no plan/tier metadata, no `contracts/billing.ts`.** Tier =
  account `type` only; `organization → "Business"`. Member caps (team 5, personal 1,
  org uncapped) + folder caps (10/100/250) live in two helpers; both enforced.
- **Recommended Plan & billing launch scope:** active-account-scoped, **read-only**,
  truthful — tier label, real task usage, member limit/count, folder limit, plus
  "members don't need Pro" + "billing management coming soon". **No** checkout/portal/
  invoices/payment-method/next-billing/fake meters.
- **Recommended billing/product model:** account-level plans (not per-seat); members
  don't need Pro; Team/Business billed as one account with shared usage; in-place
  Team→Business→Enterprise on the same `account_id`; per-tier limits via a single
  plan-policy seam folding the existing member/folder helpers; Stripe (future)
  attaches to `account_billing.account_id`.
- **Downgrade/upgrade recommendation:** at the point of starting a paid Team/Business
  from a Personal-Pro account, force an explicit choice — keep Pro (two charges) or
  downgrade Personal to Free (one charge; keeps data, applies Free limits). Team→
  Business is an in-place upgrade. All gated on Stripe + Pro metadata (future).
- **Implementation breakdown:** BILL-1 read-only (now) → BILL-PLAN-METADATA →
  BILL-PAYMENTS (Stripe) → BILL-ENTERPRISE; account-billing rescope (-9a…-9d) is a
  parallel prereq for ledger-based history only.
- **Open product decisions:** Business member cap (25 vs current uncapped); when/how
  to model the **Pro** tier; per-tier task-quota numbers; whether BILL-1 ships via a
  `GET /api/account/billing` route or server-passed props.
