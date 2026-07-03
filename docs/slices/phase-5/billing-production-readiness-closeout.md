# Billing Production Readiness — Closeout (LAUNCH-BILLING-READINESS)

## Date

2026-07-03. Branch `v2-main` (local commit only, not pushed). Audit + one small
launch-hardening code fix.

## Verdict

**Ready with Marcus dashboard verification.**

The platform billing code is production-grade: it is account-scoped end to end, fails
**closed** on every missing-config path, verifies the Stripe webhook signature over the raw
body with a replay window, is idempotent on duplicate events, and never mixes the workflow
Stripe provider with platform billing credentials. No correctness launch-blocker was found
in code. One small robustness gap was found and fixed (webhook period-end under Stripe's
Basil API — see below).

What remains before enabling payments is **not code** — it is confirming the Stripe/Vercel
dashboard configuration (secrets, live-mode price ids, webhook endpoint + events, portal
config) and running one live checkout→webhook→portal round-trip. Those are called out
explicitly in "What Marcus must verify" below.

This closeout is billing-only. It does not re-do the separate chat's live per-provider
action/trigger certification, and it does not change the other MVP blockers from
[`mvp-launch-readiness-audit.md`](./mvp-launch-readiness-audit.md) (staging DB, live-QA
pass, cross-device email confirm) — those are independent and unchanged.

## What was audited

### 1. Stripe configuration safety

- **Two entirely separate Stripe surfaces, confirmed non-overlapping.** Platform billing
  (`services/billing/platformStripeClient.ts`) authenticates with the platform secret key
  `STRIPE_SECRET_KEY` and imports only the shared primitives in
  `integrations/_shared/stripe/*` (flatten, signature verifier, api base, error surfacer).
  The workflow provider (`integrations/stripe/*`) uses per-merchant connected-account OAuth
  tokens (`integrations.access_token_encrypted`). A grep of `services/billing/` shows the
  only references to `integrations/stripe/` are in comments documenting the separation —
  there is no cross-import. The platform client explicitly does not reuse the provider's
  `stripeRequest` (whose 401→OAuth-refresh semantics are wrong for platform billing).
- **Server-only + lazy.** The secret key is read only when
  `getPlatformStripeClient()`/`getPlatformStripeSecretKey()` is called (never at module
  load, so `next build` in CI passes with no keys), guarded by a `typeof window` check, and
  captured in a closure — never exposed as a property or sent to the browser.
- **Price ids are resolved server-side from env, never hardcoded, never client-supplied.**
  `services/billing/platformStripePrices.ts` maps `(plan, interval)` →
  `STRIPE_PRICE_{PRO,TEAM,BUSINESS}_{MONTHLY,ANNUAL}` with a legacy monthly fallback
  (`STRIPE_PRICE_PRO|TEAM|BUSINESS`). `free`/`enterprise` have no fixed price by design
  (`missing:false`); a paid tier with an unset var returns `missing:true` →
  `price_not_configured`. The checkout body accepts only `interval`, never a price id.
- **Fail-closed behavior (verified in code + tests):**
  - `STRIPE_SECRET_KEY` unset → checkout/portal return `stripe_not_configured` → **503**
    (`PLATFORM_BILLING_NOT_CONFIGURED`).
  - paid price id unset → `price_not_configured` → **503** (`PRICE_NOT_CONFIGURED`).
  - `STRIPE_BILLING_WEBHOOK_SECRET` unset → webhook returns `not_configured` → **500**, so
    Stripe retries until configured and no unverifiable event is ever accepted.
  - No test/live price id can be silently mixed with the platform secret in code — but the
    two must belong to the same Stripe mode in the dashboard (verification item below).

### 2. Checkout and portal behavior

- **Account-scoped + role-gated.** Both `POST /api/accounts/[id]/billing/checkout` and
  `.../portal` run `requireAuthedUserId()` → `requireAccountRole(userId, accountId,
  ["owner","admin"])`. A non-member gets `403 NOT_ACCOUNT_MEMBER`; a `member` gets
  `403 FORBIDDEN`. Only the customer account's `owner`/`admin` can manage billing. (Note:
  "owner/admin" here are the customer-account roles; ChainReact-internal entitlement is a
  separate service-role-only surface — see §5.)
- **Server-side plan↔type validation.** `createCheckoutSession` re-validates the requested
  plan against the account type (`isPlanAllowedForType`) plus the one recognized cross-type
  upgrade (team→business→organization). The route body schema is `.strict()` and only
  allows `plan ∈ {pro,team,business}` and `interval ∈ {monthly,annual}`.
- **Frozen + internal short-circuits before any Stripe call.** `pending_deletion` →
  `account_frozen`; `billing_mode='internal_free'` → `internal_account` (409). No customer
  or session is created for those.
- **Redirect URLs are proxy-safe** (built from `NEXT_PUBLIC_APP_URL`, not `request.url`):
  checkout `success_url=/account?billing=success`, `cancel_url=/account?billing=canceled`;
  portal `return_url=/account`.
- **Checkout is not authoritative.** The route/service never mutate
  `account_billing.plan/status`; they only mint a redirect URL and (lazily) write
  `stripe_customer_id`. Plan/status flips happen only in the verified webhook.
- **Reconciliation metadata is sufficient for the account-scoped model.** Checkout stamps
  `{ accountId, plan }` (+ `targetAccountType` for the team→business upgrade) on **both**
  the Checkout Session and `subscription_data.metadata`, so the subscription carries it for
  all later `customer.subscription.*` events. The billing cycle is reconcilable from the
  subscription's price id (monthly vs annual), and by the ownership model billing attaches
  to the **account**, never a user — so no `userId` is needed in metadata (the acting
  owner/admin email is used only as the Stripe customer contact).
- **Idempotent customer attach.** Lazy customer creation uses
  `Idempotency-Key: platform-customer:${accountId}` (Stripe 24h dedup) plus a guarded
  `attachStripeCustomerIfAbsentServiceRole` DB write; an existing `stripe_customer_id` is
  reused. The portal never lazily creates a customer (`no_customer` → 409 "start a
  subscription first").

### 3. Billing webhook behavior

- **Signature verified over the raw body, before any processing.** The route reads
  `request.text()` before parsing; `verifyStripeSignature` does HMAC-SHA256 over
  `${t}.${rawBody}`, enforces a 300s replay tolerance, supports multiple `v1=` candidates
  (secret rotation), and compares constant-time with a length guard. Order is strictly:
  secret-present → signature-valid → parseable+has id/type → dedup → resolve+sync → record.
- **Idempotency / event ledger.** `hasProcessed(eventId)` short-circuits a replay to
  `deduped` (200) with no write. On success the event is recorded **after** the sync, so a
  sync/DB throw leaves the event unrecorded and Stripe's retry reprocesses it (route → 500).
- **Handled events:** `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`. Any other type → `ignored` (recorded,
  200), never a guessed plan.
- **Customer/account mapping is trust-minimized.** `accountId` and `plan` are read only
  from **signed** Stripe metadata; the account is re-read by id (unknown account →
  `ignored`); the plan is validated against plan policy and account type before any write
  (an invalid/type-disallowed plan writes nothing, so an unsafe plan can never carry an
  unsafe task cap). A forged team→business upgrade (mismatched `targetAccountType`) falls
  through to the normal sync, which drops the disallowed plan — type can never be escalated.
- **Cancellation is non-destructive.** `subscription.deleted` sets `planStatus='canceled'`;
  a **personal** account reverts to Free (+ Free task cap), team/org keep their plan (no
  member/folder/workflow ops — the handler imports no such service). The destructive
  Business→Team downgrade is owner-confirmed UI only, never webhook-driven (asserted by
  tests).
- **Logs carry no payload/secret/PII** — responses are a minimal ack; the ops-signal
  recorder logs only a reason string.
- **Invoice/payment-failure events are not handled** (no `invoice.payment_failed` path).
  For MVP this is acceptable: a failed renewal surfaces via the subsequent
  `customer.subscription.updated` → `past_due` status, which drives the warn-first
  lifecycle banner in `BillingSection`. Dunning email handling is post-launch.

### 4. Usage / quota enforcement

- **Account-scoped, at the single execution chokepoint.** `executionBillingGate(accountId)`
  bills `workflow.accountId` (never the actor) and is invoked inside
  `services/execution/engine.ts` — the one path every run funnels through (manual, webhook,
  scheduled, and durable-queue-processed runs all reach the engine). The reserve/reconcile
  path uses the `deduct`/reserve RPC; the flat path calls `deductTasks(accountId, 1)`. Both
  are account-scoped.
- **Fails safe on exhaustion.** A `!ok` gate outcome (`limit_reached` / `account_frozen`)
  is treated as a refusal: the engine fails the run before any node executes with
  `BILLING_EXHAUSTED` and a plain-English message (`"Task quota exhausted: used/limit"`).
  The reserve path additionally refuses if the pre-run row was not durably created.
- **The only non-billed paths are deliberate and account/engine-scoped, not per-user:**
  `testMode` (dry-run — the engine also blocks real external side effects in test mode) and
  `billing_mode='internal_free'` (§5). A frozen account is refused even in test mode
  (freeze is checked first). There is **no** silent free-unlimited path reachable by a
  customer.
- **User-facing exhaustion messaging + upgrade path.** `BillingSection` shows real
  account-level task + AI-credit usage with reset date, near/over-limit copy ("No tasks
  left. Resets …"), an account-shared-usage note, and — for an owner/admin — the upgrade
  panels (Personal Free→Pro, Team→Business) and the "Manage billing" portal button.
- **AI credits** are a separate dimension (`aiCreditGate`, gated before the model call,
  account-scoped, recorded to `account_billing.ai_credits_*`); deterministic checks stay
  free. Not a task-quota concern; noted for completeness.

### 5. Owner / internal entitlement controls

- **ChainReact-internal entitlement is `account_billing.billing_mode='internal_free'`,** set
  only through `services/billing/internalBillingEntitlement.ts` — a **service-role-only**
  surface with **no HTTP route and no customer UI**. The only callers are server-side (the
  `scripts/mark-account-internal.mjs` seed script or a future internal admin tool).
- **Account-scoped, audited.** It flips a column on the workflow-owning account's billing
  row; it does **not** grant any user a global bypass, and a standard account is always
  billed regardless of who runs its workflows. The reason is constrained to
  `INTERNAL_BILLING_REASONS` and every write passes an audit `reason` (including the acting
  user id) through the service-role client.
- **It never fakes Stripe state** — an internal_free account simply has no subscription;
  checkout/portal short-circuit before any Stripe call, and the UI shows an honest
  "Internal account — usage is tracked but not billed" note.
- **"Owner" disambiguation:** this internal entitlement is **not** the customer-account
  `owner`/`admin` role. Marcus grants it out-of-band per account id via the seed script; it
  is the intended mechanism for ChainReact owners/employees/demo accounts. Auditability is
  sufficient for MVP (constrained reason + actor id + service-role audit trail); a
  first-class internal-admin UI is post-launch.

### 6. UI / pricing / billing copy

- **Public pricing page (`features/marketing/PricingPage.tsx`, served at `/pricing`)
  displays exactly the required prices**, sourced from a doc-locked `PRICES` const
  (PRICING-LOCK-1) with all capacity numbers read from `core/billing/planPolicy.ts` so they
  can't drift:
  - Free **$0** — "Free forever · no card needed"
  - Pro **$25/mo** — "or $19/mo billed annually"
  - Team **$75/mo** — "or $59/mo billed annually"
  - Business **$249/mo** — "or $199/mo billed annually"
  - Enterprise **Custom** — "Limits & terms by arrangement"
- **No fake/backend-less billing actions.** Pricing CTAs route to sign-up (start free,
  upgrade in-app) or `mailto:sales@chainreact.app`; there is no "Buy now" on the marketing
  page. In-app, `BillingSection` shows the real plan/usage; the upgrade panels and portal
  button appear only for owner/admin and only when applicable (`showManageBilling` requires
  a real synced `currentPeriodEnd`). When the portal isn't available the UI shows honest
  "coming soon" rows rather than a dead button.
- **Copy is account-scoped and honest** ("Usage is counted at the account level and shared
  by everyone in this account", "Team and Business are billed as one account"), matching the
  ownership model. Business is labeled "Business", never "Organization".

## What was fixed (code)

**One small, launch-hardening fix — Stripe Basil `current_period_end` handling.**

- **The gap:** the pinned Stripe API version is `2025-05-28.basil`
  (`integrations/_shared/stripe/api/_base.ts`). Stripe's **Basil** API (2025-03-31.basil
  onward) **removed `current_period_end` from the Subscription object and moved it onto each
  subscription item** (`items.data[].current_period_end`) — see
  <https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end>.
  The inbound webhook event shape follows the API version configured on the **Stripe
  Dashboard webhook endpoint** (not the header the platform REST client sends). The handler
  read only the top-level `obj.current_period_end`, so a Basil-shaped
  `customer.subscription.*` event would leave `account_billing.current_period_end` null.
- **Why it matters:** `current_period_end` is the only signal `BillingSection` uses to show
  the **"Manage billing" portal button** (`showManageBilling`). If it never syncs, an
  owner/admin cannot reach the Stripe portal to update payment or cancel — a self-serve /
  support / chargeback risk — and the "Renews on / Access ends" row never appears.
- **The fix:** `services/billing/stripeBillingWebhook.ts` now resolves period-end from
  **either** the top-level field (pre-Basil — preserved, still preferred when present) **or**
  the latest `items.data[].current_period_end` (Basil+, and correct for mixed-interval
  subs). Backward compatible with the existing top-level tests; harmless when the top-level
  field is present. No schema/route/behavior change beyond correctly populating a field that
  was already consumed.

No other code changes were needed. Everything else is dashboard/env verification.

## Files changed

- `services/billing/stripeBillingWebhook.ts` — added `resolveCurrentPeriodEnd()` (reads
  top-level OR item-level period end); used it in the subscription-event resolver. Doc
  comment explains the Basil change and the downstream portal-button dependency.
- `tests/unit/services/billing/stripeBillingWebhook.test.ts` — 2 new tests: Basil
  item-level `current_period_end` syncs; top-level preferred and latest item wins on a
  mixed-interval sub.
- `docs/slices/phase-5/billing-production-readiness-closeout.md` — this doc (new).

## Tests added / updated + results

Commands run (local, read-only except the test runner):

```
npx jest tests/unit/services/billing/stripeBillingWebhook.test.ts \
         tests/unit/app/api/webhooks/stripe-billing.route.test.ts
  → 2 suites passed, 50 tests passed (incl. the 2 new Basil tests)

npx jest tests/unit/services/billing tests/unit/core/billing \
         tests/unit/app/api/accounts/billing-checkout.route.test.ts \
         tests/unit/app/api/accounts/billing-portal.route.test.ts \
         tests/unit/features/marketing/PricingPage.test.tsx \
         tests/unit/features/account/BillingSection.test.tsx
  → 31 suites passed, 474 tests passed

MCP run_typecheck (tsc --noEmit)
  → exit 0
```

**Not run (not claimed as passing):** the full Jest suite, `npm run lint`, Playwright e2e,
the DB-gated `tests/integration/billing/*.dev.test.ts` + `account-billing-rls.test.ts`
(require a test Supabase project), and any **live** Stripe checkout/webhook/portal
round-trip. No live Stripe charge was made.

## What Marcus must verify in Stripe / Vercel / Supabase dashboards

These are the gate to enabling payments. All are dashboard/config, not code.

1. **Vercel prod env vars set (billing fails closed without them):**
   - `STRIPE_SECRET_KEY` (platform secret) and `STRIPE_BILLING_WEBHOOK_SECRET`
     (platform webhook signing secret — the `whsec_…` for the `/api/webhooks/stripe-billing`
     endpoint, **not** the workflow provider's per-trigger secret).
   - Per-plan price ids: `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`,
     `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_ANNUAL`,
     `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_ANNUAL` (annual has **no**
     legacy fallback; monthly may use `STRIPE_PRICE_{PRO,TEAM,BUSINESS}`).
   - `NEXT_PUBLIC_APP_URL` = the production origin (drives success/cancel/return URLs).
   - `STRIPE_API_BASE` must be **unset** in prod (only e2e points it at the mock server).
2. **Same Stripe mode for key + prices.** The secret key and every price id must both be
   **live-mode** (or both test-mode for a rehearsal). A live secret + a test price id (or
   vice-versa) is rejected by Stripe at checkout. Code cannot detect this — verify in the
   dashboard.
3. **Displayed prices == Stripe price amounts.** The page shows $25/$19, $75/$59,
   $249/$199. Confirm each configured Price id's actual amount/interval matches. Code can't
   verify the dollar figure (it lives in Stripe); this is a manual guarantee.
4. **Webhook endpoint config for `/api/webhooks/stripe-billing`:**
   - subscribed to exactly `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted` (the only handled events);
   - its signing secret equals `STRIPE_BILLING_WEBHOOK_SECRET`;
   - note its **API version** — the code now handles both pre-Basil and Basil
     `current_period_end` shapes, but confirm the endpoint version so the period-end/portal
     button behavior is understood.
5. **Customer Portal configuration decision (behavioral gap to close in the dashboard).**
   The webhook derives `plan` from the **checkout metadata**, which is frozen at checkout
   time and does **not** change when a customer switches price/plan inside the Stripe
   Portal. So a **portal-initiated plan switch would not re-sync** `plan`/`tasks_limit` in
   the app. Recommended: configure the Portal to allow **payment-method update + cancel
   only**, and keep **plan changes routed through the in-app upgrade panels** (which create a
   fresh Checkout with correct metadata). If plan-switching in the Portal is left enabled,
   that re-sync gap is a real bug and needs a follow-up slice (read plan from the
   subscription's price id instead of metadata).
6. **Confirm the billing migrations are applied to the prod DB** (`qcepijemjlkssfkvzlio`):
   `account_billing` foundation + `plan_metadata` + `stripe_attachment` +
   `stripe_billing_events` + `ai_credits` + `internal_entitlement` +
   `lazy_task_period_rollover`. (General prod-migration verification is
   `mvp-launch-readiness-audit.md`'s Ops row; billing-specific ones are listed here.)

## Launch risks remaining

- **Portal plan-switch metadata staleness** (verification #5) — a config decision; a real
  bug only if Portal plan-switching is enabled. Flagged, not code-fixed (the intended path
  is in-app upgrade checkout).
- **No live checkout→webhook→portal round-trip has been run here** — belongs to
  `LAUNCH-LIVE-QA-1`. The Basil period-end fix is proven at the handler boundary with
  synthesized events, not against a real Basil webhook payload.
- **No `invoice.payment_failed` handling** — failed renewals surface via the subsequent
  `subscription.updated → past_due` banner; explicit dunning is post-launch.
- **Pricing display vs Stripe amount** is a manual guarantee (verification #3).
- Independent (not billing): staging DB, cross-device email confirm, CI RLS/e2e — unchanged
  from the MVP audit.

## Can payments be enabled now?

**Code-wise, yes** — the billing system is account-scoped, idempotent, signature-verified,
fails closed on every missing-config path, and has no correctness launch-blocker. The
remaining gate is operational: set the Stripe secrets + **live-mode** price ids in Vercel
(verification #1–3), confirm the webhook endpoint + events + secret (#4), make the Customer
Portal config decision (#5), and run one live (or test-mode) checkout→webhook→portal
round-trip. After those, payments can be turned on.
