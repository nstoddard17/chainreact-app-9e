# 4.PLATFORM-BILLING-GO-LIVE-1 — Platform Billing Go-Live Checklist / Env-Readiness Plan

**Type:** Planning / checklist only. **No source, migrations, tests, UI, env files, Stripe
dashboard, or behavior changed in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — each file was read for this checklist):**
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (the `ENABLE_PLATFORM_BILLING` flag, default OFF) ·
[services/billing/platformStripeClient.ts](../../../../services/billing/platformStripeClient.ts) (lazy server-only secret-key client; `STRIPE_SECRET_KEY`) ·
[services/billing/platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) (`STRIPE_PRICE_PRO/TEAM/BUSINESS` resolver) ·
[services/billing/platformBillingSessions.ts](../../../../services/billing/platformBillingSessions.ts) (checkout + portal session creation, `NEXT_PUBLIC_APP_URL` redirect base) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (verify → dedup → sync; `STRIPE_BILLING_WEBHOOK_SECRET`) ·
[services/billing/personalPlan.ts](../../../../services/billing/personalPlan.ts) (personal-plan read + cancel-at-period-end) ·
[integrations/_shared/stripe/webhooks/signature.ts](../../../../integrations/_shared/stripe/webhooks/signature.ts) (HMAC verify, 300s replay tolerance) ·
[app/api/accounts/[id]/billing/checkout/route.ts](../../../../app/api/accounts/[id]/billing/checkout/route.ts) · [portal/route.ts](../../../../app/api/accounts/[id]/billing/portal/route.ts) · [personal/route.ts](../../../../app/api/accounts/[id]/billing/personal/route.ts) ·
[app/api/webhooks/stripe-billing/route.ts](../../../../app/api/webhooks/stripe-billing/route.ts) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (tiers + limits) ·
[features/account/BillingSection.tsx](../../../../features/account/BillingSection.tsx) · [PersonalPlanPanel.tsx](../../../../features/account/PersonalPlanPanel.tsx) · [BusinessUpgradePanel.tsx](../../../../features/account/BusinessUpgradePanel.tsx) · [CheckoutChoiceButton.tsx](../../../../features/account/CheckoutChoiceButton.tsx) · [PersonalUpgradePanel.tsx](../../../../features/account/PersonalUpgradePanel.tsx) _(853c26390)_ · [ManageBillingButton.tsx](../../../../features/account/ManageBillingButton.tsx) _(853c26390)_ ·
`.env.example` (lines 14–26: `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_PRO/TEAM/BUSINESS`; line 126: `NEXT_PUBLIC_APP_URL`) ·
migrations: `20260611000000_account_billing_plan_metadata.sql` · `20260612000000_account_billing_stripe_attachment.sql` · `20260613000000_stripe_billing_events.sql` · `20260614000000_apply_business_upgrade.sql` ·
parent closeout: [billing-plan-metadata-closeout.md](./billing-plan-metadata-closeout.md).

> **This is a runbook, not a code change.** Every checkbox below maps to a real file,
> route, env var, or Stripe dashboard action verified against the repo at branch
> `builder-ui-v1-audit-1` (originally written at HEAD `dd0c616c7`). It is the procedure to
> safely flip `ENABLE_PLATFORM_BILLING` — it ships zero behavior.

> **Update (2026-06-07, slice `853c26390` — 4.PLATFORM-BILLING-UI-1):** the Personal Free → Pro
> upgrade and Manage Billing portal now have **real Account Settings UI affordances**
> ([features/account/PersonalUpgradePanel.tsx](../../../../features/account/PersonalUpgradePanel.tsx),
> [features/account/ManageBillingButton.tsx](../../../../features/account/ManageBillingButton.tsx),
> mounted in [BillingSection.tsx](../../../../features/account/BillingSection.tsx)), both
> owner/admin-gated and behind `ENABLE_PLATFORM_BILLING`. This **resolves the prior
> "Personal Free → Pro has no UI mount yet" caveat** (§10, §16, §17 updated below). No backend
> route, webhook, Stripe client, schema, pricing, metering, or plan-sync behavior changed in
> that UI slice. The remaining go-live blockers are now purely **environment / config /
> manual-test** (see §2–§5, §10–§13) plus the deliberate flag flip (§8).

> **Update (2026-07-15, PRO-TEAM-TRIAL-ENFORCEMENT-1):** the §16/§17 "no trials/coupons"
> limitation is now **superseded for trials** by a one-Pro/Team-trial-per-account system, shipped
> **dark by config** (`PLATFORM_TRIAL_PERIOD_DAYS`, default 0 = off — no behavior change until set).
> Only Pro & Team are trial-eligible; Business/Enterprise/Free never are; each account gets one trial
> total across Pro & Team, enforced by an atomic DB claim on `account_billing.trial_consumed_at`
> keyed on `account_id`. To go live set `PLATFORM_TRIAL_PERIOD_DAYS=14` (after applying migration
> `20260721000000_account_billing_trial.sql`). Full owner report + steps:
> [`trial-enforcement-report.md`](./trial-enforcement-report.md). Coupons remain out of scope.

> **Update (2026-06-07, slices `03f4ef3b8` + `8ebaa44d1` — CS-PRO-1/2):** Personal Pro is now
> dark-launched behind a **second flag, `ENABLE_PERSONAL_PRO`** (default OFF), and has a **real
> benefit — 1,000 monthly tasks** (vs Free 100), set on `account_billing.tasks_limit` by the
> verified webhook on personal Pro activation (reset to Free on cancel). To test the Free → Pro
> flow, set **both** `ENABLE_PLATFORM_BILLING=true` **and** `ENABLE_PERSONAL_PRO=true` in the
> dev/test env (both default OFF). Team/Business need only `ENABLE_PLATFORM_BILLING`. No Stripe
> price/webhook/route/schema change in those slices; the Pro task cap is enforced in-app, so no
> separate Stripe price is needed for it.

---

## 1. Context

The platform billing foundation shipped end-to-end but **dark** behind
`ENABLE_PLATFORM_BILLING` (default OFF) over the arc `66bedf73b → 7a888a155`, closed out in
[billing-plan-metadata-closeout.md](./billing-plan-metadata-closeout.md). Code is complete;
what is missing is the operational procedure to turn it on without corrupting plan state or
leaking secrets. This checklist is **Track A** from the closeout's "recommended next tracks"
(§9): the env-readiness + flag-flip runbook every other track presupposes.

**The single most important rule:** `ENABLE_PLATFORM_BILLING=true` is the **final** switch,
**not the first step**. Everything in §2–§9 must be true *before* the flag is flipped. The
flag only un-hides the user-facing surfaces (checkout / portal / personal routes return 404
while OFF — verified in all three route files via `if (!isPlatformBillingEnabled()) return notFound()`).
The webhook is **not** flag-gated — its enablement is the *secret being configured*
(verified: [route.ts](../../../../app/api/webhooks/stripe-billing/route.ts) has no flag
check; comment "the secret being configured IS the enablement").

---

## 2. Required environment variables

All are **server-only** and read **lazily at call time** (never at module load), so a build
with them blank still passes CI. Verified blank-but-present in `.env.example` lines 14–26.

| Env var | Required for | Consumed by (verified) | Behavior if missing/blank |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | All Stripe calls (checkout, portal, personal cancel, customer create) | `getPlatformStripeSecretKey()` in [platformStripeClient.ts:54-67](../../../../services/billing/platformStripeClient.ts) | Throws `PlatformStripeConfigError` → routes return **503** `PLATFORM_BILLING_NOT_CONFIGURED` |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Webhook signature verification | `handleStripeBillingWebhook()` [stripeBillingWebhook.ts:222-223](../../../../services/billing/stripeBillingWebhook.ts) | Fails closed → webhook returns **500** `not_configured` (Stripe retries) |
| `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | Personal Free → Pro checkout, per interval | `resolvePlanPrice('pro', interval)` [platformStripePrices.ts](../../../../services/billing/platformStripePrices.ts) | Checkout returns **503** `PRICE_NOT_CONFIGURED` for the requested interval |
| `STRIPE_PRICE_TEAM_MONTHLY` / `_ANNUAL` | Team paid checkout, per interval | `resolvePlanPrice('team', interval)` | Checkout returns **503** `PRICE_NOT_CONFIGURED` |
| `STRIPE_PRICE_BUSINESS_MONTHLY` / `_ANNUAL` | Team → Business upgrade checkout, per interval | `resolvePlanPrice('business', interval)` | Checkout returns **503** `PRICE_NOT_CONFIGURED` |
| `STRIPE_PRICE_{PRO,TEAM,BUSINESS}` (legacy) | DEPRECATED monthly-only fallback (back-compat) | `resolvePlanPrice(..., 'monthly')` | Used only when the matching `_MONTHLY` var is unset |
| `NEXT_PUBLIC_APP_URL` | Checkout `success_url`/`cancel_url`, portal `return_url` | `appBaseUrl()` [platformBillingSessions.ts:36-40](../../../../services/billing/platformBillingSessions.ts) | Falls back to `http://localhost:3000` — **must be the real domain in prod** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Present in `.env.example` (line 21) | Not read by any platform-billing server file inspected | Optional today — redirect flow uses Stripe-hosted Checkout, no client SDK needed. Set it to the matching mode's pk anyway to avoid mode mismatch if any client surface starts using it. |

**Rule — no Stripe id is an env var.** `account_billing.stripe_customer_id` /
`stripe_subscription_id` are written by code (lazy customer attach / webhook), never set by
hand. The only secrets are `STRIPE_SECRET_KEY` + `STRIPE_BILLING_WEBHOOK_SECRET`; the only
config ids are the per-interval price ids.

**Mode-match invariant:** `STRIPE_SECRET_KEY`, the `STRIPE_PRICE_*` ids, and
`STRIPE_BILLING_WEBHOOK_SECRET` must **all be from the same Stripe mode** (all test, or all
live). A live secret key with a test price id (or vice-versa) fails at Stripe with no local
warning.

---

## 3. Stripe dashboard setup

Done in the **ChainReact platform Stripe account** — the account that owns
`STRIPE_SECRET_KEY`. This is **NOT** the workflow-provider Stripe Connect app
(`STRIPE_CLIENT_ID` / `STRIPE_CLIENT_SECRET`, used by `integrations/stripe/`). The two are
deliberately separate (verified: [platformStripeClient.ts:8-17](../../../../services/billing/platformStripeClient.ts)
"entirely separate from the WORKFLOW Stripe provider … must never be conflated").

- [ ] Confirm you are in the **platform** Stripe account (not the Connect platform used for workflows).
- [ ] Decide mode: do **test mode** first (§5, §11), then repeat in **live mode**.
- [ ] Customer Portal **must be configured/activated** in dashboard → Settings → Billing →
      Customer portal (an un-activated portal makes `POST /v1/billing_portal/sessions` fail).
      Enable: cancel subscription, update payment method. (Plan-switch in-portal is optional —
      our own checkout + the upgrade panel cover upgrades.)
- [ ] Note the publishable key for the chosen mode (for `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).

---

## 4. Stripe products / prices

Tiers and what each price must represent (verified from
[planPolicy.ts:48-53](../../../../core/billing/planPolicy.ts)):

| Tier | Env var | Caps (members / folders / tasks) | Notes |
|---|---|---|---|
| `free` | — (no price) | 1 / 10 / 100 | No charge; `resolvePlanPrice` returns `missing:false`. |
| `pro` | `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | see canonical pricing doc | Personal Pro. Dark behind `ENABLE_PERSONAL_PRO`. Caps governed by `planPolicy` (PRICING-LOCK); see [pricing-and-tiers.md](../../../billing/pricing-and-tiers.md). |
| `team` | `STRIPE_PRICE_TEAM_MONTHLY` / `_ANNUAL` | see canonical pricing doc | Team account paid plan. |
| `business` | `STRIPE_PRICE_BUSINESS_MONTHLY` / `_ANNUAL` | see canonical pricing doc | The Team → Business in-place upgrade target. |
| `enterprise` | — (no price) | unlimited / unlimited / unlimited | Contact-sales; **no online checkout** (`resolvePlanPrice` returns `envVar:null`, route → `plan_not_purchasable`). |

- [ ] Create one **Product per paid tier** (Pro / Team / Business) in the platform account.
- [ ] Create **two recurring Prices per product** — a **monthly** and an **annual** Price
      (PRICING-INTERVAL-1 added interval support; the resolver picks per requested interval).
      **Trials/coupons remain out of scope.**
- [ ] Copy each Price id (`price_…`) into the matching interval-specific env var
      (`STRIPE_PRICE_<TIER>_MONTHLY` / `STRIPE_PRICE_<TIER>_ANNUAL`) for that mode. The legacy
      `STRIPE_PRICE_<TIER>` vars remain a monthly-only fallback.
- [ ] **Do not** create an Enterprise price (none is wired; contact-sales).
- [ ] Confirm all three price ids belong to the **same mode** as `STRIPE_SECRET_KEY`.

---

## 5. Stripe webhook endpoint setup

- [ ] Register endpoint URL: **`{NEXT_PUBLIC_APP_URL}/api/webhooks/stripe-billing`**
      (e.g. `https://app.chainreact.app/api/webhooks/stripe-billing`). This is the **platform**
      billing webhook — **not** `/api/webhooks/stripe` (the untouched workflow-provider route,
      verified: [route.ts:8-10](../../../../app/api/webhooks/stripe-billing/route.ts)).
- [ ] Copy the endpoint's **signing secret** (`whsec_…`) into `STRIPE_BILLING_WEBHOOK_SECRET`
      for that mode.
- [ ] Register **one endpoint per mode** (test endpoint with test secret; live endpoint with
      live secret). Never cross secrets — a mismatched secret makes every event 400/500.
- [ ] The endpoint is **public + unauthenticated by design** — Stripe authenticates by
      signature alone over the raw body (verified: route reads `request.text()` before any
      parse; 300s replay tolerance in [signature.ts:56](../../../../integrations/_shared/stripe/webhooks/signature.ts)).
- [ ] For local/dev testing, `stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing`
      prints a temporary `whsec_…` — use **that** as the dev `STRIPE_BILLING_WEBHOOK_SECRET`.

---

## 6. Required webhook events

The handler processes exactly these four (verified `resolveEvent` switch
[stripeBillingWebhook.ts:149-156](../../../../services/billing/stripeBillingWebhook.ts)); any
other type is recorded + `ignored` with no write.

- [ ] `checkout.session.completed` — attaches customer/subscription ids + plan, marks `active`; detects the Team→Business upgrade from signed metadata.
- [ ] `customer.subscription.created`
- [ ] `customer.subscription.updated` — refines status / `current_period_end` / `cancel_at_period_end`.
- [ ] `customer.subscription.deleted` — sets `canceled`; **personal** accounts revert to `free` + reset task cap ([stripeBillingWebhook.ts:192-204](../../../../services/billing/stripeBillingWebhook.ts)); team/org keep their plan.

**Selecting extra events is harmless** (they fall through to `ignored`), but selecting these
four and no more keeps the dashboard clean. Do **not** rely on any event not in this list to
drive plan state — only these are handled.

---

## 7. Database readiness

All four arc migrations are marked **applied** in the closeout (§5) and the files exist in
`supabase/migrations/`. Before go-live, **confirm they are applied to the target DB**
(dev/staging/prod each separately):

- [ ] `20260611000000_account_billing_plan_metadata.sql` — `account_billing.plan` + `plan_status`.
- [ ] `20260612000000_account_billing_stripe_attachment.sql` — `stripe_customer_id` / `stripe_subscription_id` + partial unique indexes.
- [ ] `20260613000000_stripe_billing_events.sql` — webhook dedup table (`event_id` PK, service-role-only, deny-all RLS).
- [ ] `20260614000000_apply_business_upgrade.sql` — `apply_business_upgrade` RPC (SECURITY DEFINER, service-role-only EXECUTE).
- [ ] Verify in target DB: `account_billing` has the plan/status + stripe id columns;
      `stripe_billing_events` table exists; `apply_business_upgrade` function exists and is
      **not** EXECUTE-able by `authenticated`/`anon`.
- [ ] Confirm no **unapplied** migrations newer than `20260614000000` touch billing tables.

> Per the V2 default, migrations are applied via `npm run db:push` against the non-pooling
> URL. This checklist only **confirms** they landed; it applies nothing.

---

## 8. Feature flag rollout plan

`ENABLE_PLATFORM_BILLING` is ON **only** when the string equals `"true"`
(verified [billingFeatureFlags.ts:51-53](../../../../services/billing/billingFeatureFlags.ts)).

**Recommended sequence (dev/staging first, never prod-first):**

1. **Dev (test mode):** set all §2 env vars from Stripe **test** mode + dev webhook secret
   (`stripe listen`). Flip `ENABLE_PLATFORM_BILLING=true` in dev only. Run the full §10–§13
   manual plan.
2. **Staging (test mode):** same env vars (test mode), staging webhook endpoint registered in
   Stripe test mode. Flip ON. Re-run §10–§13 against the staging domain (`NEXT_PUBLIC_APP_URL`
   = staging URL). This proves the real redirect + webhook round-trip over HTTPS.
3. **Production (live mode):** set all §2 env vars from Stripe **live** mode + the live webhook
   secret, with `NEXT_PUBLIC_APP_URL` = prod domain. Confirm §7 migrations applied to prod DB.
   **Then, and only then,** flip `ENABLE_PLATFORM_BILLING=true` in prod.
4. Keep the flag flip as a **separate deploy/config change** from any code deploy, so rollback
   (§14) is a one-line revert.

**Do not** flip the flag in prod until dev **and** staging have passed the full manual plan in
test mode.

---

## 9. Manual test plan (overview)

Run in order, in **test mode** first. Use a Stripe **test card** (`4242 4242 4242 4242`, any
future expiry, any CVC). After each checkout completes, confirm Stripe fired the webhook and
the resulting `account_billing.plan`/`plan_status` matches. The detailed scenarios are
§10–§13.

Coverage map (each maps to a real surface):

- Personal Free → Pro checkout (§10).
- Team paid checkout (§10) — only if a team account is being launched on a paid Team plan.
- Team → Business upgrade (§12).
- Customer Portal session (§10).
- Personal Pro cancel-at-period-end + undo (§13).
- Webhook signature / dedup / replay (§11).

---

## 10. Test-mode checkout scenarios

For each: act as an **owner/admin** of the target account (the routes require it —
`requireAccountRole(..., ["owner","admin"])`), with `ENABLE_PLATFORM_BILLING=true`.

- [ ] **Personal Free → Pro.** From a personal account, in **Account Settings → Plan & billing**
      click **"Upgrade to Pro"** (the `PersonalUpgradePanel`, shown for an owner/admin on a Free
      personal account, flag ON, not frozen — slice `853c26390`). It calls
      `POST /api/accounts/[id]/billing/checkout` `{plan:"pro"}` → `{url}` and redirects to Stripe.
      Pay with test card. Expect redirect to `…/account?billing=success`. Webhook then sets
      `plan=pro`, `plan_status=active`. The UI copy is honest that Pro activates only after the
      webhook confirms payment (and does not claim extra capacity — Pro shares Free's caps today).
- [ ] **Team paid checkout** (only if launching paid Team). From a team account, checkout
      `team`. Expect `plan=team`, `plan_status=active` after webhook.
- [ ] **Customer Portal.** After a subscription exists, in **Account Settings → Plan & billing**
      click **"Manage billing"** (the `ManageBillingButton`, shown only when `currentPeriodEnd`
      is set — owner/admin, flag ON, not frozen — slice `853c26390`). It calls
      `POST /api/accounts/[id]/billing/portal` → `{url}` and redirects. Open it; confirm
      cancel/payment-method controls render. With **no** synced subscription the button is hidden
      (and the route would answer **409** `NO_BILLING_CUSTOMER`, which the button surfaces as
      honest "available after you start a paid plan" copy rather than an error).
- [ ] **Non-purchasable guards.** Checkout `enterprise`/`free` is blocked by the body schema
      (`z.enum(["pro","team","business"])` → 400). A paid tier with its `STRIPE_PRICE_*` unset
      → **503** `PRICE_NOT_CONFIGURED`. `STRIPE_SECRET_KEY` unset → **503**
      `PLATFORM_BILLING_NOT_CONFIGURED`.
- [ ] **Flag-off oracle check.** With `ENABLE_PLATFORM_BILLING` unset/false, all three billing
      routes return **404** (no existence oracle). Confirm before considering the flag "the only
      thing" turning the surface on.

---

## 11. Webhook verification scenarios

- [ ] **Valid event → processed.** Complete a checkout (or `stripe trigger checkout.session.completed`
      with correct metadata) → endpoint returns **200** `{received:true, outcome:"processed"}`
      and `account_billing` updates.
- [ ] **Bad signature → 400.** POST a body with a wrong/absent `Stripe-Signature` → **400**
      `invalid_signature` (verified route mapping). No DB write.
- [ ] **Missing secret → 500 / fail-closed.** With `STRIPE_BILLING_WEBHOOK_SECRET` blank, any
      event → **500** `not_configured`; Stripe will retry once configured. (Do this only in a
      throwaway env — it is the "not yet configured" state.)
- [ ] **Replay / expired.** A signed body older than 300s (or re-sent with a stale `t=`) →
      **400** `invalid_signature` (`expired`).
- [ ] **Dedup.** Re-deliver the **same** event id (Stripe dashboard "Resend") → **200**
      `{outcome:"deduped"}`, exactly **one** state change total (verified `hasProcessed` guard +
      `stripe_billing_events` PK).
- [ ] **Unknown/irrelevant event → ignored.** e.g. `invoice.paid` → **200** `{outcome:"ignored"}`,
      no write.
- [ ] **Unknown account / missing metadata → ignored,** never a guessed plan write (verified
      `resolveEvent` returns `ignore` when `metadataAccountId` is null or account not found).

---

## 12. Business upgrade scenario

In-place Team → Business on the **same `account_id`** (no new account, no data migration —
verified [closeout §5] + webhook `isBusinessUpgrade`).

- [ ] As owner/admin of a **Team** account, use the **"Upgrade to Business"** control
      (`BusinessUpgradePanel`, flag-gated) → checkout for `business`. The session carries signed
      metadata `plan=business` + `targetAccountType=organization`
      (verified [platformBillingSessions.ts:144-147](../../../../services/billing/platformBillingSessions.ts)).
- [ ] Pay with test card. On `checkout.session.completed`, the webhook detects the upgrade
      (`isBusinessUpgrade`) and calls `applyBusinessUpgradeServiceRole` — an **atomic** flip of
      `accounts.type` → `organization` + `account_billing.plan` → `business` via the
      `apply_business_upgrade` RPC.
- [ ] Confirm caps rose to **25 members / 250 folders** (Business policy) and the UI labels it
      **"Business"**, never "Organization".
- [ ] **Forgery guard:** a forged/mismatched `targetAccountType` (or a non-team account) falls
      through to normal sync, which **drops** a type-disallowed plan — account type can never be
      escalated by client metadata (verified `isBusinessUpgrade` + RPC re-validation). Optionally
      verify by `stripe trigger` with bad metadata → no type change.

---

## 13. Personal Pro cancel-at-period-end scenario

- [ ] As owner/admin of a **personal** account on paid Pro, open `PersonalPlanPanel` (flag-gated)
      and **schedule cancel at period end** → `POST /api/accounts/[id]/billing/personal`
      `{cancelAtPeriodEnd:true}`. This sets **only** the Stripe `cancel_at_period_end` flag
      ([personalPlan.ts:100-131](../../../../services/billing/personalPlan.ts)) — it does **not**
      locally mutate plan/status.
- [ ] Confirm the synced `cancel_at_period_end=true` arrives via the subsequent
      `customer.subscription.updated` webhook and the panel reflects "Access ends on …".
- [ ] **Undo** with `{cancelAtPeriodEnd:false}` → flag cleared, subscription continues.
- [ ] **At period end** (simulate via Stripe test clock or `stripe trigger
      customer.subscription.deleted` with personal metadata): personal account reverts to
      `free` + task cap reset to Free policy (verified webhook personal-delete branch). No data
      deleted.
- [ ] Guards: non-personal account → **400** `NOT_PERSONAL_ACCOUNT`; frozen (pending-deletion)
      account → **403**; no subscription → **409** `NO_SUBSCRIPTION`.

---

## 14. Failure / rollback plan

The system is designed so the flag flip is **safely reversible** and the webhook is
**idempotent**, so rollback is config-only.

- [ ] **Primary rollback:** set `ENABLE_PLATFORM_BILLING=false` (or unset). All three billing
      routes immediately return 404 again — the surface goes dark. **No code revert needed.**
- [ ] **Leave the webhook route deployed.** It is not flag-gated and is harmless when no new
      checkouts can start: it only ever syncs *verified* Stripe events into `account_billing`.
      Leaving it up means any in-flight/retried events from already-created subscriptions still
      reconcile correctly (no orphaned "paid but not synced" state).
- [ ] **If checkout fails mid-flow:** checkout success URL is **not** proof of payment — the
      route never writes plan/status, so a half-finished checkout leaves DB untouched. The user
      simply has no subscription; retry is safe (customer attach is idempotent via
      `Idempotency-Key` + guarded DB write).
- [ ] **If the webhook fails (5xx/throw):** the event is left **unrecorded** → Stripe retries
      automatically (verified: record happens only *after* successful sync). No manual replay
      needed for transient DB blips.
- [ ] **Verify no plan/status corruption after rollback:** spot-check `account_billing` rows
      touched during the test window — `plan`/`plan_status` should reflect the last verified
      Stripe event only. The parity invariant: **no route mutates plan/status; only the webhook
      does.** If a row looks wrong, the source of truth is the Stripe subscription.
- [ ] **Corrections, if ever needed, via Stripe dashboard only** (cancel/refund/adjust the
      subscription) — let the resulting webhook event re-sync `account_billing`. **Never**
      hand-edit `account_billing.plan`/`plan_status` to "fix" billing; that desyncs from Stripe.

---

## 15. Monitoring / logs

- [ ] Watch the **webhook route** outcomes: `processed` / `deduped` / `ignored` (200),
      `invalid_signature` / `bad_request` (400), `not_configured` / processing-throw (500). A
      spike in 400s after go-live almost always means a **wrong/cross-mode webhook secret**; a
      spike in 500 `not_configured` means the secret is blank in that env.
- [ ] Watch **checkout route** failures: a burst of **503** `PRICE_NOT_CONFIGURED` /
      `PLATFORM_BILLING_NOT_CONFIGURED` means an env var is unset in the running env (config
      drift), not a user error.
- [ ] **Stripe Dashboard → Developers → Webhooks → [endpoint]:** watch delivery success rate +
      retries. Investigate any endpoint showing repeated failures.
- [ ] **Stripe Dashboard → Payments / Subscriptions:** confirm new subscriptions appear with
      `metadata.accountId` (and `targetAccountType` for upgrades) populated.
- [ ] **DB spot-checks during the launch window:** `stripe_billing_events` growing (dedup
      working), `account_billing` plan/status matching live Stripe subscription status.
- [ ] No secret, customer email, or card data appears in any log line (verified: routes return
      generic typed errors; webhook ack carries no payload). Confirm this holds in whatever log
      sink the env uses.

---

## 16. Known limitations to accept before go-live

These are **intended** scope cuts (from closeout §7). Accept them explicitly — none blocks a
launch of the Pro/Team/Business monthly tiers, but support must know them:

- **No Business → Team downgrade flow.** `evaluateDowngrade('team')` exists as a gate, but the
  flow + type-revert-on-cancel are not built. Business `subscription.deleted` only sets
  `canceled` (plan/type left). Handle a Business downgrade manually via Stripe + dashboard for
  now.
- **No Enterprise checkout** — contact-sales only (no price id).
- **No payment-failure enforcement / run-blocking.** `past_due` warns and keeps running by
  decision; a failing card does not pause workflows.
- **No per-seat billing** — flat per-tier pricing.
- **No metered usage / overage** — fixed per-tier task caps (Free 100 / Pro 1,000 / Team/Business 100), no pay-as-you-go.
- **Annual pricing supported** (PRICING-INTERVAL-1: monthly + annual Price ids per tier;
  checkout `interval` param, defaults monthly). **No trials/coupons.** Pricing page shows the
  monthly headline + annual-equivalent sub-line.
- **No full pricing table** in the UI.
- **No customer-support / admin billing tooling** — corrections go through the Stripe dashboard.
- ~~**`CheckoutChoiceButton` is not yet mounted for the personal Free → Pro upgrade path**~~ —
  **RESOLVED** in slice `853c26390`: `PersonalUpgradePanel` mounts the Free → Pro upgrade and
  `ManageBillingButton` mounts the portal, both owner/admin-gated and flag-gated. Still deferred:
  a **full plan-comparison / pricing table** (the upgrade is a single honest button, not a
  pricing grid).

---

## 17. Do-not-enable-yet list

Explicitly out of scope for this go-live — **do not** turn these on as part of flipping
`ENABLE_PLATFORM_BILLING`:

- **Do not** enable Business → Team downgrade (flow does not exist).
- **Do not** enable Enterprise self-serve checkout (no price; contact-sales only).
- **Do not** turn `past_due` into a run-blocker / workflow-pause (warn-only by decision).
- **Do not** wire metered/overage usage or per-seat billing.
- **Do not** add trials/coupons to checkout. Monthly + annual intervals are supported
  (PRICING-INTERVAL-1); trial/coupon logic is intentionally not wired.
- **Do not** point the workflow-provider Stripe integration (`integrations/stripe/`,
  `STRIPE_CLIENT_ID`/`STRIPE_CLIENT_SECRET`) at platform billing — they are separate accounts
  and credentials.
- **Do not** reuse the workflow webhook `/api/webhooks/stripe` for platform events — use
  `/api/webhooks/stripe-billing`.
- **Do not** add a full pricing / plan-comparison table or a free→Pro pricing grid — the
  personal upgrade is a single honest flag-gated button (mounted in `853c26390`); a pricing
  table is a separate deferred UX track.

---

## 18. Acceptance criteria

**For this planning slice (met now):**
- [x] Docs-only checklist created at the path below; no source, migrations, tests, UI, env
      files, or Stripe dashboard changed.
- [x] Every "current behavior" claim traces to a file read for this slice (cited inline).
- [x] Nothing pushed; local commit only.

**For the actual go-live (the operator must check off before flipping the flag):**
- [ ] §2 env vars all set for the target mode (and mode-matched).
- [ ] §3–§5 Stripe dashboard: platform account confirmed, products/prices created, portal
      activated, webhook endpoint registered with the matching secret.
- [ ] §6 the four events selected on the endpoint.
- [ ] §7 all four migrations confirmed applied to the target DB.
- [ ] §10–§13 manual scenarios pass in **test mode** on dev **and** staging.
- [ ] §14 rollback rehearsed (flag off → 404, no corruption).
- [ ] §15 monitoring in place.
- [ ] §16 limitations + §17 do-not-enable list acknowledged by whoever owns launch.
- [ ] **Only then:** `ENABLE_PLATFORM_BILLING=true` in production.

---

## 19. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, or schema change.
- No env file edited (`.env.example` and all `.env*` untouched).
- No Stripe dashboard action taken.
- `ENABLE_PLATFORM_BILLING` **left default OFF**; no flag flipped anywhere.
- No git push. Docs-only local commit.

---

## 20. Recommended next step

Execute this checklist in **dev test mode** first (§8 step 1): set the test-mode env vars,
register a dev webhook via `stripe listen`, flip the flag in dev only, and run §10–§13. If
launch readiness is the goal, that dry run is the immediate next action; if product
completeness is the goal instead, the closeout's **Track B (Business → Team downgrade)** is
the parallel candidate. This doc is the prerequisite runbook for the former.

**Doc path:** `docs/slices/phase-4/account-settings/platform-billing-go-live-checklist.md`.
**Docs-only. Nothing pushed.**
