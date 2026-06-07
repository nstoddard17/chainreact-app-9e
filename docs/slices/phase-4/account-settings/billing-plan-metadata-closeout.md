# 4.BILLING-PLAN-METADATA-CLOSEOUT — Billing Plan Metadata + Stripe Foundation

**Type:** Closeout / handoff. **Docs-only — no source, migrations, tests, or UI changed in
this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`
**Arc range:** `66bedf73b` (2026-06-06) → `7a888a155` (2026-06-07)

> **Update (2026-06-07, docs-only, slice `853c26390`):** the two billing UI affordances this
> closeout listed as deferred — Personal Free → Pro upgrade and Manage Billing portal — have
> since shipped behind `ENABLE_PLATFORM_BILLING` (still default OFF). See §6 (UI behavior), §7
> (deferred — item now resolved), §9 (Track C narrowed), and the
> [go-live checklist](./platform-billing-go-live-checklist.md). No backend route, webhook,
> Stripe client, schema, pricing, metering, or plan-sync behavior changed in that UI slice.

**Source of truth (the shipped code this closeout describes):**
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) ·
[core/billing/billingLifecycle.ts](../../../../core/billing/billingLifecycle.ts) ·
[core/billing/downgradeRules.ts](../../../../core/billing/downgradeRules.ts) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) ·
[repositories/stripeBillingEvents.ts](../../../../repositories/stripeBillingEvents.ts) ·
[services/billing/platformStripeClient.ts](../../../../services/billing/platformStripeClient.ts) ·
[services/billing/platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) ·
[services/billing/platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) ·
[services/billing/personalPlan.ts](../../../../services/billing/personalPlan.ts) ·
[services/billing/downgradePreview.ts](../../../../services/billing/downgradePreview.ts) ·
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) ·
[app/api/accounts/[id]/billing/checkout/route.ts](../../../../app/api/accounts/[id]/billing/checkout/route.ts) · [portal/route.ts](../../../../app/api/accounts/[id]/billing/portal/route.ts) · [personal/route.ts](../../../../app/api/accounts/[id]/billing/personal/route.ts) ·
[app/api/webhooks/stripe-billing/route.ts](../../../../app/api/webhooks/stripe-billing/route.ts) ·
[features/account/BillingSection.tsx](../../../../features/account/BillingSection.tsx) · [PersonalPlanPanel.tsx](../../../../features/account/PersonalPlanPanel.tsx) · [BusinessUpgradePanel.tsx](../../../../features/account/BusinessUpgradePanel.tsx) · [CheckoutChoiceButton.tsx](../../../../features/account/CheckoutChoiceButton.tsx) ·
plans: [plan-metadata-stripe-billing-plan.md](./plan-metadata-stripe-billing-plan.md) · [personal-pro-team-choice-plan.md](./personal-pro-team-choice-plan.md) · [business-upgrade-plan.md](./business-upgrade-plan.md).

---

## 1. Summary

A complete **platform billing foundation**, shipped end-to-end but **dark** behind
`ENABLE_PLATFORM_BILLING` (default OFF):

- **Plan metadata** (`free/pro/team/business/enterprise` + status) lives on `account_billing`.
- A **central plan policy** (`core/billing/planPolicy.ts`) is the single seam for tier limits.
- **Stripe attachment columns** + a **lazy, server-only platform Stripe client** + price config.
- **Checkout + Customer Portal** routes (owner/admin, account-scoped, flag-gated, freeze-rejecting).
- A **signature-verified, deduped Stripe billing webhook** that is the sole authority on subscription state.
- **Warning-first lifecycle** (past_due / canceled warn, never block) + a pure downgrade-validation rule.
- **Personal Pro** read + cancel-at-period-end backend and an Account Settings toggle UI; personal `subscription.deleted` reverts the personal plan to Free.
- A **pre-checkout Personal-Pro choice dialog** (Keep / Downgrade-at-period-end).
- **Team → Business upgrade** end-to-end: checkout permits + stamps upgrade metadata → webhook applies an **atomic type+plan flip** via a service-role RPC → UI exposes "Upgrade to Business".
- `ENABLE_PLATFORM_BILLING` remains **default OFF**. **Nothing was git-pushed.**

---

## 2. Completed commit chain

```
66bedf73b — docs(billing): plan metadata + Stripe billing plan (4.BILLING-PLAN-METADATA-1)              (2026-06-06)
d9e669e0c — feat(billing): plan metadata + central plan policy (CS-1)                                   (2026-06-06)
b7d27ba90 — feat(billing): Stripe attachment columns + lazy platform Stripe client (CS-2)               (2026-06-06)
98028890e — feat(billing): platform checkout + customer portal routes (CS-3)                            (2026-06-06)
e9f80dc2e — feat(billing): platform billing Stripe webhook (CS-4)                                       (2026-06-06)
e13963a3a — feat(billing): billing lifecycle warnings + downgrade validation (CS-5)                     (2026-06-07)
b9b8e9294 — docs(billing): Personal Pro vs Team/Business choice plan (PPT-PLAN)                          (2026-06-07)
075485c26 — feat(billing): personal-plan read + cancel-at-period-end + personal cancel revert (PPT-1+D2)(2026-06-07)
042b4fb85 — feat(billing): Account Settings personal-plan toggle UI (PPT-3)                              (2026-06-07)
020e7883a — feat(billing): pre-checkout Personal Pro choice dialog (PPT-4)                              (2026-06-07)
a0a1b68d8 — refactor(account): extract BillingSection + shared rows from AccountSections (BILLING-REFACTOR-1)(2026-06-07)
06b3c7894 — docs(billing): Team → Business upgrade plan (4.BILLING-BUSINESS-UPGRADE-1)                   (2026-06-07)
cd849a9d7 — feat(billing): atomic Team → Business upgrade primitive (BU-1)                               (2026-06-07)
242bedf8d — feat(billing): allow Team to start Business checkout + upgrade metadata (BU-2)               (2026-06-07)
10915bf49 — feat(billing): webhook applies Team → Business upgrade on verified metadata (BU-3)          (2026-06-07)
7a888a155 — feat(billing): mount Upgrade to Business in billing UI (BU-4)                                (2026-06-07)
```

(PPT-3 `042b4fb85` predates the BILLING-REFACTOR `a0a1b68d8` chronologically; the refactor
extracted `BillingSection` out of `AccountSections.tsx` after PPT-3 pushed it over the
max-lines warning.)

---

## 3. Current behavior

- **Tiers:** `free / pro / team / business / enterprise` carried on `account_billing.plan`
  (+ `plan_status`). Limits centralized in `planPolicy` — **Team 5 / Business 25 members**,
  **Team 100 / Business 250 folders** (personal 1 member / 10 folders; task cap 100 across
  tiers today). The member/folder seams DERIVE caps from `account.type`.
- **Account Settings → Plan & billing** shows the explicit stored plan (Business labeled
  "Business", never "Organization"), real usage + caps, and lifecycle banners.
- **Checkout + Portal** routes are **owner/admin**, account-scoped, freeze-rejecting, and
  return **only `{ url }`**. Behind `ENABLE_PLATFORM_BILLING` (OFF → 404).
- **Webhook is the source of truth** for `plan / plan_status / current_period_end /
  cancel_at_period_end / stripe ids`. No route mutates these.
- **`past_due` warns and keeps running** (no run-blocking). **`canceled` warns**, no
  auto-delete, no auto-downgrade.
- **Personal Pro** can be scheduled to **cancel at period end** (set/undo) from the settings
  panel; the only mutation is the Stripe flag (plan/status stay webhook-authoritative).
- **Personal `subscription.deleted` reverts** the personal plan to **Free** (+ resets
  tasks_limit from policy); team/org keep their plan on delete (no revert — deferred).
- **Team → Business upgrade is in-place on the same `account_id`** — checkout starts it
  (plan `business` + `targetAccountType:'organization'` metadata), and the upgrade
  **completes only after a verified Stripe event** flips `accounts.type`→organization +
  `account_billing.plan`→business atomically. Caps rise to 25/250 automatically.

---

## 4. Security / no-leak guarantees

- **Stripe secret key is server-only** — lazy client (`getPlatformStripeClient`), closure-captured, never a property, never logged, never in the browser bundle.
- **Stripe customer/subscription ids are omitted from every client projection.** `getUsage` / the personal-plan read / route responses return booleans/dates only; the ids are read via service-role helpers and never leave the server.
- **Checkout/portal/personal routes return only a Stripe URL or safe booleans/dates** — no Stripe id, no secret.
- **Webhook verifies the Stripe signature over the RAW body** (300s replay tolerance) with the dedicated `STRIPE_BILLING_WEBHOOK_SECRET` — no processing before verification; fails closed when the secret is unset.
- **Durable event dedup** (`stripe_billing_events`, event_id PK, service-role only) makes processing idempotent.
- **Client cannot choose a price id** (server resolves from `STRIPE_PRICE_*`) and **cannot directly set plan / type / status** (no client write path; webhook-authoritative).
- **The Team → Business type+plan flip is atomic** via the service-role `apply_business_upgrade` RPC (SECURITY DEFINER, `search_path=public`, REVOKE from public/anon/authenticated, GRANT service_role only), re-validating team + not-frozen — **forged/mismatched metadata cannot escalate account type** (it falls through to normal sync, which drops a type-disallowed plan).
- **Owner/admin + freeze gates** on all management routes; non-members get a no-leak 403.
- **No per-seat billing, no task-metering change** (beyond the upgrade primitive setting `tasks_limit` from policy), and **the workflow-provider Stripe integration (`integrations/stripe/`) was not touched.**

---

## 5. Data / RLS / model notes

- **`account.type` stays structural** (`personal | team | organization`); **`plan` is the billing tier** (`free/pro/team/business/enterprise`). `organization` is user-facing **Business**.
- **Stripe attaches per `account_id`** — one customer + one subscription per account (`account_billing.stripe_customer_id` / `stripe_subscription_id`, partial unique indexes). Team → Business reuses the **same `account_id`** (no new account, no data migration).
- **`account_billing` plan/status are webhook-authoritative.** Writes are service-role / RPC only; the membership-gated SELECT RLS is unchanged (Stripe ids excluded at the application projection, not RLS — they are reference ids, not secrets; the real secret never touches the DB).
- **Migrations in this arc (all CREATE-no-new-RLS-table except the dedup table) were applied via `npm run db:push`:**
  - `20260611000000_account_billing_plan_metadata.sql` (CS-1) — **applied** (verified by CS-2/CS-5 building on it + passing tests; db:push run in CS-1's slice).
  - `20260612000000_account_billing_stripe_attachment.sql` (CS-2) — **applied this session** (gated DB tests passed).
  - `20260613000000_stripe_billing_events.sql` (CS-4) — **applied this session** (service-role-only dedup table; deny-all RLS; gated DB tests passed).
  - `20260614000000_apply_business_upgrade.sql` (BU-1) — **applied this session** (service-role-only RPC; gated DB tests passed, incl. authenticated-cannot-EXECUTE).
  - **No unapplied migrations** in this arc.
- **Feature flag:** `ENABLE_PLATFORM_BILLING` — **default OFF** (only ON when `=== "true"`). Wired to the checkout/portal/personal route gates and the UI panels.

---

## 6. UI behavior

- **Plan & billing** read-only overview (tier / usage / member + folder caps), Business never "Organization".
- **Lifecycle banners** (CS-5) — warn-first copy for past_due / canceled / trialing / cancel-at-period-end + a "Renews on / Access ends" dated row.
- **PersonalPlanPanel** (PPT-3) — for an owner/admin on a personal account (flag ON): schedule/undo cancel-at-period-end, with over-limit blockers; read-only when frozen.
- **BusinessUpgradePanel** (BU-4) — for an owner/admin on a non-frozen Team account (flag ON): "Upgrade to Business" with capacity copy.
- **PersonalUpgradePanel** (4.PLATFORM-BILLING-UI-1 / `853c26390`) — for an owner/admin on a non-frozen **personal** account whose current plan is **Free** (flag ON): "Upgrade to Pro". Wraps `CheckoutChoiceButton` with the personal account as both checkout + personal id, so the Personal-Pro choice dialog is skipped (no self-conflict) and it goes straight to the `pro` checkout. Copy is **mechanics-only** and honestly does NOT claim extra capacity — Pro currently shares Free's caps in `planPolicy.ts`.
- **ManageBillingButton** (4.PLATFORM-BILLING-UI-1 / `853c26390`) — for an owner/admin (flag ON, not frozen) **only when a subscription is synced** (`currentPeriodEnd` set — written solely by the CS-4 webhook, a reliable "Stripe customer exists" signal). Opens the existing CS-3 Customer Portal route; a `no_customer` (409) shows honest "available after you start a paid plan" copy, not an error. When shown, it suppresses the contradictory "Payment method"/"Invoices" coming-soon rows.
- **CheckoutChoiceButton** (PPT-4) — runs the Personal-Pro choice dialog (Keep / Downgrade-at-period-end) before a Team/Business checkout when the viewer has Personal Pro; skips the dialog when the checkout account IS the personal account (the path PersonalUpgradePanel uses).
- **No pricing table, no fake/unsupported controls** — every button maps to a real, flag-gated route; the section renders no Stripe customer/subscription id.

---

## 7. Deferred / known limitations

- **`ENABLE_PLATFORM_BILLING` is still OFF** — the whole surface is dark until it's flipped.
- **`STRIPE_*` env vars are present-but-BLANK in `.env.example`** (`STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO/TEAM/BUSINESS`) — a paid checkout returns `price_not_configured` / `stripe_not_configured` until set.
- **No production go-live checklist / env-readiness plan** yet.
- **No Business → Team downgrade** (CS-5 `evaluateDowngrade` exists as the gate; the flow + type-revert-on-cancel are not built — Business `subscription.deleted` currently only sets `canceled`, plan/type left).
- **No Enterprise checkout** (contact-sales; no price id).
- **No per-seat billing, no metered/overage, no annual pricing or trials, no full pricing table.**
- **No payment-failure enforcement / run-blocking** (past_due is warn-only by decision).
- **No customer-support / admin billing tools.**
- **No billing-specific audit notifications** added in this arc (the API-keys audit-notification work is separate).
- ~~**`CheckoutChoiceButton` is not yet mounted for the personal Pro upgrade path**~~ — **RESOLVED** in slice `853c26390` (4.PLATFORM-BILLING-UI-1): `PersonalUpgradePanel` now mounts the personal Free → Pro upgrade and `ManageBillingButton` mounts the portal, both flag-gated. Still deferred: a full pricing/plan-comparison table (see §9 Track C).

---

## 8. Verification baseline

**Run THIS session** at the final arc commit (`7a888a155`, BU-4; working tree unchanged since):

- **Full `npx jest` → 16,350 passed / 0 failed** (143 skipped = opt-in gated DB tests). Measured this session during BU-4.
- **`npm run typecheck` → clean** (run this session).
- **`npm run lint` → 0 errors** (18 pre-existing warnings, all in files untouched by this arc; the transient max-lines warning PPT-3 introduced was removed by the BILLING-REFACTOR). Run this session.
- **`npm run lint:structure` → OK** · **`npm run lint:migrations` → OK** (run this session).
- **Gated DB tests (`ALLOW_DB_INTEGRATION_TESTS=true`) run this session:** CS-2 attachment (4), CS-4 dedup table (4), BU-1 upgrade RPC (6) — all passed against the applied dev DB.

**Not re-run for this closeout:** no commands were run *for the closeout itself* (it is docs-only and the tree is unchanged since BU-4). The numbers above are the BU-4 measurements, not re-measured here.

**Migrations:** all four arc migrations **applied** (see §5) — none unapplied. **Flag:** `ENABLE_PLATFORM_BILLING` **OFF**.

---

## 9. Recommended next tracks

- **A. Platform billing go-live checklist / env-readiness plan** — Stripe keys, webhook endpoint registration, `STRIPE_PRICE_*` ids, the flag-flip runbook. *(Pick first if launch readiness is the goal.)*
- **B. Business → Team downgrade plan** — reuse `evaluateDowngrade('team')` for over-cap blocking + type-revert-on-cancel. *(Pick first if product completeness is the goal.)*
- **C. BillingSection pricing / upgrade UI polish** — ~~personal free→Pro upgrade mount~~ ✓ + ~~Manage (portal) button~~ ✓ shipped in `853c26390`; remaining: a full plan-comparison / pricing table. *(Pick first if UX polish is the goal.)*
- **D. Enterprise / contact-sales plan.**
- **E. Payment-failure enforcement policy** (if/when past_due should escalate beyond warn).
- **F. Metered usage / overage planning.** *(Pick first if monetization depth is the goal.)*
- **G. Final local baseline + PR prep** when Marcus asks.

**Recommended next (default):** **Track A — go-live checklist / env-readiness plan.** The
foundation is complete and dark; the highest-leverage next step is the runbook that makes it
safely flippable (keys, webhook registration, price ids, the flag flip), since every other
track presupposes the feature can actually be turned on.

---

## 10. Closeout confirmation

**Docs-only. Nothing pushed.** Doc path:
`docs/slices/phase-4/account-settings/billing-plan-metadata-closeout.md`.
