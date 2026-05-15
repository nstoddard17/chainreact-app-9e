# Parity audit — Stripe

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/stripe/`](../../integrations/stripe/) (slice 11)
**Phase 1 surface shipped:** 10 actions (`create_customer`, `update_customer`, `find_customer`, `create_payment_intent`, `confirm_payment_intent`, `capture_payment_intent`, `create_refund`, `create_subscription`, `update_subscription`, `cancel_subscription`), 1 consolidated webhook trigger (`event_received`, 16-event allowlist).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.
**Predecessor slice plan:** [`docs/slices/slice-11-stripe.md`](slice-11-stripe.md) (Phase 1 — accepted + shipped; locked the V2 design decisions on consolidated trigger + 10-action Batch 1 + body-auth OAuth + strict-direct-lookup webhook routing).
**Rank in Phase 2 priority:** 5+ (Stripe was rank 6 in the master plan pre-audit table; after Slack / Gmail / Notion / Microsoft Excel / Google Sheets, Stripe is the next provider with substantial V1 surface area).

**Recommendation up front.** V1 registers **14 Stripe actions** + **9 trigger node defs** plus **6 unregistered "phantom" trigger types** in the webhook route's `eventMap` (dead-code references that have no node definitions). V2 ships **10 actions** + **1 consolidated `event_received` trigger** backed by a 16-event allowlist that already covers **all 9 V1 trigger semantics + 5 of the 6 phantoms** (only `invoice.created` is missing from V2's allowlist, and that was a V1 dead-code reference with no real node). Action gap is **4 net-new ports** (`create_checkout_session`, `create_payment_link`, `create_invoice`, `get_payments`), **2 read-only-finder ports** (`find_subscription`, `find_payment_intent` — same shape as the shipped `find_customer`), and **11 V1-orphan actions** (`createInvoiceItem`, `createPrice`, `createProduct`, `updateInvoice`, `updateProduct`, `finalizeInvoice`, `voidInvoice`, `findCharge`, `findInvoice`, `listProducts`, `getCustomers`) that exist as `.ts` files under `lib/workflows/actions/stripe/` but are **NOT in V1's registry** and **NOT in V1's node defs** — dead code. **One open product decision (NPD-S1):** does Stripe parity want the orphan-but-real-Stripe-API actions (products / prices / invoice line items) — these aren't in V1's registry so this is a "build new" decision, not a "port" decision. **Zero required platform gaps** — every port reuses Slice 11's `_request.ts`, `flattenForStripe`, body-auth refresh, idempotency-key wiring, and event-received consolidated trigger. **One V2 allowlist decision (NPD-S2):** add `invoice.created` and `customer.subscription.trial_will_end` to the 16-event allowlist if `create_invoice` ships (NPD-S2.a) or if subscription trial workflows ship (NPD-S2.b). Estimated **1 parity slice in 4–6 commits** if Marcus accepts the 4 net-new actions + 2 finders (Stripe 2.1). Orphan-action backfill (products / prices / invoice items) is a separate decision and a separate slice candidate (Stripe 2.2 conditional on product demand). Stripe parity is the **smallest registered-action gap among shipped providers** — V1 ships 14, V2 ships 10, and the missing 4 are all single-call POSTs in the same shape Slice 11 already validates. The consolidated webhook trigger means **no trigger work** is required for Phase 2 Stripe (deliberate Slice 11 win).

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/stripe/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/stripe/index.ts) (2176 lines) — 14 action exports + 9 trigger exports in one file. **No** `comingSoon: true` flags (R6 clean). Naming convention is consistent: every node uses `stripe_<kind>_*` (underscore prefix, no hyphenated outliers — different from V1 Excel's mixed convention).

### Action handlers

- [`lib/workflows/actions/stripe/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/) — **29 .ts files** total: 14 registered handlers + 1 trigger-event helper (`handleTriggerEvent.ts`, 185 lines, used by V1's webhook receive route to flatten Stripe event payloads into workflow `input`) + 1 shared util (`utils.ts`, 35 lines, `flattenForStripe` — already ported to V2 as [`integrations/stripe/api/_request.ts`](../../integrations/stripe/api/_request.ts)) + **13 orphan handler files** (per-action split, but **NOT** wired in `lib/workflows/actions/registry.ts`).
- Per-registered-action sizes (line counts):
  - `createCheckoutSession.ts` (258 lines) — largest. Stripe Checkout hosted payment page. Idempotency-Key header set.
  - `createCustomer.ts` (235 lines) — already ported to V2 with a narrower schema.
  - `updateCustomer.ts` (238 lines) — already ported to V2.
  - `createSubscription.ts` (175 lines) — already ported to V2.
  - `createPaymentLink.ts` (165 lines) — Stripe Payment Link (shareable URL).
  - `createRefund.ts` (164 lines) — already ported to V2.
  - `createPaymentIntent.ts` (157 lines) — already ported to V2. Idempotency-Key wired.
  - `updateSubscription.ts` (145 lines) — already ported to V2. Pre-fetch GET to extract `si_xxx`, then POST.
  - `createPrice.ts` (133 lines) — **orphan** (not in registry).
  - `findCustomer.ts` (125 lines) — already ported to V2.
  - `createProduct.ts` (121 lines) — **orphan**.
  - `createInvoice.ts` (100 lines) — registered in V1, NOT in V2.
  - `updateProduct.ts` (99 lines) — **orphan**.
  - `createInvoiceItem.ts` (97 lines) — **orphan**.
  - `cancelSubscription.ts` (92 lines) — already ported to V2.
  - `updateInvoice.ts` (87 lines) — **orphan**.
  - `findPaymentIntent.ts` (79 lines) — registered in V1, NOT in V2.
  - `findSubscription.ts` (79 lines) — registered in V1, NOT in V2.
  - `getPayments.ts` (79 lines) — registered in V1, NOT in V2.
  - `findInvoice.ts` (76 lines) — **orphan**.
  - `findCharge.ts` (75 lines) — **orphan**.
  - `confirmPaymentIntent.ts` (71 lines) — **V1 orphan, but V2 ships `confirm_payment_intent`**.
  - `getCustomers.ts` (70 lines) — **orphan**.
  - `capturePaymentIntent.ts` (67 lines) — **V1 orphan, but V2 ships `capture_payment_intent`**.
  - `listProducts.ts` (67 lines) — **orphan**.
  - `finalizeInvoice.ts` (56 lines) — **orphan**.
  - `voidInvoice.ts` (54 lines) — **orphan**.
  - `handleTriggerEvent.ts` (185 lines) — **not a registered action**; helper that extracts data from Stripe webhook payloads inside the webhook receive route. V2 absorbs this responsibility into [`integrations/stripe/triggers/eventReceived/normalize.ts`](../../integrations/stripe/triggers/eventReceived/normalize.ts).
- **R1 finding:** V1 Stripe is per-action-split (matches Slack / Gmail / Notion / Excel patterns — NOT a monolith). The 13 orphan files create an action-surface ambiguity: did V1 intend these to ship and forget to wire them, or were they explicitly deferred? Git history would tell; for the audit, treat them as **not shipped** because the registry is the runtime source of truth (matches the Phase 2 master plan §5 rule).

### Action registry wiring

- [`lib/workflows/actions/registry.ts:1451-1464`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts#L1451) — 14 Stripe actions registered via `createExecutionContextWrapper`. No conditional / feature-flagged registrations. Registered set: `create_customer`, `update_customer`, `create_payment_intent`, `create_invoice`, `create_subscription`, `get_payments`, `create_refund`, `cancel_subscription`, `update_subscription`, `create_checkout_session`, `create_payment_link`, `find_customer`, `find_subscription`, `find_payment_intent`.

### Trigger handlers / lifecycle / webhook routing

- [`lib/triggers/providers/StripeTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/StripeTriggerLifecycle.ts) (385 LOC) — `onActivate` (creates per-workflow Stripe webhook endpoint via `POST /v1/webhook_endpoints` with `connect: true`), `onDeactivate` (deletes the endpoint), `checkHealth` (verifies endpoints exist, cleans orphans), `getPlatformStripeClient`. Per-trigger-type → `enabled_events` map at the bottom (lines 354-385) that V2's Slice 11 deliberately drops in favor of the user-curated `eventTypes` config field.
- [`app/api/webhooks/stripe-integration/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts) (368 LOC) — receive route for Stripe Connect webhooks. **Multi-secret signature verify loop** (tries every active endpoint secret until one matches — V2 rejects this in favor of strict-direct-lookup, Slice 11 plan §16). `eventMap` (lines 36-54) declares **15 trigger types** (9 covered by V1's node defs + 6 phantoms with no node defs: `payment_failed`, `charge_succeeded`, `charge_failed`, `invoice_created`, `invoice_paid`, `customer_updated`). Async dispatch via `executeWebhookWorkflow` + `dedupeKey: event.id` (the Q4 idempotent webhook contract from CLAUDE.md §6, already-fixed-in-V2 per Slice 11). PR-V2-WEBHOOK-STRIPE-INT comment block at lines 60-65 records that V1's stripe-integration route was migrated through the unified dispatcher.
- [`app/api/webhooks/stripe-billing/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-billing/route.ts) (947 LOC) — **NOT** an integration trigger surface. Stripe-billing is the ChainReact internal billing webhook (subscription / pack purchases / overage reporting) per V1 CLAUDE.md §"Task Cost Visibility & Billing". **Out of scope for Stripe parity** — billing rebuild is Phase 7 work per the master plan. Audit reads only the headers to confirm this is operator-side billing, not workflow-trigger Stripe.
- [`app/api/webhooks/stripe-log/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-log/route.ts) (122 LOC) — debug helper that logs raw Stripe webhook bodies. Not a runtime trigger; out of scope.

### OAuth / API key / config

- [`lib/integrations/oauthConfig.ts:530-543`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L530) — OAuth config: `connect.stripe.com/oauth/{authorize,token}`, `authMethod: "body"`, `refreshRequiresClientAuth: true`, `sendRedirectUriWithRefresh: true`, `accessTokenExpiryBuffer: 30`. **No PKCE.** **No scopes config** (V1 always sends `read_write` implicitly per Stripe Connect's defaults). Already ported to V2 as [`integrations/stripe/oauth.ts`](../../integrations/stripe/oauth.ts) (Slice 11 Commit 2).
- [`lib/stripe/client.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/stripe/client.ts) (21 LOC) — platform Stripe SDK client (used by Stripe Connect's `webhook_endpoints` API). V2 reuses V1's `Stripe-Version: 2025-05-28.basil` pin via [`integrations/stripe/api/_request.ts`](../../integrations/stripe/api/_request.ts).

### Provider data routes

- [`app/api/integrations/stripe/data/{handlers,route.ts,types.ts,utils.ts}`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/stripe/data/) — V1's dynamic-field data provider routes (e.g. fetch customers / products / prices for the builder UI). **Out of scope** — V2's builder UI dynamic-field renderer is Phase 3 work; data routes follow when that platform contract lands.
- [`app/api/workflow/stripe/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/stripe/route.ts) (285 LOC) — V1's per-action HTTP endpoint that the V1 engine calls. V2 doesn't have this layer — the engine dispatches via the in-process action handler registry.
- [`components/workflows/configuration/providers/stripe/StripeOptionsLoader.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/components/workflows/configuration/providers/stripe/StripeOptionsLoader.ts) — builder UI loader. **Out of scope** (Phase 3 UI work).

### V1 tests

- [`__tests__/helpers/stripeHarness.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/helpers/stripeHarness.ts) (166 LOC) — shared Stripe test fixture (mocks `getDecryptedAccessToken`, captures `fetch` calls).
- [`__tests__/nodes/stripe-create-payment-intent.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/stripe-create-payment-intent.test.ts) (213 LOC) — Q4 idempotency contract: first-fire records marker + sends `Idempotency-Key` header; replay returns cached without Stripe call; payload mismatch returns `PAYLOAD_MISMATCH`; different sessionId fires again with new key; absent meta = no header / no marker.
- [`__tests__/nodes/stripe-write-handlers.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/stripe-write-handlers.test.ts) (412 LOC) — Q4 idempotency contract for `createSubscription`, `createCheckoutSession`, `createRefund`.
- [`__tests__/workflows/stripe-flatten.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/stripe-flatten.test.ts) (221 LOC) — `flattenForStripe()` regression suite: empty / flat / nested / arrays-of-objects (Checkout payload shape) / null-undefined-drop / boolean-stringify / round-trip-with-URLSearchParams. V2 already ports the helper to [`integrations/stripe/api/_request.ts`](../../integrations/stripe/api/_request.ts).
- [`__tests__/webhooks/stripe-integration-v2-dispatch.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/webhooks/stripe-integration-v2-dispatch.test.ts) (176 LOC) — webhook dispatch contract: routes to `executeWebhookWorkflow`, `dedupKey = event.id`, metadata includes `connectedAccount`.
- [`__tests__/infra/stripeHarness.infra.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/infra/stripeHarness.infra.test.ts) — harness self-test.

### V1 fixtures

- [`lib/workflows/testing/fixtures/webhooks/stripe/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/testing/fixtures/webhooks/stripe/) — 15 .json files covering: charge-failed / charge-refunded / charge-succeeded / checkout-completed / customer-created-nomatch / customer-updated / dispute-created / invoice-created / invoice-paid / invoice-payment-failed / payment-failed / payment-intent-succeeded / subscription-created / subscription-deleted / subscription-updated. **Reference only** — V2's e2e Stripe walkthrough already builds its own signed-event harness via `mockStripeServer.ts` (Slice 11). Port any new ones needed when porting individual actions.

---

## 2. V1 actions inventory

V1 registers **14 actions** under provider `stripe`. Each row shows the registered type, one-line description, and runtime wiring status.

| # | V1 action type | Description | Wiring |
|---|---|---|---|
| 1 | `stripe_action_create_customer` | POST `/v1/customers` | live |
| 2 | `stripe_action_update_customer` | POST `/v1/customers/{id}` (Stripe convention — POST for updates) | live |
| 3 | `stripe_action_create_payment_intent` | POST `/v1/payment_intents`. Idempotency-Key on outbound. amount in dollars→cents conversion | live |
| 4 | `stripe_action_create_invoice` | POST `/v1/invoices` | live |
| 5 | `stripe_action_create_subscription` | POST `/v1/subscriptions`. Single-item subscription | live |
| 6 | `stripe_action_get_payments` | GET `/v1/charges?limit=...` (list charges) | live |
| 7 | `stripe_action_create_refund` | POST `/v1/refunds`. Idempotency-Key. Either chargeId or paymentIntentId | live |
| 8 | `stripe_action_cancel_subscription` | DELETE `/v1/subscriptions/{id}` with optional query params | live |
| 9 | `stripe_action_update_subscription` | Pre-fetch GET to extract `si_xxx`, then POST `/v1/subscriptions/{id}` | live |
| 10 | `stripe_action_create_checkout_session` | POST `/v1/checkout/sessions`. Idempotency-Key. line_items array | live |
| 11 | `stripe_action_create_payment_link` | POST `/v1/payment_links`. line_items array | live |
| 12 | `stripe_action_find_customer` | GET `/v1/customers/{id}` OR GET `/v1/customers?email=`. Returns `{found, customer}` | live |
| 13 | `stripe_action_find_subscription` | GET `/v1/subscriptions/{id}` OR GET `/v1/subscriptions?customer=` | live |
| 14 | `stripe_action_find_payment_intent` | GET `/v1/payment_intents/{id}` | live |

**V1-orphan action files (NOT registered, NOT in node defs) — 13 total:**

| # | File | Description | Status |
|---|---|---|---|
| O1 | `capturePaymentIntent.ts` | POST `/v1/payment_intents/{id}/capture` | V1 dead-code; V2 ships as `capture_payment_intent` |
| O2 | `confirmPaymentIntent.ts` | POST `/v1/payment_intents/{id}/confirm` | V1 dead-code; V2 ships as `confirm_payment_intent` |
| O3 | `createInvoiceItem.ts` | POST `/v1/invoiceitems` | V1 dead-code; V2 doesn't ship |
| O4 | `createPrice.ts` | POST `/v1/prices` | V1 dead-code; V2 doesn't ship |
| O5 | `createProduct.ts` | POST `/v1/products` | V1 dead-code; V2 doesn't ship |
| O6 | `updateInvoice.ts` | POST `/v1/invoices/{id}` | V1 dead-code; V2 doesn't ship |
| O7 | `updateProduct.ts` | POST `/v1/products/{id}` | V1 dead-code; V2 doesn't ship |
| O8 | `finalizeInvoice.ts` | POST `/v1/invoices/{id}/finalize` | V1 dead-code; V2 doesn't ship |
| O9 | `voidInvoice.ts` | POST `/v1/invoices/{id}/void` | V1 dead-code; V2 doesn't ship |
| O10 | `findCharge.ts` | GET `/v1/charges/{id}` OR GET `/v1/charges?payment_intent=` | V1 dead-code; V2 doesn't ship |
| O11 | `findInvoice.ts` | GET `/v1/invoices/{id}` OR list filtered | V1 dead-code; V2 doesn't ship |
| O12 | `listProducts.ts` | GET `/v1/products?limit=...` | V1 dead-code; V2 doesn't ship |
| O13 | `getCustomers.ts` | GET `/v1/customers?limit=...` (list) | V1 dead-code; V2 doesn't ship |

`handleTriggerEvent.ts` (185 LOC) is neither a registered action nor an orphan handler — it's a helper consumed by V1's webhook receive route to flatten Stripe event payloads into workflow `input`. V2 ports this responsibility into `triggers/eventReceived/normalize.ts`.

---

## 3. V1 triggers inventory

V1 registers **9 trigger node defs** under provider `stripe`. All are webhook-driven; lifecycle is per-workflow (each activation creates a dedicated Stripe webhook endpoint via `POST /v1/webhook_endpoints`).

| # | V1 trigger type | Stripe event(s) | Model |
|---|---|---|---|
| 1 | `stripe_trigger_new_payment` | `payment_intent.succeeded`, `charge.succeeded` | webhook, per-workflow |
| 2 | `stripe_trigger_customer_created` | `customer.created` | webhook, per-workflow |
| 3 | `stripe_trigger_subscription_created` | `customer.subscription.created` | webhook, per-workflow |
| 4 | `stripe_trigger_subscription_deleted` | `customer.subscription.deleted` | webhook, per-workflow |
| 5 | `stripe_trigger_invoice_payment_failed` | `invoice.payment_failed` | webhook, per-workflow |
| 6 | `stripe_trigger_new_dispute` | `charge.dispute.created` | webhook, per-workflow |
| 7 | `stripe_trigger_refunded_charge` | `charge.refunded` | webhook, per-workflow |
| 8 | `stripe_trigger_subscription_updated` | `customer.subscription.updated` | webhook, per-workflow |
| 9 | `stripe_trigger_checkout_session_completed` | `checkout.session.completed` | webhook, per-workflow |

**Webhook-route eventMap phantoms (not in node defs, but referenced in [`app/api/webhooks/stripe-integration/route.ts:36-54`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L36)) — 6 total:**

| # | Phantom trigger type | Stripe event | Status |
|---|---|---|---|
| P1 | `stripe_trigger_payment_failed` | `payment_intent.payment_failed` | dead-code reference in eventMap; no node def. V2 allowlist covers the underlying event. |
| P2 | `stripe_trigger_charge_succeeded` | `charge.succeeded` | dead-code reference; no node def. V2 allowlist covers it. |
| P3 | `stripe_trigger_charge_failed` | `charge.failed` | dead-code reference; no node def. V2 allowlist covers it. |
| P4 | `stripe_trigger_invoice_created` | `invoice.created` | dead-code reference; no node def. **NOT in V2 allowlist** (see §10 NPD-S2.a). |
| P5 | `stripe_trigger_invoice_paid` | `invoice.paid` | dead-code reference; no node def. V2 allowlist covers it. |
| P6 | `stripe_trigger_customer_updated` | `customer.updated` | dead-code reference; no node def. V2 allowlist covers it. |

The phantom trigger types are **V1 rot** (R-Stripe-1 below) — the webhook route declares them but no node definition exists, so no workflow could ever register a trigger that produces them. Some look like an "intended later" surface area; some look like leftover code from refactors. Audit treats every phantom as **NOT a missing trigger** because V2's consolidated `event_received` trigger already accepts every Stripe event in the allowlist as a user-selected event-type filter — workflow authors don't need a typed trigger per event.

---

## 4. V2 current surface

V2 ships **10 registered actions** and **1 consolidated webhook trigger** (Slice 11). Files cited inline; the registry is the runtime source of truth.

### Actions ([`services/execution/handlers/_registry.ts:345-354`](../../services/execution/handlers/_registry.ts#L345))

| # | V2 type | Handler | Stripe endpoint | Idempotency-Key |
|---|---|---|---|---|
| 1 | `stripe:create_customer` | [`actions/createCustomer.ts`](../../integrations/stripe/actions/createCustomer.ts) | POST `/v1/customers` | yes (Q4 contract) |
| 2 | `stripe:update_customer` | [`actions/updateCustomer.ts`](../../integrations/stripe/actions/updateCustomer.ts) | POST `/v1/customers/{id}` | no (Stripe POST-update is idempotent on resource id) |
| 3 | `stripe:find_customer` | [`actions/findCustomer.ts`](../../integrations/stripe/actions/findCustomer.ts) | GET `/v1/customers/{id}` OR GET `/v1/customers?email=` | n/a (read) |
| 4 | `stripe:create_payment_intent` | [`actions/createPaymentIntent.ts`](../../integrations/stripe/actions/createPaymentIntent.ts) | POST `/v1/payment_intents` (amount dollars→cents) | yes |
| 5 | `stripe:confirm_payment_intent` | [`actions/confirmPaymentIntent.ts`](../../integrations/stripe/actions/confirmPaymentIntent.ts) | POST `/v1/payment_intents/{id}/confirm` | no (lower-stakes; Stripe confirm is server-idempotent) |
| 6 | `stripe:capture_payment_intent` | [`actions/capturePaymentIntent.ts`](../../integrations/stripe/actions/capturePaymentIntent.ts) | POST `/v1/payment_intents/{id}/capture` (`amount_to_capture` in CENTS — Stripe quirk preserved with explicit schema doc) | no |
| 7 | `stripe:create_refund` | [`actions/createRefund.ts`](../../integrations/stripe/actions/createRefund.ts) | POST `/v1/refunds` (amount dollars→cents) | yes |
| 8 | `stripe:create_subscription` | [`actions/createSubscription.ts`](../../integrations/stripe/actions/createSubscription.ts) | POST `/v1/subscriptions` (single-item items array) | yes |
| 9 | `stripe:update_subscription` | [`actions/updateSubscription.ts`](../../integrations/stripe/actions/updateSubscription.ts) | pre-fetch GET `/v1/subscriptions/{id}` (extract `si_xxx`) → POST `/v1/subscriptions/{id}` | no |
| 10 | `stripe:cancel_subscription` | [`actions/cancelSubscription.ts`](../../integrations/stripe/actions/cancelSubscription.ts) | DELETE `/v1/subscriptions/{id}` with optional query params | no |

### Trigger ([`integrations/stripe/triggers/eventReceived/`](../../integrations/stripe/triggers/eventReceived/))

| # | V2 trigger | Model | Notes |
|---|---|---|---|
| 1 | `stripe:event_received` | webhook, per-workflow programmatic endpoint | Consolidated: workflow author picks one or more Stripe event types from a curated 16-event allowlist. `activate` creates a dedicated Stripe `webhook_endpoints` resource via `POST /v1/webhook_endpoints` with `enabled_events: <picked>`. `deactivate` deletes the endpoint. `normalize` builds a canonical `TriggerEvent` with `eventId: stripe_event.id` (load-bearing for Q4 webhook dedup). Strict-direct-lookup routing — `workflowId` + `nodeId` from URL query params. Single endpoint secret per trigger row; **no multi-secret fallback** (Slice 11 deliberate rejection of V1's per-route try-every-secret loop). |

### Curated event-type allowlist ([`triggers/eventReceived/allowedEventTypes.ts`](../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts)) — 16 events

```
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.created
charge.succeeded
charge.failed
charge.refunded
charge.dispute.created
customer.created
customer.updated
customer.deleted
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
checkout.session.completed
```

The allowlist covers all 9 V1 declared trigger events + 5 of the 6 phantom-eventMap events. Missing: `invoice.created` (P4 phantom). The allowlist is a 1-line additive change; see §10 NPD-S2.a.

### API wrappers

- [`integrations/stripe/api/_request.ts`](../../integrations/stripe/api/_request.ts) — shared Stripe request helper. Routes through `application/x-www-form-urlencoded` (Stripe's wire-format), applies `flattenForStripe` for nested objects/arrays, sets `Stripe-Version: 2025-05-28.basil`, sets Connect's `Stripe-Account: acct_xxx` header from the activated integration's `providerAccountId`, surfaces 401 → `Unauthorized401Error` (refreshAndRetry hook).
- [`api/customers.ts`](../../integrations/stripe/api/customers.ts), [`api/paymentIntents.ts`](../../integrations/stripe/api/paymentIntents.ts), [`api/refunds.ts`](../../integrations/stripe/api/refunds.ts), [`api/subscriptions.ts`](../../integrations/stripe/api/subscriptions.ts) — per-resource wrappers consumed by handlers.

### OAuth ([`integrations/stripe/oauth.ts`](../../integrations/stripe/oauth.ts))

V2's first body-auth refreshable OAuth provider. No PKCE. Manifest: `tokenScope: "user"`, `accountIdField: "stripeUserId"`, `scopes.required: ["read_write"]`, `oauthFlows: ["v2"]`, `refreshable: true`, `apiVersion: "2025-05-28.basil"`, `healthCheckIntervalMs: 12h`.

### Tests + e2e

- **19 unit suites / 173 tests passing** under [`tests/unit/integrations/stripe/`](../../tests/unit/integrations/stripe/). Coverage: manifest + oauth + `_request` + 10 action handlers + 5 trigger files (activate / deactivate / normalize / index / allowedEventTypes) + receive route.
- **1 e2e walkthrough** at [`tests/e2e/slice-11-stripe-walkthrough.spec.ts`](../../tests/e2e/slice-11-stripe-walkthrough.spec.ts) (552 LOC, 1 test): sign in → connect Stripe → build + activate (creates webhook endpoint) → signed event → succeeded run with Idempotency-Key → invalid-sig 401 → unsupported-event ack → replay deduped.

---

## 5. Missing actions

Set difference: **V1 registered actions** minus **V2 registered actions** = 6 missing.

| # | V1 action | V1 LOC | Description |
|---|---|---|---|
| M1 | `stripe_action_create_checkout_session` | 258 | POST `/v1/checkout/sessions`. Stripe Checkout hosted payment page. `line_items` array (priceId multiselect + quantity, or raw passthrough). Idempotency-Key header set. Returns `{ sessionId, url, expiresAt, paymentStatus, status }`. Common Stripe payment flow. |
| M2 | `stripe_action_create_payment_link` | 165 | POST `/v1/payment_links`. Shareable payment URL. `line_items` array. No Idempotency-Key (V1 omits). Returns `{ paymentLinkId, url, active, lineItems, metadata }`. Lighter than checkout session — no return-URL flow. |
| M3 | `stripe_action_create_invoice` | 100 | POST `/v1/invoices`. Creates a draft invoice for a customer; finalization is a separate API call (V1 orphan `finalizeInvoice` covers it but isn't shipped). Returns `{ invoiceId, status, customer, hostedInvoiceUrl, invoicePdf, total, currency }`. |
| M4 | `stripe_action_get_payments` | 79 | GET `/v1/charges?limit=...&customer=...`. List recent charges. Read-only. Returns `{ payments: [...], hasMore, nextCursor }`. |
| M5 | `stripe_action_find_subscription` | 79 | GET `/v1/subscriptions/{id}` OR GET `/v1/subscriptions?customer=...&limit=1`. Returns `{ found, subscription }`. Same shape as shipped `find_customer`. |
| M6 | `stripe_action_find_payment_intent` | 79 | GET `/v1/payment_intents/{id}`. Returns `{ found, paymentIntent }`. Single-id lookup only; no list-by-customer in V1. |

Of these, M5 + M6 are read-only finders that share the V2 `find_customer` shape (returns `{found, …}`, never throws on no-match). M1 + M2 are the largest in terms of handler complexity (line_items array handling, hosted-page metadata). M3 + M4 are short single-call POSTs / GETs.

---

## 6. Missing triggers

Set difference: **V1 declared triggers** minus **V2 declared trigger types** = **0 missing** at the user-visible-trigger level. V2's `event_received` is a deliberate consolidation (Slice 11 §4 / §16 / Marcus accepted).

| # | V1 trigger | V2 coverage |
|---|---|---|
| T1 | `new_payment` | covered by `event_received` config with `eventTypes: ["payment_intent.succeeded", "charge.succeeded"]` |
| T2 | `customer_created` | covered with `eventTypes: ["customer.created"]` |
| T3 | `subscription_created` | covered with `eventTypes: ["customer.subscription.created"]` |
| T4 | `subscription_deleted` | covered with `eventTypes: ["customer.subscription.deleted"]` |
| T5 | `invoice_payment_failed` | covered with `eventTypes: ["invoice.payment_failed"]` |
| T6 | `new_dispute` | covered with `eventTypes: ["charge.dispute.created"]` |
| T7 | `refunded_charge` | covered with `eventTypes: ["charge.refunded"]` |
| T8 | `subscription_updated` | covered with `eventTypes: ["customer.subscription.updated"]` |
| T9 | `checkout_session_completed` | covered with `eventTypes: ["checkout.session.completed"]` |

For workflow authors who used a V1 typed trigger, the V2 equivalent is to configure `event_received` with the corresponding event-type set. No new V2 trigger code is needed.

The only event-allowlist gap is `invoice.created` (a phantom event referenced in V1's webhook route but no V1 node). Adding it is a 1-line decision — see §10 NPD-S2.a.

---

## 7. Port / skip / defer table

Every row from §5 and §6 (plus the V1 orphans from §2 and the phantoms from §3) gets a decision.

### Actions

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| M1 `create_checkout_session` | action | **PORT (Stripe 2.1)** | Common Stripe flow; V1 had it registered + tested; reuses Slice 11's `_request.ts` + Idempotency-Key wiring. Largest port (~150-200 V2 LOC after narrowing). |
| M2 `create_payment_link` | action | **PORT (Stripe 2.1)** | Smaller-surface Checkout cousin; same `line_items` pattern. V2 ~120 LOC. |
| M3 `create_invoice` | action | **PORT (Stripe 2.1)** | Single POST with optional customer + line_items_data preview fields. V2 ~100 LOC. **Triggers NPD-S2.a — add `invoice.created` to event allowlist** so workflow authors can wire create_invoice + event_received in series. |
| M4 `get_payments` | action | **PORT (Stripe 2.1)** | Read-only list `/v1/charges`. V2 ~80 LOC. Returns `{ payments, hasMore, nextCursor }`; single page (matches V2's Notion / Airtable list convention — no auto-pagination). |
| M5 `find_subscription` | action | **PORT (Stripe 2.1)** | Same shape as V2 `find_customer`. V2 ~80 LOC. |
| M6 `find_payment_intent` | action | **PORT (Stripe 2.1)** | Single-id GET. V2 ~70 LOC. |
| O1 `capturePaymentIntent` orphan | action | **N/A — already shipped** | V2 registers `capture_payment_intent` (Slice 11). V1's orphan file was never wired. |
| O2 `confirmPaymentIntent` orphan | action | **N/A — already shipped** | V2 registers `confirm_payment_intent` (Slice 11). V1's orphan file was never wired. |
| O3 `createInvoiceItem` orphan | action | **DEFER (Stripe 2.2 conditional)** | Pairs with `create_invoice` to build itemized drafts. Defer until workflow demand justifies — V1 had it dead-code, so no real-world data points. |
| O4 `createPrice` orphan | action | **DEFER (Stripe 2.2 conditional)** | Pairs with `createProduct`. Products+prices is a catalog-management workflow; defer until product demand. |
| O5 `createProduct` orphan | action | **DEFER (Stripe 2.2 conditional)** | Catalog management. Pairs with `createPrice`. |
| O6 `updateInvoice` orphan | action | **DEFER (Stripe 2.2 conditional)** | POST `/v1/invoices/{id}`. Same wire pattern as `update_customer`. Defer with `create_invoice` line item. |
| O7 `updateProduct` orphan | action | **DEFER (Stripe 2.2 conditional)** | Catalog management. |
| O8 `finalizeInvoice` orphan | action | **DEFER (Stripe 2.2 conditional)** | POST `/v1/invoices/{id}/finalize`. Pairs with `create_invoice`. |
| O9 `voidInvoice` orphan | action | **DEFER (Stripe 2.2 conditional)** | POST `/v1/invoices/{id}/void`. |
| O10 `findCharge` orphan | action | **DEFER (Stripe 2.2 conditional)** | Finder; could ship with M4 `get_payments` if catalog of finder actions is wanted. |
| O11 `findInvoice` orphan | action | **DEFER (Stripe 2.2 conditional)** | Finder. |
| O12 `listProducts` orphan | action | **DEFER (Stripe 2.2 conditional)** | List `/v1/products`. Catalog management. |
| O13 `getCustomers` orphan | action | **SKIP** | Bulk list `/v1/customers?limit=...`. V2 already ships `find_customer` for single-result queries; bulk list is a different use case (catalog export, reconciliation) that PII-heavily exports customer data — defer until product justifies, and consider whether a workflow runs table should ever carry the full bulk-list output (10s of MB). |
| `handleTriggerEvent.ts` helper | helper | **N/A — already absorbed** | V2 `normalize.ts` handles trigger-event flattening; no port required. |
| `flattenForStripe` util | util | **N/A — already ported** | V2 `_request.ts` ships it. |
| `index.ts` (2176 LOC node defs) | node defs | **SKIP** | V2 doesn't carry node-def files — schema lives next to each handler. |
| `StripeTriggerLifecycle.ts` (385 LOC) | lifecycle | **N/A — already ported** | V2 `triggers/eventReceived/{activate,deactivate}.ts` covers per-workflow webhook endpoint lifecycle. Skip orphan-cleanup (Slice 11 Q20). |
| `stripe-integration/route.ts` (368 LOC) | webhook route | **N/A — already ported** | V2 ships `app/api/webhooks/stripe/route.ts` (strict-direct-lookup, single-secret verify). |
| `stripe-billing/route.ts` (947 LOC) | webhook route | **SKIP (Phase 7)** | Internal billing, not workflow Stripe. |
| `stripe-log/route.ts` (122 LOC) | debug route | **SKIP** | Debug helper, not a runtime surface. |

### Triggers

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| T1–T9 (9 typed triggers) | trigger | **N/A — already covered** | V2 `event_received` consolidates with event-type config. Slice 11 acceptance pinned this design. |
| P1 `payment_failed` phantom | phantom | **N/A — V2 allowlist covers `payment_intent.payment_failed`** | Dead-code reference in V1 route; not a node def. |
| P2 `charge_succeeded` phantom | phantom | **N/A — V2 allowlist covers `charge.succeeded`** | Dead-code reference. |
| P3 `charge_failed` phantom | phantom | **N/A — V2 allowlist covers `charge.failed`** | Dead-code reference. |
| P4 `invoice_created` phantom | phantom | **CONDITIONAL ADD (NPD-S2.a)** | Triggers when `create_invoice` ships. 1-line allowlist add. |
| P5 `invoice_paid` phantom | phantom | **N/A — V2 allowlist covers `invoice.paid`** | Dead-code reference. |
| P6 `customer_updated` phantom | phantom | **N/A — V2 allowlist covers `customer.updated`** | Dead-code reference. |

### Summary counts

- **PORT (Stripe 2.1):** 6 actions (M1 + M2 + M3 + M4 + M5 + M6).
- **DEFER (Stripe 2.2 conditional):** 9 orphan actions (O3 + O4 + O5 + O6 + O7 + O8 + O9 + O10 + O11 + O12). Catalog / invoice-line / finder backfill if product demands.
- **SKIP:** 1 orphan action (O13 `getCustomers` — bulk PII export, unclear use case) + 3 V1 routes / files already replaced by V2 (`index.ts` node defs, `stripe-billing`, `stripe-log`).
- **N/A — already covered:** 2 orphan actions (O1 + O2 — V2 already ships these), 1 helper (`handleTriggerEvent`), 1 util (`flattenForStripe`), 1 lifecycle class, 1 webhook route, 9 typed triggers (T1–T9), 5 phantom event types (P1 / P2 / P3 / P5 / P6).
- **CONDITIONAL ADD:** 1 event-allowlist entry (P4 `invoice.created`, gated on M3 shipping).

---

## 8. V1 rot / bugs / dead code inventory

| ID | Pattern | Evidence | V2 status |
|---|---|---|---|
| R-Stripe-1 | Webhook route eventMap declares 6 phantom trigger types (`payment_failed`, `charge_succeeded`, `charge_failed`, `invoice_created`, `invoice_paid`, `customer_updated`) with no corresponding node defs | [`app/api/webhooks/stripe-integration/route.ts:36-54`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L36) | NOT REINTRODUCED. V2's consolidated `event_received` trigger + curated allowlist eliminates the need for typed-trigger-per-event maps. |
| R-Stripe-2 | 13 orphan action handler files exist in `lib/workflows/actions/stripe/` but are NOT in `lib/workflows/actions/registry.ts` and have NO node def — workflow authors cannot use them | `capturePaymentIntent.ts`, `confirmPaymentIntent.ts`, `createInvoiceItem.ts`, `createPrice.ts`, `createProduct.ts`, `updateInvoice.ts`, `updateProduct.ts`, `finalizeInvoice.ts`, `voidInvoice.ts`, `findCharge.ts`, `findInvoice.ts`, `listProducts.ts`, `getCustomers.ts` | NOT PORTED as orphans. V2 either ships them as registered actions (capture/confirm — already shipped in Slice 11) or defers per §7. |
| R-Stripe-3 | `StripeTriggerLifecycle.ts:354-385` per-trigger-type → `enabled_events` map duplicates the V2 allowlist concept with worse data shape | V1 stripe lifecycle bottom map | NOT PORTED. V2's consolidated trigger lets the user pick events directly. |
| R-Stripe-4 | Multi-secret webhook signature verification: V1 tries every active endpoint secret until one matches | [`app/api/webhooks/stripe-integration/route.ts:175-228`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L175) | NOT PORTED. V2 uses strict-direct-lookup with single endpoint secret per trigger row (Slice 11 §16 / Q6). |
| R-Stripe-5 | `oauthConfig.ts:540` `accessTokenExpiryBuffer: 30` pre-emptive refresh-window heuristic | V1 OAuth config | NOT PORTED. V2's reactive 401 → refresh path (via `refreshAndRetry`) doesn't need expiry math. |
| R-Stripe-6 | `handleTriggerEvent.ts` (185 LOC) lives inside the actions/ folder but is not a registered action — it's a helper called from the webhook receive route to "extract" event data | V1 `lib/workflows/actions/stripe/handleTriggerEvent.ts` | NOT PORTED. V2 collapses this into `triggers/eventReceived/normalize.ts` (canonical TriggerEvent build). |
| R-Stripe-7 | V1 mixes dollar-input / cent-input semantics across actions: `createPaymentIntent` / `createRefund` accept dollars and convert to cents; `capturePaymentIntent`'s `amount_to_capture` is in cents directly (`parseInt`, no conversion). Easy to send a 100x-too-small / too-large capture amount. | [`capturePaymentIntent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/capturePaymentIntent.ts) | V2 PRESERVES the V1 quirk for `capture_payment_intent` (Slice 11 decision to match V1 wire-format) but explicitly DOCUMENTS the cents/dollars asymmetry in the schema description. Workflow authors who use `capture_payment_intent` see the cents semantics in the field description. |
| R-Stripe-8 | `lib/integrations/tokenRefreshService.ts` generic refresh helper conflates per-provider quirks (Stripe's `sendRedirectUriWithRefresh`, body-auth, etc.) into a single string-of-conditionals function | V1 token refresh service | NOT PORTED. V2's per-provider `oauth.ts` owns its own refresh wire-format. |
| R-Stripe-9 | `app/api/workflow/stripe/route.ts` (285 LOC) — V1's per-action HTTP intermediary that fetches the workflow → action handler → returns result. Adds a network hop between engine and handler. | V1 route file | NOT PORTED. V2 dispatches handlers in-process via the action handler registry. |
| R-Stripe-10 | `app/api/integrations/stripe/data/` builder-UI dynamic-field data routes coupled to V1's UI conventions | V1 data routes | NOT PORTED. Phase 3 UI work owns the dynamic-field contract; Stripe data routes land alongside. |
| R-Stripe-11 | Stripe Connect `expires_in` handling: V1's `oauthConfig` has `accessTokenExpiryBuffer: 30` but the Stripe Connect token endpoint doesn't always include `expires_in`. V1 may treat missing `expires_in` as 0 (immediate expiry, triggering pre-emptive refresh storm). | Implicit in V1 token refresh service | NOT PORTED. V2's `refreshToken()` records `expires_in` IF present, or `null` otherwise; reactive refresh model doesn't depend on expiry math. |
| R-Stripe-12 | V1's `flattenForStripe` is at `lib/workflows/actions/stripe/utils.ts` (per-provider) — not in a shared utility | V1 utils | V2 absorbs into [`integrations/stripe/api/_request.ts`](../../integrations/stripe/api/_request.ts) (per-provider request helper). Same file location pattern as other V2 providers. |
| R-Stripe-13 | V1 stripe `getCustomers.ts` (orphan) bulk-lists customers without pagination guards or PII redaction | V1 dead-code | NOT PORTED. Slice 11 acceptance pattern: workflow runs table must not carry unbounded PII exports. If a "list customers" action ships, it must be single-page + clearly documented. |
| R-Stripe-14 | V1 node defs file is 2176 LOC monolith | V1 `index.ts` | NOT PORTED. V2 keeps per-action schemas alongside handlers. |

No Stripe-specific patterns rise to "must fix before next slice" severity. The 14 rot rows above are all either fixed by Slice 11's architecture (R-Stripe-3 through R-Stripe-12, R-Stripe-14) or are deferral / skip decisions in §7 (R-Stripe-2, R-Stripe-13).

---

## 9. V2 dependency map

The 6 PORT actions (M1–M6) depend only on existing V2 contracts:

| Action | Dependencies | New contracts needed |
|---|---|---|
| M1 `create_checkout_session` | `_request.ts` (form-encode + `flattenForStripe`), `refreshAndRetry`, Idempotency-Key helpers (`buildIdempotencyKey`, `formatProviderIdempotencyKey` from V2's session-side-effects), `ActionHandler` registry, `getActiveForExecution` | none |
| M2 `create_payment_link` | same as M1 minus Idempotency-Key (V1 omits) | none |
| M3 `create_invoice` | `_request.ts`, `refreshAndRetry`, `ActionHandler` registry | none (allowlist add to `allowedEventTypes.ts` if NPD-S2.a accepted — internal additive, not a contract change) |
| M4 `get_payments` | `_request.ts`, `refreshAndRetry`, `ActionHandler` registry | none |
| M5 `find_subscription` | `_request.ts`, `refreshAndRetry`, `ActionHandler` registry | none |
| M6 `find_payment_intent` | `_request.ts`, `refreshAndRetry`, `ActionHandler` registry | none |

**Zero V2 contract changes** required for the Stripe 2.1 batch. Every action reuses what Slice 11 already shipped. The same applies to Stripe 2.2's orphan-backfill candidates (O3–O12) — same dependencies, no new contracts.

The 6 PORT actions also do NOT introduce new platform infrastructure: no new builder UI dynamic-field protocol, no new webhook routing pattern, no new OAuth flow type, no new shared utility module. Per the Phase 2 master plan §6, this is exactly the parity-slice shape Stripe 2.1 should fit into.

---

## 10. Required platform gaps (if any)

**Zero required platform gaps.** Slice 11 already landed every platform piece Stripe parity needs:

- ✓ Body-auth refreshable OAuth (`integrations/stripe/oauth.ts`).
- ✓ Form-encode + `flattenForStripe` request helper (`_request.ts`).
- ✓ Idempotency-Key wiring (`Stripe-Idempotency-Key` per Q4 contract).
- ✓ Strict-direct-lookup webhook receive (`app/api/webhooks/stripe/route.ts`).
- ✓ Per-workflow `webhook_endpoints` activate / deactivate lifecycle.
- ✓ Consolidated `event_received` trigger model.
- ✓ Curated event-type allowlist with fail-loud activation rejection.
- ✓ V2's first ApiVersion-pinned provider (`Stripe-Version: 2025-05-28.basil`).
- ✓ V2's first `Stripe-Account` header (Connect platform→merchant).

**Two non-platform Open Product Decisions (NPDs) for Marcus:**

### NPD-S1: Orphan-action backfill (Stripe 2.2)

V1 has 11 orphan action files that map to legitimate Stripe APIs (products, prices, invoice items, finalize/void invoice, find charge/invoice, list products, getCustomers). **None are in V1's registry** so they aren't actually a "port" — they're a "build new from V1's reference."

The decision is product-driven, not technical:
- **(a) Build Stripe 2.2 catalog batch** (~5–7 commits for createProduct + createPrice + listProducts + createInvoiceItem + updateInvoice + finalizeInvoice + voidInvoice) — gives workflows the ability to manage a Stripe catalog end-to-end.
- **(b) Build on-demand** — wait for a workflow request that needs catalog/invoice-line management, then port the specific action.
- **(c) Permanent skip** — accept that ChainReact-driven catalog management is out of scope; workflows manage products in Stripe Dashboard, then reference them by `price_xxx` in workflow actions.

Audit recommendation: **(b) on-demand.** V1 left them dead-code for a reason (likely no demand). Don't pre-port without signal. Re-open when a workflow that needs catalog manipulation surfaces.

### NPD-S2: Event-allowlist additions

#### NPD-S2.a: `invoice.created`

If M3 `create_invoice` ships in Stripe 2.1, workflow authors will want a downstream trigger that fires when the invoice is created. Stripe emits `invoice.created` for both API-created and dashboard-created invoices.

- **(a) ADD** `invoice.created` to `allowedEventTypes.ts` as part of Stripe 2.1.
- **(b) SKIP** — workflows that need post-create reaction can poll or use `invoice.paid` / `invoice.payment_failed` downstream.

Audit recommendation: **(a) ADD.** 1-line additive change; no schema migration; minimal review surface. The pair `create_invoice` + `invoice.created` trigger is a natural workflow composition.

#### NPD-S2.b: `customer.subscription.trial_will_end`

Common Stripe workflow: notify customers ~3 days before their trial ends. Stripe emits `customer.subscription.trial_will_end`. V2 allowlist doesn't include it.

- **(a) ADD** as part of Stripe 2.1 (free 1-line change since we're touching the allowlist for S2.a anyway).
- **(b) DEFER** until a specific workflow request surfaces.

Audit recommendation: **(a) ADD.** Same cost as S2.a; high-leverage event that most subscription workflows benefit from. Bundle with S2.a.

---

## 11. Effort estimate

**Stripe 2.1 (6 PORT actions + 2 allowlist additions):** ~Excel-parity-sized = 4–6 commits.

Per-commit rough order of magnitude (modeled on Slice 11 + Microsoft Excel parity):

| Commit | Content | LOC estimate |
|---|---|---|
| 1 | `create_checkout_session` action + schema + tests (largest port; line_items array) | ~300 src + ~300 test |
| 2 | `create_payment_link` action + schema + tests (cousin of M1) | ~200 src + ~200 test |
| 3 | `create_invoice` action + schema + tests + allowlist additions (`invoice.created` + `customer.subscription.trial_will_end`) | ~150 src + ~200 test |
| 4 | `get_payments` action + schema + tests (read-only list) | ~120 src + ~150 test |
| 5 | `find_subscription` + `find_payment_intent` (paired — same `{found, …}` shape) | ~120 src + ~200 test |
| 6 | E2E walkthrough extension (~5–7 new scenarios in `slice-11-stripe-walkthrough.spec.ts`) + outcomes doc + CLAUDE.md update | ~600 e2e + ~400 docs |

**Total estimate: 6 commits, ~1500 src LOC + ~1500 test LOC + ~600 e2e LOC + ~400 docs LOC.**

This is **smaller than Microsoft Excel parity** (which shipped in 6 commits with 4 new actions + 3 new triggers + 1 fold + e2e). Stripe 2.1 has no new triggers and no folds; every action is a single-endpoint POST/GET with a known shape and reuses Slice 11's wire-format machinery.

**Stripe 2.2 (orphan backfill — conditional on NPD-S1 (a)):** ~5–7 additional commits.

**Stripe 2.2 (orphan backfill — recommendation (b) on-demand):** 1 commit per requested action, ~1 day each, no batch.

---

## 12. Risk estimate

### Top 3 risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Cents-vs-dollars asymmetry in M1 / M2 / M3** — `create_checkout_session` / `create_payment_link` `line_items[].amount` is in cents; `create_invoice` doesn't take amount directly (amounts come from invoice items). If V2 schemas conflate dollars vs cents the way V1's `capture_payment_intent` did (cents while neighbors use dollars), workflow authors will write 1000-cent ($10) checkout sessions when they meant $1000. | Medium | High (silent 100x amount error) | Schema-level explicit doc on every amount field: "amount in CENTS (Stripe convention) — `$1.00 = 100`". Q-numbered acceptance rule in CLAUDE.md Deep Gotchas. Bonus: add a unit test that asserts a 4-digit-or-more amount in the field is treated as cents, not dollars. Match V1 wire-format verbatim to avoid surprise; V1 sent cents on these endpoints. |
| 2 | **`create_checkout_session` `line_items` array complexity** — V1's handler (258 LOC) carries multiple input modes: `priceId` multiselect (resolves to `line_items: [{price, quantity}]`), raw `line_items` JSON passthrough, and price-data inline construction. The schema needs to enforce exactly one mode while staying ergonomic. | Medium | Medium (handler-test surface area + schema-validation surface area both balloon) | Adopt V2 Notion 2.1 convention: schemas are `.strict()` and reject unknown fields. Pick ONE input mode (recommend `priceId` + `quantity` — matches V1's preferred path). Defer raw JSON passthrough; document that workflows needing complex multi-price scenarios compose multiple `create_payment_link` calls or use Stripe Dashboard. |
| 3 | **`update_subscription` pre-fetch GET fragility** — V2 already ships this; the audit confirms the pre-fetch wraps in `refreshAndRetry`. Risk is that future Stripe API changes (e.g. moving `items.data[].id` location) silently break the pre-fetch extraction. | Low | High (silently sends wrong `si_xxx` → updates wrong subscription line item) | Already mitigated by V2's defensive extraction (throws on missing `items.data[0].id` rather than fallback). Stripe 2.1 doesn't change `update_subscription` — risk is V2-baseline, not parity-introduced. Audit logs the risk for monitoring; no parity action required. |

Note: Q4 idempotency-key, multi-secret-webhook, and OAuth-refresh risks are **already retired by Slice 11**. The audit's risks are all about new action correctness, not infrastructure.

---

## 13. Recommended parity batch plan

If accepted, Stripe 2.1 ships as 6 commits on `v2-provider-port-local`:

1. **Commit 1 — `feat(stripe): add create_checkout_session action`** — POST `/v1/checkout/sessions` with `line_items: [{price, quantity}]` (single mode), Idempotency-Key header, `mode: "payment" | "subscription"` discriminator, success/cancel URL config, optional `customerId`, `metadata`. Schema reuses V2 Stripe currency rules + `flattenForStripe` machinery. Output: `{ sessionId, url, expiresAt, paymentStatus, status }`. Tests cover the Q4 contract (replay returns cached; payload mismatch surfaces `PAYLOAD_MISMATCH`), nested line_items flatten correctly, livemode reflected from response.
2. **Commit 2 — `feat(stripe): add create_payment_link action`** — POST `/v1/payment_links` with `line_items: [{price, quantity}]`. No Idempotency-Key (V1 omits; payment links are idempotent on price+quantity). Output: `{ paymentLinkId, url, active, lineItems, metadata }`. Smaller surface than M1; reuses Commit 1's `line_items` patterns.
3. **Commit 3 — `feat(stripe): add create_invoice action + extend event allowlist`** — POST `/v1/invoices` for a customer. Optional `description`, `metadata`, `auto_advance` (`true` finalizes immediately; default false). Add `invoice.created` and `customer.subscription.trial_will_end` to `allowedEventTypes.ts`. Output: `{ invoiceId, status, customer, hostedInvoiceUrl, invoicePdf, total, currency }`.
4. **Commit 4 — `feat(stripe): add get_payments list action`** — GET `/v1/charges?limit=...&customer=...`. Single-page list (no auto-pagination). Output: `{ payments: [...], hasMore, nextCursor }`. Schema validates `limit` (1..100).
5. **Commit 5 — `feat(stripe): add find_subscription + find_payment_intent finders`** — GET `/v1/subscriptions/{id}` OR list-by-customer; GET `/v1/payment_intents/{id}`. Returns `{ found, subscription }` / `{ found, paymentIntent }` (mirrors `find_customer` shape).
6. **Commit 6 — `test(stripe): extend walkthrough with parity coverage` + `docs(stripe): document parity outcomes`** — 5–7 new e2e scenarios in `slice-11-stripe-walkthrough.spec.ts` (one per action), plus extend the mock Stripe server with `/v1/checkout/sessions`, `/v1/payment_links`, `/v1/invoices`, `/v1/charges?limit=`, `/v1/subscriptions?customer=`, and `/v1/payment_intents/{id}` endpoints. Outcomes doc at `docs/slices/stripe-2-1-outcomes.md` (mirrors Notion 2.1 / Excel parity outcomes layout). CLAUDE.md updates: `Phase 2 progress (Stripe)` entry + Deep Gotchas Stripe-2.1 patterns subsection.

Each commit individually passes gates: `tsc`, `lint`, `lint:structure`, `lint:migrations`, `jest` focused subset, `jest` full suite. Final commit additionally passes `playwright --workers=1`.

**No commit introduces a new platform contract.** No new shared utility, no new contract type, no new infrastructure cron, no new schema migration.

---

## 14. Exit checklist

This audit is complete when Marcus checks each off:

- [ ] §1 V1 inventory accepted as accurate (14 registered actions, 9 declared triggers, 6 phantom event-map entries, 13 orphan handler files, OAuth + webhook + lifecycle V1 paths).
- [ ] §2 + §3 action / trigger / orphan / phantom counts confirmed.
- [ ] §5 missing-action set accepted (6 missing: M1 + M2 + M3 + M4 + M5 + M6).
- [ ] §6 missing-trigger result accepted (0 missing at the user-trigger level; V2's consolidated `event_received` covers every V1 trigger via event-type config).
- [ ] §7 port/skip/defer table reviewed: **6 PORT** (Stripe 2.1), **9 DEFER** (Stripe 2.2 conditional), **1 SKIP** (O13 `getCustomers`), 2 N/A-already-shipped (O1 + O2).
- [ ] §8 V1 rot inventory reviewed (14 rows, no new "must fix before next slice" findings).
- [ ] §9 confirms zero V2 contract changes required.
- [ ] §10 NPD-S1 decision: (b) on-demand recommended — **accepted / amended / declined.**
- [ ] §10 NPD-S2.a decision: (a) ADD `invoice.created` — **accepted / declined.**
- [ ] §10 NPD-S2.b decision: (a) ADD `customer.subscription.trial_will_end` — **accepted / declined.**
- [ ] §11 effort estimate (6 commits, Stripe-Excel-parity-sized) accepted as realistic.
- [ ] §12 top 3 risks reviewed; cents/dollars asymmetry mitigation strategy accepted.
- [ ] §13 6-commit batch plan order accepted.
- [ ] Marcus signals "begin Stripe 2.1 Commit 1" — implementation can start.

Until every box is checked, **NO Stripe runtime code changes are authorized.** This audit is the gate.
