# 4.BILLING-PLAN-METADATA-1 — Plan Metadata + Stripe Billing Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, Stripe, or
billing-behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-06
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`account_billing` is the account-scoped billing root: `deductTasks`/`reserve`/`reconcile`/`getUsage`/`initAccountBillingServiceRole`) ·
[20260531000001_account_billing_foundation.sql](../../../../supabase/migrations/20260531000001_account_billing_foundation.sql) (`account_billing` columns + RPCs) ·
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (flag pattern: `process.env.ENABLE_* === "true"`, read at call time, default OFF) ·
[services/billing/taskCostPolicy.ts](../../../../services/billing/taskCostPolicy.ts) · [executionBillingGate.ts](../../../../services/billing/executionBillingGate.ts) (1 task/run; bills the workflow's account) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) (`TEAM_MAX_MEMBERS=5`, `BUSINESS_MAX_MEMBERS=25`; TODO to move to plan policy) ·
[services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) (`FOLDER_LIMITS` per `AccountType`; same TODO) ·
[contracts/accounts.ts](../../../../contracts/accounts.ts) (`AccountType = personal | team | organization`) ·
[features/account/AccountSections.tsx](../../../../features/account/AccountSections.tsx) (`BillingSection` — read-only tier label + usage + coming-soon rows) ·
[integrations/stripe/](../../../../integrations/stripe/) (the WORKFLOW Stripe provider — unrelated to platform billing) ·
prior art: [account-billing-rescope-plan.md](../account-billing-rescope-plan.md) · [reserve-reconcile-billing-design.md](../reserve-reconcile-billing-design.md) · [task-cost-billing-model-audit.md](../task-cost-billing-model-audit.md) · [account-deletion-flow-plan.md](../account-deletion-flow-plan.md).

> **Headline:** Keep `account.type` (`personal | team | organization`) as the
> structural **shape**, and add an orthogonal **plan tier** (`free | pro | team |
> business | enterprise`) as billing metadata on the existing account-scoped
> `account_billing` row. Centralize every limit (members, folders, tasks, future
> API/feature gates) in ONE pure **plan-policy** helper that the existing
> `memberLimits`/`folderLimits`/task-limit seams read from — exactly where their
> in-code TODOs already point. Attach Stripe to `account_id` (not `user_id`) via
> additive `account_billing` columns. **The first implementation slice is non-Stripe
> plan metadata + central policy** (additive, limits unchanged); checkout/webhooks/
> lifecycle come later behind a default-OFF `ENABLE_PLATFORM_BILLING` flag. This is
> platform billing — entirely separate from the [`integrations/stripe/`](../../../../integrations/stripe/)
> workflow provider.

---

## 1. Context

The account model is account-scoped and billing already lives at the account level
(`account_billing`, keyed on `account_id`). Limits today are **launch constants keyed
off `account.type`**, with explicit in-code TODOs to move them into plan policy once
plan metadata exists. There is **no ChainReact platform Stripe billing** — new
personal AND team/org accounts all get the same free defaults; the
`account_billing` row carries no plan and no Stripe ids. This plan designs the next
foundation: a plan-tier dimension + central policy + a Stripe attachment model,
sequenced so the riskiest pieces (payments, webhooks) land last and flag-gated.

This fits the closeout's recommended **Track F (plan metadata / Stripe billing)** and
follows the account-model and reserve/reconcile billing arcs (prior-art links above).

---

## 2. Current codebase findings (verified)

- **`account_billing` is the billing root, account-scoped.** Columns (from
  [20260531000001](../../../../supabase/migrations/20260531000001_account_billing_foundation.sql)):
  `account_id`, `tasks_limit int DEFAULT 100`, `tasks_used`, `tasks_reserved`,
  `period_started_at`. **No `plan` column. No Stripe columns.** RLS is
  membership-gated SELECT; mutations go through SECURITY DEFINER RPCs
  (`deduct_tasks_if_available`, `reserve/reconcile/release_*`). Reads via
  `getUsage` (SSR client, RLS).
- **Free is the only tier today.** `initAccountBillingServiceRole`
  ([accountBilling.ts:197](../../../../repositories/accountBilling.ts)) upserts an
  all-defaults row (limit 100) for new team/org accounts and explicitly notes
  *"No Stripe customer / subscription is created — paid-team billing is deferred to
  the payments track."* The signup trigger seeds personal accounts the same way.
- **Limits are `AccountType`-keyed constants with TODOs to move to plan policy.**
  `memberLimits.ts` (`team→5`, `personal→1`, `organization→25`; *"TODO … move the caps
  into plan policy keyed off account_billing/plan … This helper is the single seam to
  change."*) and `folderLimits.ts` (`personal→10`, `team→100`, `organization→250`; same
  TODO). Task limit is the `account_billing.tasks_limit` column.
- **Billing attributes to the account that owns the workflow**, never the actor
  ([executionBillingGate.ts](../../../../services/billing/executionBillingGate.ts) +
  accountBilling header). API-key-triggered runs (FK-4) already flow through this gate.
- **Feature-flag pattern:** `services/billing/billingFeatureFlags.ts` — `process.env
  .ENABLE_<NAME> === "true"`, read at call time, **default OFF**. Reserve/reconcile is
  shipped behind such flags but live billing is still the flat `deduct` path.
- **`AccountType = personal | team | organization`**
  ([contracts/accounts.ts:17](../../../../contracts/accounts.ts)); user-facing labels
  are Personal / Team / **Business** (organization) / Enterprise (future, no type yet).
- **BillingSection is honest read-only** — derives a tier label from `account.type`
  (Free / Team / Business), shows real `account_billing` usage + member/folder caps,
  and renders **coming-soon** rows for Payment method / Invoices / Upgrade. No Stripe.
- **The `integrations/stripe/` code is a WORKFLOW provider** (actions like
  `cancelSubscription`, `capturePaymentIntent` operate on the *end user's* Stripe
  account inside a workflow). It is **unrelated** to ChainReact's own platform billing
  and must not be conflated or reused for it.

---

## 3. Product tier model

Five user-facing tiers; internal `account.type` is unchanged.

| Tier (user-facing) | On account.type | Who | Billing |
|---|---|---|---|
| **Free** | `personal` | default personal account | none |
| **Pro** | `personal` | individual upgrade | per-account subscription |
| **Team** | `team` | shared, ≤5 members incl. owner | per-account (not per-seat) |
| **Business** | `organization` | shared, ≤25 members incl. owner | per-account (not per-seat) |
| **Enterprise** | `organization` (initially) | advanced depts/divisions (future) | custom/contract |

- **Not per-seat at launch** — Team/Business are account-level plans; members never
  need their own Pro.
- **Enterprise** ships later; initially a *plan* on an `organization` account
  (uncapped/config limits). A distinct `account.type = 'enterprise'` is deferred until
  departments/divisions actually need a different structural shape (open decision §16).

---

## 4. Account type vs plan tier model

**Two orthogonal axes — keep them separate.**

- **`account.type`** (`personal | team | organization`) = the **structural shape**:
  membership model, sharing semantics, which UI surfaces exist. Unchanged.
- **`plan`** (`free | pro | team | business | enterprise`) = the **billing tier**:
  what you pay and what limits/features you get.

Valid `(type, plan)` combinations (enforced in central policy, mirrored by a DB CHECK):

| type | allowed plans |
|---|---|
| `personal` | `free`, `pro` |
| `team` | `team` |
| `organization` | `business`, `enterprise` |

This avoids overloading `account.type` with billing meaning (it stays provenance of
*shape*), keeps Team/Business upgrades **in-place on the same `account_id`**, and lets
a personal account move free↔pro without changing its type.

---

## 5. Recommended data model

**Add plan + Stripe columns to the existing `account_billing` row** (1:1 with the
account, already RLS'd and service-role-mutated). No new table at launch.

```
ALTER TABLE public.account_billing
  ADD COLUMN plan text NOT NULL DEFAULT 'free'
    CONSTRAINT account_billing_plan_known
    CHECK (plan IN ('free','pro','team','business','enterprise')),
  ADD COLUMN plan_status text NOT NULL DEFAULT 'active'
    CONSTRAINT account_billing_plan_status_known
    CHECK (plan_status IN ('active','trialing','past_due','canceled','incomplete')),
  ADD COLUMN stripe_customer_id text,          -- one Stripe customer per account
  ADD COLUMN stripe_subscription_id text,       -- current subscription, nullable
  ADD COLUMN current_period_end timestamptz,    -- from Stripe; drives access window
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX account_billing_stripe_customer_idx
  ON public.account_billing (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX account_billing_stripe_subscription_idx
  ON public.account_billing (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
```

- **Backfill:** every existing row → `plan='free'` for personal, and the
  type-appropriate default for shared accounts (`team`/`business`) so current limits
  are preserved. **`tasks_limit` stays the source of truth for the task cap**, but is
  *set from* plan policy at plan-change time (CS-1 keeps the column; policy writes it).
- **No client write path.** Plan/Stripe columns are mutated **service-role / RPC only**
  (webhook + admin), never by an `authenticated` client. Existing `account_billing` RLS
  (membership SELECT) covers reads; the client projection (`getUsage`) is extended to
  expose **`plan` + `plan_status` + `current_period_end` + `cancel_at_period_end`** but
  **never `stripe_customer_id` / `stripe_subscription_id`** (those stay server-only).

### Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| **A. Columns on `account_billing`** (recommended) | ✅ | Already 1:1 with account, already RLS + service-role; no new join; matches the in-code "keyed off account_billing/plan" TODOs. |
| B. New `account_plans` table | ⚠ defer | Only needed for plan **history** / multiple concurrent subscriptions; adds a join + a second RLS surface. Revisit if audit/history is required. |
| C. `plan` on `accounts` table | ❌ | Splits billing state across two tables; `accounts` is identity/shape, not billing. |
| D. Derive tier from `account.type` only (today) | ❌ | Can't express Free vs Pro on one personal account; the current limitation we're removing. |

---

## 6. Central plan policy / limits model

**One pure module** — `core/billing/planPolicy.ts` (no I/O; `core/` may import only
`contracts/`). It is the single seam the existing `memberLimits`/`folderLimits`/task
TODOs point to.

```ts
export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise';

export interface PlanLimits {
  taskLimit: number | null;     // monthly tasks; null = uncapped/config (enterprise)
  memberLimit: number | null;   // total incl. owner; null = uncapped (enterprise)
  folderLimit: number | null;
  // future: apiKeysEnabled, publicApiEnabled, seats, etc.
}

export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = { ... };
export function planLimitsFor(plan: PlanTier): PlanLimits { ... }
export function defaultPlanForAccountType(type: AccountType): PlanTier { ... }
export function isPlanAllowedForType(type: AccountType, plan: PlanTier): boolean { ... }
```

- `memberLimits.memberLimitFor` and `folderLimits.folderLimitFor` are reworked to take
  (or resolve) the account's **plan** and return `planLimitsFor(plan).memberLimit /
  .folderLimit`. The launch numbers are preserved by setting Free/Pro/Team/Business to
  today's values (e.g. team member cap stays 5).
- The task cap continues to live in `account_billing.tasks_limit` but is **written from
  `planLimitsFor(plan).taskLimit`** whenever the plan changes (so the RPC gate stays a
  cheap column read; policy is the source of the number).
- `core/` ESLint guard keeps this pure; the service layer resolves the account's plan
  and passes it in.

---

## 7. Stripe integration model

**Platform Stripe, entirely separate from the workflow provider.**

- **Client:** a dedicated **lazy** platform Stripe client (`lib/stripe/platformClient.ts`
  or similar) — `getPlatformStripeClient()`, never constructed at module load (V2
  lazy-client rule), keyed off `STRIPE_SECRET_KEY` (platform key, distinct from any
  per-user provider credential).
- **Attachment is per `account_id`:** one Stripe **customer** per account
  (`account_billing.stripe_customer_id`), one **subscription**
  (`stripe_subscription_id`). Never per user.
- **Prices:** one Stripe Price per paid plan (pro / team / business; monthly ± yearly),
  resolved from config/env (`STRIPE_PRICE_PRO_MONTHLY`, …) — not hardcoded.
- **Checkout:** Stripe **Checkout Session** (`mode: 'subscription'`) to start a paid
  plan; **Customer Portal** for upgrade/downgrade/cancel/payment-method management
  (avoids building card UI).
- **Webhook:** a NEW route `POST /api/webhooks/stripe-billing` (NOT the provider webhook
  namespace) that verifies the Stripe signature, dedups by event id, and syncs
  `plan` / `plan_status` / `current_period_end` / `cancel_at_period_end` /
  `stripe_subscription_id` into `account_billing` **service-role**. Mirrors the inbound
  webhook-verify discipline used by provider webhooks (signature + dedup), but with its
  own secret + table.
- **No secret ever leaves the server**; the client only sees the projected plan fields
  (§5).

---

## 8. Billing lifecycle

| Stripe event | Effect on `account_billing` |
|---|---|
| `checkout.session.completed` | set `stripe_customer_id`/`stripe_subscription_id`, `plan` = purchased tier, `plan_status='active'`, write `tasks_limit` from policy. |
| `customer.subscription.updated` | sync `plan_status`, `current_period_end`, `cancel_at_period_end`; on plan change, update `plan` + `tasks_limit`. |
| `invoice.payment_failed` | `plan_status='past_due'` (enter grace — §8a). |
| `invoice.payment_succeeded` | `plan_status='active'` (clear past_due). |
| `customer.subscription.deleted` | revert to the type's **free/default** plan + limits; clear subscription id. |

- **§8a Grace + enforcement:** `past_due` keeps the plan's limits during a grace window
  (recommend reuse of `current_period_end` + a fixed grace, e.g. N days), then
  downgrades to free limits if unresolved. Whether `past_due` should *block runs* or
  only *warn* is an open decision (§16) — recommend **warn + keep running through
  grace**, then downgrade (don't hard-stop a paying customer over a transient card
  failure).
- **Idempotency / ordering:** webhook handler dedups by Stripe event id and ignores
  stale events (compare `current_period_end` / event created-at) so out-of-order
  deliveries don't regress state.

---

## 9. Upgrade / downgrade flows

- **In-place on the same `account_id`.** Upgrading a personal account free→pro, or a
  team/org changing plan, never creates a new account or migrates data.
- **Upgrade:** Checkout (new subscription) or Portal (plan switch) → webhook sets the
  higher plan + limits. Immediate.
- **Downgrade:** Portal schedules `cancel_at_period_end` or an immediate plan switch →
  webhook lowers the plan. **Over-cap handling** (e.g. Business→Team with 12 members, or
  more folders than the lower cap allows) is an open decision (§16): recommend
  **block the downgrade until under the new cap** (clear, no data loss), with a
  read-only-grandfather fallback considered later.
- **Team/Business creation upgrade path:** creating a `team`/`organization` account
  starts it on the matching plan (`team`/`business`) and runs Checkout for it; until
  paid it stays on free limits (today's behavior) or a trial (open decision).

---

## 10. Personal Pro vs Team/Business interaction

- Personal and shared accounts are **separate accounts with separate `account_billing`
  rows and separate Stripe subscriptions.** A Personal Pro subscription is independent
  of any Team/Business subscription.
- **When a Personal Pro user creates a Team/Business**, prompt them to choose:
  1. **Keep Personal Pro** — personal subscription untouched; new shared account gets
     its own Team/Business subscription.
  2. **Downgrade Personal to Free** — cancel the personal Pro subscription (at period
     end), personal account returns to free limits; only the shared subscription
     remains.
- This is a **UI choice at team-creation time** that drives a server action; no
  automatic cancellation ever happens without the explicit choice. Membership in a
  Team/Business already grants access without personal Pro (existing rule), so "keep
  Pro" is purely the user's call.

---

## 11. API keys / public API usage billing considerations

- **No per-key billing.** API-key-triggered runs (FK-4) already deduct via
  `executionBillingGate` against the **workflow's account** plan task budget — same as
  manual/webhook/scheduled runs. Plan metadata just makes that budget plan-derived.
- **Public API as a plan feature (open decision §16):** `ENABLE_PUBLIC_API_KEYS` is a
  global server flag today. A future `planPolicy` flag (`publicApiEnabled`) could gate
  the public trigger endpoint to Pro+/Team/Business. Recommend modeling the capability
  in plan policy but keeping the global flag as the master switch.
- **Metered / overage billing** (charging for tasks beyond the plan via Stripe usage
  records) is **deferred** — the plan task cap + the existing gate (refuse on
  exhaustion) is the launch behavior. The reserve/reconcile design
  ([reserve-reconcile-billing-design.md](../reserve-reconcile-billing-design.md)) is the
  substrate if metering lands later.

---

## 12. Account deletion / freeze interaction

- **Freeze (`pending_deletion`)** already makes an account non-operational (the gate
  refuses, management routes reject). Plan changes/upgrades MUST also be refused while
  frozen (mirror the API-key management freeze guard).
- **On deletion request:** schedule the Stripe subscription to `cancel_at_period_end`
  (or cancel immediately, open decision) so a deleted account stops billing. **On
  purge:** cancel the subscription immediately and detach the customer.
- **Cancellation must be idempotent + best-effort** — a Stripe API failure during
  delete must not block the deletion lifecycle (log + retry via a sweep), consistent
  with the deletion-flow design ([account-deletion-flow-plan.md](../account-deletion-flow-plan.md)).

---

## 13. UI expectations (described, not built)

- `BillingSection` evolves from coming-soon to show the **real plan** (`plan` +
  `plan_status` + renewal/`current_period_end`), task usage (already real), and member/
  folder caps (already real, now plan-derived).
- **Manage** = a button that opens the Stripe **Customer Portal** (upgrade/downgrade/
  cancel/payment method) + an **Upgrade** CTA that starts Checkout — both real, both
  behind `ENABLE_PLATFORM_BILLING`. No fabricated card forms or invoices; the Portal
  owns those.
- `past_due` shows an honest "payment needs attention" banner with the Portal link.
- The Personal-Pro-vs-Team/Business choice (§10) is a small dialog at team creation.
- Never surface Stripe ids; Business is never labeled "Organization".

---

## 14. Implementation slice breakdown

Land plan metadata + central policy FIRST (additive, no Stripe, limits unchanged);
keep all payment surfaces behind `ENABLE_PLATFORM_BILLING` (default OFF).

- **CS-1 — Plan metadata + central policy (no Stripe).** `account_billing.plan` column
  + CHECK + backfill (free / type-default, preserving current limits);
  `core/billing/planPolicy.ts`; rewire `memberLimits`/`folderLimits`/task-limit to read
  policy; extend `getUsage` projection with `plan`/`plan_status` (no Stripe ids). Tests.
  **No behavior change** (defaults reproduce today's caps).
- **CS-2 — Stripe attachment + lazy platform client (no checkout).** Add
  `stripe_customer_id`/`stripe_subscription_id`/`current_period_end`/`cancel_at_period_end`
  columns (service-role only); `getPlatformStripeClient()` lazy; price config. No
  user-facing flow yet.
- **CS-3 — Checkout + Customer Portal** behind `ENABLE_PLATFORM_BILLING` (OFF). Create
  customer on first checkout; start subscription; portal session.
- **CS-4 — Webhook `/api/webhooks/stripe-billing`** — signature verify + dedup +
  service-role sync of plan/status/period.
- **CS-5 — Lifecycle + downgrade enforcement** — past_due grace, cancel/revert-to-free,
  over-cap downgrade handling.
- **CS-6 — Personal Pro vs Team/Business choice** flow (server action + dialog).
- **CS-7 — BillingSection UI** (plan display + Manage/Upgrade) behind the flag.
- **Deferred:** metered/overage billing, Enterprise config + possible `account.type`,
  trials, annual pricing, plan-history table, per-seat.

---

## 15. Security / billing risks (security-review lens)

- **Webhook authenticity:** verify the Stripe signature on `/api/webhooks/stripe-billing`
  (reject unsigned/invalid) and **dedup by event id** — an attacker must not be able to
  forge a "subscription active" event to grant a paid plan. Public route, no session.
- **Never trust client-supplied plan.** The server resolves plan **only** from Stripe
  (checkout result / webhook). No route lets an `authenticated` client set `plan`,
  `tasks_limit`, or Stripe ids — those are service-role/RPC writes (existing
  `account_billing` posture).
- **No secret exposure:** `STRIPE_SECRET_KEY` server-only, lazy client; `stripe_*_id`
  columns excluded from the client projection; no key/secret in logs.
- **RLS/GRANT:** new columns inherit `account_billing` RLS (membership SELECT, no client
  write). The client read projection must explicitly omit the Stripe ids (mirror the
  `key_hash`-omitting DTO discipline from the API-keys work).
- **Billing attribution unchanged:** still the workflow's account, never the actor.
- **Race/ordering:** ignore stale webhook events; idempotent customer creation
  (unique index on `stripe_customer_id`) prevents duplicate customers.
- **Freeze:** no upgrades on a frozen account; cancel-on-delete is best-effort and must
  not strand the deletion flow.
- **Lazy client:** module-level `new Stripe()` breaks CI builds — must use the lazy
  accessor (V2 rule).

---

## 16. Test plan (for the implementation slices)

- **CS-1:** `planPolicy` purity + `planLimitsFor`/`defaultPlanForAccountType`/
  `isPlanAllowedForType`; `memberLimitFor`/`folderLimitFor` return policy values; static
  migration guard (plan column + CHECK + backfill); free defaults reproduce today's caps.
- **CS-2:** lazy client never constructs at import; columns service-role only (RLS/GRANT
  gated DB test — no `authenticated` write/read of Stripe ids).
- **CS-3/CS-4:** checkout creates one customer/subscription per account; webhook
  signature verification rejects forged events; dedup; service-role-only sync; stale
  events ignored.
- **CS-5:** past_due grace → keep then downgrade; subscription.deleted → free; downgrade
  blocked while over cap.
- **CS-6:** Personal-Pro-vs-downgrade choice drives the right subscription action; no
  silent cancellation.
- **No-leak:** Stripe ids never in any client response/log; plan can't be escalated via
  a client route; billing still attributes to the account.

---

## 17. Open product decisions

- **Plan column vs `account_plans` table** (§5) — recommend **column**; revisit if plan
  history is required.
- **Enterprise representation** (§3) — plan-only on `organization` first vs a new
  `account.type='enterprise'`. Recommend **plan-only** until departments/divisions need
  a distinct shape.
- **`past_due` behavior** (§8a) — warn + keep running through grace (recommended) vs
  hard-block runs immediately.
- **Downgrade over-cap** (§9) — block until under cap (recommended) vs grandfather
  read-only.
- **Public API as a plan feature** (§11) — gate `ENABLE_PUBLIC_API_KEYS` behind Pro+?
  Recommend modeling a `publicApiEnabled` policy flag but keeping the global master.
- **Trials** for paid plans — offer or not (defer).
- **Metered/overage** task billing (§11) — defer.
- **Annual vs monthly** pricing + the actual price points — a pricing decision, not a
  technical one (defer).
- **Cancel-on-delete timing** (§12) — at period end vs immediate.

---

## 18. Acceptance criteria

**For this planning slice:**
- A committed planning doc at this path; **no** source, migrations, tests, UI, Stripe,
  or billing-behavior changes; nothing pushed.
- Every "current state" claim traces to a file inspected (§2).
- Locks the recommended model: `account.type` unchanged; orthogonal `plan` tier on
  `account_billing`; central `planPolicy` seam; Stripe attached per `account_id`;
  non-Stripe plan-metadata slice first; payments flag-gated default OFF; platform
  billing kept separate from the workflow Stripe provider.

**For the implementation arc (CS-1…CS-7):**
- CS-1 is additive and changes no limits (free defaults reproduce today's caps).
- Plan/Stripe writes are service-role only; Stripe ids never client-readable; webhook
  signature-verified + idempotent; billing still attributes to the account.

---

## 19. Hard boundaries (what this slice did NOT change)

Planning doc only. No source, migrations, schema, tests, UI, Stripe implementation,
or billing behavior changed. `account_billing` is untouched; limits remain
`AccountType`-keyed constants; `ENABLE_*` billing flags unchanged. Nothing pushed.

---

## 20. Recommended next step

**CS-1 — Plan metadata + central plan policy (no Stripe):** add the `account_billing
.plan` column + backfill, create `core/billing/planPolicy.ts`, and rewire the
`memberLimits`/`folderLimits`/task-limit seams to read it — additive, limits unchanged,
no payments. It unblocks every later slice and is the lowest-risk first step.
