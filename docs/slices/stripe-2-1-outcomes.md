# Stripe 2.1 — Checkout / Payment Link / Invoice / Charges + Finders outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-stripe.md`](parity-stripe.md) (accepted before Commit 1 began).
**Phase 1 predecessor:** [`docs/slices/slice-11-stripe.md`](slice-11-stripe.md) (10-action OAuth + body-auth refresh + consolidated `event_received` webhook trigger + Idempotency-Key wire-format).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/stripe/`](../../integrations/stripe/).

Stripe 2.1 closes the registered-action parity gap from the audit: 4
net-new ports + 2 read-only finder ports. The slice introduces **zero
new platform infrastructure** — every action reuses Slice 11's
`stripeRequest` + `flattenForStripe` + `refreshAndRetry` + Q4
idempotency wiring. **Zero V2 contract changes.**

The action total rises from 10 → 16. The event allowlist gains 2
entries (`invoice.created` + `customer.subscription.trial_will_end`)
for 18 total. Registered Stripe surface after 2.1 matches V1's 14
registered actions plus 2 V2-extras (`capture_payment_intent` +
`confirm_payment_intent` were V1 orphans; V2 shipped them in Slice 11).

V1's 13 orphan handler files (products / prices / invoice line items /
finalize / void / findCharge / findInvoice / listProducts /
getCustomers — none in V1's registry) are **intentionally not
ported** in this slice. Orphan-action backfill is on-demand only and
gated by product signal, not by code-presence in V1.

---

## 1. Scope shipped

### Actions (6)

| Action | Stripe endpoint | What it does | V1 reference |
|---|---|---|---|
| `create_checkout_session` | `POST /v1/checkout/sessions` | Creates a Stripe-hosted Checkout session (payment / subscription / setup modes). | `lib/workflows/actions/stripe/createCheckoutSession.ts` |
| `create_payment_link` | `POST /v1/payment_links` | Creates a reusable, shareable Stripe-hosted payment URL. | `lib/workflows/actions/stripe/createPaymentLink.ts` |
| `create_invoice` | `POST /v1/invoices` | Creates a draft invoice for an existing customer (optional `auto_advance` to skip auto-finalize). | `lib/workflows/actions/stripe/createInvoice.ts` |
| `get_payments` | `GET /v1/charges` | Single-page list of charges (Stripe's "payments collected" surface). | `lib/workflows/actions/stripe/getPayments.ts` |
| `find_subscription` | `GET /v1/subscriptions/{id}` | Direct id lookup; 404 → `{found:false, subscription:null}`. | `lib/workflows/actions/stripe/findSubscription.ts` |
| `find_payment_intent` | `GET /v1/payment_intents/{id}` | Direct id lookup; 404 → `{found:false, paymentIntent:null}`. | `lib/workflows/actions/stripe/findPaymentIntent.ts` |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Stripe action total after 2.1: 16** (10 Slice 11 + 6 Stripe 2.1).

### API wrappers (6 new / extended)

| Wrapper | Module | Used by |
|---|---|---|
| `checkoutSessionsCreate` | NEW [`api/checkoutSessions.ts`](../../integrations/stripe/api/checkoutSessions.ts) | `create_checkout_session` |
| `paymentLinksCreate` | NEW [`api/paymentLinks.ts`](../../integrations/stripe/api/paymentLinks.ts) | `create_payment_link` |
| `invoicesCreate` | NEW [`api/invoices.ts`](../../integrations/stripe/api/invoices.ts) | `create_invoice` |
| `chargesList` | NEW [`api/charges.ts`](../../integrations/stripe/api/charges.ts) | `get_payments` |
| `subscriptionsGet` | EXTENDED [`api/subscriptions.ts`](../../integrations/stripe/api/subscriptions.ts) (Slice 11 wrapper + added dedicated tests; `StripeSubscription` type extended with `collection_method` / `currency` / `latest_invoice` / `livemode`) | `find_subscription` |
| `paymentIntentsGet` | EXTENDED [`api/paymentIntents.ts`](../../integrations/stripe/api/paymentIntents.ts) (new wrapper; `StripePaymentIntent` type extended with `latest_charge`) | `find_payment_intent` |

All 6 wrappers route through Slice 11's
[`stripeRequest`](../../integrations/stripe/api/_request.ts):
- `Stripe-Version: 2025-05-28.basil` pinned by [`_shared/stripe/api/_base.ts`](../../integrations/_shared/stripe/api/_base.ts).
- `Authorization: Bearer <accessToken>` (decrypted merchant access token).
- POSTs use `application/x-www-form-urlencoded` with bracket-notation flattening via [`flattenForStripe`](../../integrations/_shared/stripe/flattenForStripe.ts).
- GETs send no body and no `Content-Type`.
- `STRIPE_API_BASE` env override — every request (used by the e2e mock surface).
- 401 → `Unauthorized401Error` (refresh-and-retry handles).
- 404 → `NotFoundError(resourceLabel)` with stable per-wrapper labels.
- Other non-2xx → tagged `Error("Stripe <METHOD> <path> failed: <surfaced message>")`.

**Zero changes** to `stripeRequest` / `_base.ts` / `errors.ts` /
`flattenForStripe.ts`.

### Event allowlist additions

| Event type | Added in | Rationale |
|---|---|---|
| `invoice.created` | Commit 3 (create_invoice) | Closes V1's phantom-eventMap reference + pairs with the new `create_invoice` action so workflows can react to invoice creation downstream. |
| `customer.subscription.trial_will_end` | Commit 3 (create_invoice; bundled per audit NPD-S2.b) | Stripe emits this ~3 days before a trial ends — common "nudge before trial conversion" workflow. |

**Slice 11's 16 events preserved unchanged.** Allowlist total after
2.1: **18 events**.
[`integrations/stripe/triggers/eventReceived/allowedEventTypes.ts`](../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts).

The e2e walkthrough's unsupported-event scenario was migrated from
`invoice.created` (now in allowlist) → `account.updated` (Stripe
Connect platform event still outside the allowlist).

### Manifest scope changes

**None.** Slice 11's `read_write` scope covers every Stripe 2.1 action.
Stripe Connect's OAuth scope model is binary
(`read_only` / `read_write`); deferred scope work stays deferred.

---

## 2. Durable decisions worth preserving

### 2.1 Typed schemas only — no raw Stripe payload passthrough

V1 accepted JSON-string fields on multiple actions:
- `createPaymentLink.line_items` (`JSON.parse` on input string).
- `createCheckoutSession.line_items` (same).
- `createCheckoutSession.metadata` / `createInvoice.metadata` / `createPaymentLink.metadata` (all `JSON.parse` strings).
- `createPaymentLink.after_completion` (raw JSON string).

V2 ships **strict typed Zod schemas** for every action. `lineItems` is
`[{ priceId, quantity }]`; `metadata` is `Record<string, string>`;
`afterCompletion` is a `z.discriminatedUnion("type", ...)` with
`redirect` (typed `redirectUrl`) / `hosted_confirmation` variants. Raw
JSON-string passthrough is rejected at the schema layer (`.strict()`).

### 2.2 Explicit `mode` for Checkout Sessions — no auto-detection probe

V1's `createCheckoutSession` issued an extra `GET /v1/prices/{firstPriceId}`
before each POST to auto-detect `mode` from the price type. V2 makes
the workflow author choose `mode` (`payment` / `subscription` / `setup`)
explicitly. Stripe's API enforces the price-type ↔ mode match
server-side; the probe was redundant. NOT PORTED.

### 2.3 No hidden quantity coercion

V1's create-checkout-session / payment-link handlers did
`parseInt(quantity) || 1` — accepting any value and silently
defaulting to 1. V2 requires `quantity` as `z.number().int().positive()`;
invalid values reject at design time.

### 2.4 No input spreading into output — bounded projections only

Every Stripe 2.1 handler builds output from a fixed key set off the
Stripe wire response. No `...result` spread. Output key sets are
locked:

| Action | Output keys |
|---|---|
| `create_checkout_session` | 17 keys: `sessionId, url, mode, status, paymentStatus, customerId, customerEmail, clientReferenceId, paymentIntentId, subscriptionId, amountTotal, currency, expiresAt, successUrl, cancelUrl, metadata, livemode` |
| `create_payment_link` | 6 keys: `paymentLinkId, url, active, currency, metadata, livemode` |
| `create_invoice` | 14 keys: `invoiceId, customerId, subscriptionId, status, collectionMethod, autoAdvance, hostedInvoiceUrl, invoicePdf, amountDue, amountPaid, currency, description, metadata, livemode` |
| `get_payments` | `payments[]` (13-key bounded charge projection) + `count, hasMore, nextCursor` |
| `find_subscription` | `{found, subscription}` where `subscription` is 14 keys: `subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt, trialStart, trialEnd, collectionMethod, currency, latestInvoiceId, metadata, livemode` |
| `find_payment_intent` | `{found, paymentIntent}` where `paymentIntent` is 12 keys: `paymentIntentId, amount, amountReceived, currency, status, customerId, latestChargeId, paymentMethodId, description, receiptEmail, metadata, livemode` |

Nulls are preserved where Stripe returns nullable fields
(`canceledAt`, `trialStart`, `latestInvoiceId`, `customerId`,
`latestChargeId`, etc.).

### 2.5 Idempotency-Key on POSTs; no header on GETs

`create_checkout_session`, `create_payment_link`, `create_invoice`
each send `Idempotency-Key: ${runId}:${nodeId}:<actionType>` via
[`buildIdempotencyKey`](../../core/workflows/idempotency.ts). Suffixes:

| Action | Action-type suffix |
|---|---|
| `create_checkout_session` | `stripe_action_create_checkout_session` |
| `create_payment_link` | `stripe_action_create_payment_link` |
| `create_invoice` | `stripe_action_create_invoice` |

V2 **adds** Idempotency-Key on `create_payment_link` + `create_invoice`
where V1 omitted it — Stripe's 24-hour server-side dedup protects
against engine retries / webhook re-deliveries / manual re-runs.

`get_payments`, `find_subscription`, `find_payment_intent` are GET
endpoints. **No `Idempotency-Key` header** — Stripe rejects the header
on GET requests. Unit tests + e2e both assert the header is absent.

### 2.6 Single-page list / finder behavior

`get_payments` returns ONE page of charges. Workflow authors compose a
downstream loop on `nextCursor` (the last charge's id when
`hasMore: true`, else `null`). V1's `getPayments` had no
auto-pagination either; V2 mirrors the surface but on the correct
endpoint (`/v1/charges`, not V1's `/v1/payment_intents` — see 2.7).

`find_subscription` and `find_payment_intent` are direct id lookups
only. **No list / search fallback.** V1's `findSubscription` was
already direct-only; V1's `findCustomer` had an email-list fallback
that V2 preserves on `find_customer` (Slice 11) but does NOT extend to
the new finders.

### 2.7 `get_payments` endpoint correction

V1's `getPayments` hit `/v1/payment_intents` and called the result
"payments." V2 corrects to `/v1/charges` per parity-stripe §5 M4 —
"payments collected" semantically equals charges, not intents. The new
`find_payment_intent` action covers PaymentIntent lookups separately.

### 2.8 No client-side `status` filter on `get_payments`

V1 fetched all results then filtered by `status` client-side because
Stripe doesn't accept `status` as a `payment_intents` query param.
V2 rejects the pattern — workflow authors compose a downstream filter
node if status filtering is needed. The burn-quota-then-discard
behavior should not be buried inside an action.

### 2.9 `find_subscription` / `find_payment_intent` — 404 = `found: false`

Mirrors the Slice 11 `find_customer` pattern. The wrapper layer
throws `NotFoundError`; the handler catches it and returns
`{found: false, ...}`. "Find" is semantically allowed-to-return-zero;
non-404 errors still propagate.

### 2.10 No `create_invoice` finalize / pay / void / send side effects

V1's orphan handlers `finalizeInvoice` / `voidInvoice` /
`createInvoiceItem` are NOT ported. V2's `create_invoice` creates a
draft only. `auto_advance: true` (Stripe's server default) lets Stripe
itself queue collection; `auto_advance: false` keeps the invoice in
draft until a downstream action explicitly finalizes (orphan backfill
slice candidate). The action does not attach line items, does not
finalize, does not send.

### 2.11 No platform-fee / Stripe Connect application_fee passthrough

V1 supports `applicationFeeAmount` / `applicationFeePercent` /
`transfer_data` on multiple handlers via untyped object shapes. V2
defers — Slice 11 didn't ship a platform-fee convention for any of
its 10 actions, and Stripe 2.1 inherits the gap. Adding a typed
platform-fee surface is a follow-up batch decision, not a Stripe 2.1
concern.

### 2.12 V2 chose `live` Stripe events; no off-allowlist sneak

Allowlist additions are explicit. `invoice.created` and
`customer.subscription.trial_will_end` were the only two new event
types added in 2.1. The walkthrough's unsupported-event scenario uses
`account.updated` as the canary — Stripe Connect platform-account
events remain off-allowlist by design (no workflow author has signed
up for platform-side admin alerting).

---

## 3. V1 rot skipped (consolidated)

All parity-stripe §8 rot items + §"V1-orphan action files" addressed:

| ID | Pattern | V2 status |
|---|---|---|
| Raw JSON-string passthrough on `line_items` / `metadata` / `after_completion` / `automatic_tax` | NOT PORTED — typed Zod required at every entry point |
| `parseInt(quantity) \|\| 1` silent coercion | NOT PORTED — schema rejects invalid |
| `parseInt(feeAmount.toString())` platform-fee coercion | NOT PORTED — defer typed platform-fee convention |
| `JSON.parse(metadata)` on every create handler | NOT PORTED — typed `Record<string, string>` only |
| `Math.min(limit, 100)` silent clamp on `getPayments` | NOT PORTED — `int().min(1).max(100)` rejects out-of-range |
| Client-side `status` filter on `getPayments` | NOT PORTED — compose downstream filter node instead |
| `getPayments` hitting `/v1/payment_intents` | NOT PORTED — corrected to `/v1/charges` |
| Hidden auto-mode probe (`GET /v1/prices/{firstPriceId}` before checkout) | NOT PORTED — workflow author chooses `mode` |
| `success: false` synthetic ActionResult envelopes | NOT PORTED — errors propagate to the engine |
| V1 `dueDate` echo on `createInvoice` output (no input field) | NOT PORTED — bounded projection rebuilt from Stripe response only |
| `findInvoice` orphan | NOT PORTED |
| `findCharge` orphan | NOT PORTED |
| `getCustomers` bulk-list-customers orphan | NOT PORTED — PII bulk export needs an explicit product decision |
| `createInvoiceItem` orphan | DEFERRED — pairs with `create_invoice` but no product signal yet |
| `createPrice` / `createProduct` orphans | DEFERRED — catalog-management workflow set |
| `updateInvoice` / `updateProduct` orphans | DEFERRED |
| `finalizeInvoice` / `voidInvoice` orphans | DEFERRED — invoice lifecycle pairs with `createInvoiceItem` |
| `listProducts` orphan | DEFERRED |
| V1's phantom-trigger `invoice.created` reference (no node def) | RESOLVED — V2 added `invoice.created` to the allowlist alongside `create_invoice` |
| Stripe billing webhook | OUT OF SCOPE — V2's `/api/webhooks/stripe-billing` is a separate billing-product concern; Stripe 2.1 left it untouched |
| `stripe-log` route | OUT OF SCOPE |
| V1's multi-secret signature-verify loop on webhook receive | NOT PORTED — Slice 11 already ships strict-direct lookup |

---

## 4. Files shipped

### Source

**Schemas + handlers (Commits 1-5):**
- [`integrations/stripe/actions/createCheckoutSession.ts`](../../integrations/stripe/actions/createCheckoutSession.ts) + `.schema.ts` (Commit 1)
- [`integrations/stripe/actions/createPaymentLink.ts`](../../integrations/stripe/actions/createPaymentLink.ts) + `.schema.ts` (Commit 2)
- [`integrations/stripe/actions/createInvoice.ts`](../../integrations/stripe/actions/createInvoice.ts) + `.schema.ts` (Commit 3)
- [`integrations/stripe/actions/getPayments.ts`](../../integrations/stripe/actions/getPayments.ts) + `.schema.ts` (Commit 4)
- [`integrations/stripe/actions/findSubscription.ts`](../../integrations/stripe/actions/findSubscription.ts) + `.schema.ts` (Commit 5)
- [`integrations/stripe/actions/findPaymentIntent.ts`](../../integrations/stripe/actions/findPaymentIntent.ts) + `.schema.ts` (Commit 5)

**API wrappers:**
- [`integrations/stripe/api/checkoutSessions.ts`](../../integrations/stripe/api/checkoutSessions.ts) (NEW — Commit 1)
- [`integrations/stripe/api/paymentLinks.ts`](../../integrations/stripe/api/paymentLinks.ts) (NEW — Commit 2)
- [`integrations/stripe/api/invoices.ts`](../../integrations/stripe/api/invoices.ts) (NEW — Commit 3)
- [`integrations/stripe/api/charges.ts`](../../integrations/stripe/api/charges.ts) (NEW — Commit 4)
- [`integrations/stripe/api/subscriptions.ts`](../../integrations/stripe/api/subscriptions.ts) (EXTENDED — Commit 5 added `StripeSubscription` fields + dedicated wrapper tests; `subscriptionsGet` itself shipped in Slice 11)
- [`integrations/stripe/api/paymentIntents.ts`](../../integrations/stripe/api/paymentIntents.ts) (EXTENDED — Commit 5 added `paymentIntentsGet` + `latest_charge` field)

**Allowlist:**
- [`integrations/stripe/triggers/eventReceived/allowedEventTypes.ts`](../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts) (EXTENDED — Commit 3 added `invoice.created` + `customer.subscription.trial_will_end`)

**Registry:** [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) updated once per implementation commit (6 new entries total).

### Tests

| Commit | Wrapper tests | Schema tests | Handler tests | Other |
|---|---|---|---|---|
| 1 | 14 (checkoutSessions) | 19 | 13 | — |
| 2 | 14 (paymentLinks) | 21 | 12 | — |
| 3 | 13 (invoices) | 12 | 14 | +2 allowlist additions |
| 4 | 13 (charges) | 16 | 17 | — |
| 5 | 10 (subscriptions GET) + 10 (paymentIntents GET) | 6 + 6 | 9 + 10 | manifest expected-list updated 14 → 16 |
| 6 | — | — | — | +1 fan-out e2e scenario |

**Stripe focused subset after Commit 5:** 38 suites / 466 tests passing.
**Stripe e2e after Commit 6:** 2 tests / both green, `--workers=1`.

### Docs

- [`docs/slices/parity-stripe.md`](parity-stripe.md) (Commit 0 — audit)
- This file (Commit 7)
- CLAUDE.md updates (Commit 7 — Phase 2 progress entry + Deep Gotchas durable notes)

---

## 5. Commit breakdown (7)

| # | Commit hash | What landed |
|---|---|---|
| 0 | `6369fb550` | `docs(stripe): add parity audit` |
| 1 | `bfd6a2a45` | `feat(stripe): add create checkout session action` |
| 2 | `9648e8482` | `feat(stripe): add create payment link action` |
| 3 | `a0a3ba199` | `feat(stripe): add create invoice action` (+ allowlist `invoice.created` + `customer.subscription.trial_will_end`) |
| 4 | `f81524f21` | `feat(stripe): add get payments action` |
| 5 | `e11c6655c` | `feat(stripe): add subscription and payment intent finders` |
| 6 | `cee1381fa` | `test(stripe): extend walkthrough with 2.1 actions` (fan-out e2e + mock 6 endpoints; fixed stale unsupported-event scenario to `account.updated`) |
| 7 | (this commit) | `docs(stripe): document 2.1 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test` (Stripe focused subset green throughout)

Commit 6 additionally passes `npx playwright test
tests/e2e/slice-11-stripe-walkthrough.spec.ts --workers=1`.

Final unit-test totals after Commit 6: **643 suites / 6081 tests
passing.**

---

## 6. Acceptance criteria (post-merge)

- [x] 6 actions registered in `services/execution/handlers/_registry.ts`.
- [x] 4 new wrapper modules + 2 extended wrapper modules.
- [x] Every wrapper routes through `stripeRequest` — no inline `fetch` calls.
- [x] Every handler uses `refreshAndRetry` with `accountId = triggerEvent.accountId`.
- [x] Every schema is `.strict()` — unknown fields rejected at design time.
- [x] `create_checkout_session.mode` is required and explicit.
- [x] `create_invoice.customerId` is required; auto_advance is opt-in opt-out only.
- [x] Every output key set is locked via test assertions; nulls preserved on nullable Stripe fields.
- [x] POST actions send Idempotency-Key with the documented suffix; GET actions do NOT.
- [x] `get_payments` is single-page only; `nextCursor` derives from last charge when `hasMore: true`.
- [x] `find_subscription` / `find_payment_intent` are direct-id lookup only; 404 → `{found: false, ...}`.
- [x] Allowlist additions are exactly `invoice.created` + `customer.subscription.trial_will_end`; existing 16 events preserved.
- [x] E2E fan-out test: one signed `payment_intent.succeeded` event triggers 6 workflows; per-action wire-format assertions.
- [x] Stale unsupported-event scenario migrated from `invoice.created` → `account.updated`.
- [x] No orphan handlers ported.
- [x] No Stripe billing webhook touched.
- [x] No raw payload escape hatch.

---

## 7. What's deferred

### Deferred to Stripe 2.2 (orphan-action backfill — conditional on product signal)

Per parity-stripe NPD-S1 — V1's 13 orphan handlers were never wired
in V1's registry, so this is a "build new" decision, not a "port"
decision. Bullet list mirrors parity-stripe §"V1-orphan action files":

| Orphan | Stripe endpoint | Notes |
|---|---|---|
| `createInvoiceItem` | `POST /v1/invoiceitems` | Pairs with `create_invoice` to build itemized drafts. Defer until workflow demand justifies. |
| `createPrice` | `POST /v1/prices` | Pairs with `createProduct`. Catalog-management workflow set. |
| `createProduct` | `POST /v1/products` | Catalog management. |
| `updateInvoice` | `POST /v1/invoices/{id}` | Pre-finalization invoice edits. |
| `updateProduct` | `POST /v1/products/{id}` | Catalog management. |
| `finalizeInvoice` | `POST /v1/invoices/{id}/finalize` | Invoice lifecycle. |
| `voidInvoice` | `POST /v1/invoices/{id}/void` | Invoice lifecycle. |
| `findCharge` | `GET /v1/charges/{id}` | Pairs with `get_payments`; would mirror `find_payment_intent` shape. |
| `findInvoice` | `GET /v1/invoices/{id}` | Pairs with `create_invoice`; would mirror `find_subscription` shape. |
| `listProducts` | `GET /v1/products?limit=...` | Catalog browsing. |

Backfill rules: typed schemas only, bounded output projections,
Idempotency-Key on POSTs, no header on GETs, no raw passthrough, same
wrapper / handler / registry conventions as Stripe 2.1.

### Deferred to Stripe Connect platform-fee batch (no current convention)

V1 supports `applicationFeeAmount` / `applicationFeePercent` /
`transfer_data` on multiple handlers via untyped object shapes. V2
defers until a typed convention is agreed across all Slice 11
handlers and the Stripe 2.1 surface.

### Permanently skipped

| Item | Reason |
|---|---|
| `getCustomers` (bulk customer list) | PII bulk export needs an explicit product decision; not a 2.x action surface |
| `make_api_call` style escape hatch | Not in V1 for Stripe; V2 won't introduce one |
| Raw `line_items` / `metadata` / `after_completion` JSON-string passthrough | Replaced by typed Zod schemas |
| Client-side `status` filter on `get_payments` | Burn-quota-then-discard pattern; compose downstream filter |
| V1 `success: false` synthetic ActionResult envelopes | Errors propagate to the engine |
| V1 hidden auto-mode probe (`GET /v1/prices/{firstPriceId}`) | Workflow author chooses `mode` |
| V1 `dueDate` echo on `createInvoice` output (no input field) | Bounded projection rebuilt from Stripe response only |
| Stripe billing webhook | `app/api/webhooks/stripe-billing` is a separate billing-product concern; out of provider parity scope |
| `stripe-log` route | Out of provider parity scope |
| V1 multi-secret signature-verify loop | Slice 11 already ships strict-direct lookup |
| Subscription `items[].data` raw passthrough on `find_subscription` | Bounded projection only — use a future `get_subscription_items` if needed |
| `client_secret` / `next_action` on `find_payment_intent` output | Mid-flow / confirm-time fields; not appropriate for a "find" projection |

---

## 8. CLAUDE.md updates landed

A new "Phase 2 progress (Stripe)" subsection adds the Stripe 2.1 entry
under the existing Phase 2 progress block. Plus a short
"Deep Gotchas → Stripe Phase 2 patterns" subsection records six
durable rules:

- Stripe 2.1 actions are typed and narrow; no raw Stripe payload passthrough.
- POST create actions use Idempotency-Key with the `${runId}:${nodeId}:stripe_action_*` shape; GET / list / find actions do NOT.
- List actions are single-page by default — workflow authors compose pagination loops on `nextCursor`.
- Finder actions return `{found: false, ...}` on 404; non-404 errors still propagate.
- Do not pre-port orphan Stripe handlers without explicit product signal — V1's 13 orphan `.ts` files are intentional dead code.
- One Stripe event can fan out to many workflows; do NOT design e2e as N events × N workflows (Slack-2.3 / Stripe-2.1 pattern: one event, dispatch handles the fan-out via `services/triggers/dispatch.ts:listForDispatch`).

---

## 9. What's next (Stripe roadmap)

Per parity-stripe §"Roadmap":

- **Stripe 2.2** — orphan-action backfill, **CONDITIONAL on product signal** for the catalog/invoice-item/finder gaps listed in §7 above. Same wrapper / handler / registry conventions; no new platform infrastructure expected.
- **Stripe Connect platform-fee batch** — needs a typed convention across all `application_fee_*` / `transfer_data` carrying actions. Cross-cuts Slice 11 + Stripe 2.1 surface; defer until product asks.

Tracking lives in [`docs/slices/parity-stripe.md`](parity-stripe.md)
§§11–13. None of the deferred items are committed for follow-up
timing in this slice.
