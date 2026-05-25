# Phase 3 — Stripe Action Metadata Plan

**Status:** Plan only. No metadata / runtime / handler changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Checkpoint reference:** [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md) §8 ranked Stripe as the next provider metadata batch after Notion — no new resolver needed, mostly flat object-id fields, high direct revenue relevance.
**Companion plans:** [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md), [`./notion-action-metadata-plan.md`](./notion-action-metadata-plan.md), [`./options-source-plan.md`](./options-source-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md), [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md).

This plan sequences the Stripe action metas onto the existing builder infrastructure. By the end of the arc, Stripe flips into `COVERED_PROVIDERS` and the structural test enforces 1:1 handler-to-meta coverage from then on. No new resolver, no new field type, no runtime schema or handler changes. **One open Stripe trigger meta is intentionally deferred** — see §3.

---

## 1. Current Stripe metadata state

| Surface | Status |
| --- | --- |
| Triggers (handlers) | 1 registered — `stripe:event_received` (webhook). Activation hook at [`integrations/stripe/triggers/eventReceived/activate.ts`](../../../integrations/stripe/triggers/eventReceived/activate.ts) accepts `enabledEvents: string[]` filtered against the 18-entry allowlist at [`allowedEventTypes.ts`](../../../integrations/stripe/triggers/eventReceived/allowedEventTypes.ts). |
| Trigger metas | **0** — no `*.meta.ts` exists under `integrations/stripe/triggers/`. Intentionally deferred from this arc — see §3 for the reason. |
| Action metas | **0 of 16** — Stripe has zero discovery metadata today. |
| Async options source | **None.** No `stripe:*` resolver registered in [`services/options/_registry.ts`](../../../services/options/_registry.ts). |
| `COVERED_PROVIDERS` membership | NOT included — Stripe stays uncovered until every action handler has a meta. |
| Outstanding action handlers | **16** (full inventory in §2). |
| Provider route test status | [`tests/unit/app/api/providers/providers-route.test.ts:124-134`](../../../tests/unit/app/api/providers/providers-route.test.ts) currently asserts `hubspot.hasMetadata === false` as the next-uncovered guard. Once Stripe action metas land, Stripe's `hasMetadata` flips to true via `listProvidersWithMetadata`. |

---

## 2. Full Stripe action handler inventory

Verified by reading [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 435-453 (16 entries) and every schema + handler under [`integrations/stripe/actions/`](../../../integrations/stripe/actions/). Cross-referenced against the live live `*.meta.ts` glob (returns zero results today).

| # | Handler key | Schema file | User-configurable fields | Output shape | Concerns / notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `stripe:create_customer` | [`createCustomer.schema.ts`](../../../integrations/stripe/actions/createCustomer.schema.ts) | `email` (required, RFC email), `name?`, `description?`, `metadata?` (Record<string,string>) | `{customerId, email, name, description, created, livemode, metadata}` | PORT. Cleanest "id + scalar" surface — no money movement, no XOR. |
| 2 | `stripe:update_customer` | [`updateCustomer.schema.ts`](../../../integrations/stripe/actions/updateCustomer.schema.ts) | `customerId` (required), `email?`, `name?`, `description?`, `metadata?` | mirrors create_customer | PORT. PATCH semantics — only set fields are updated. |
| 3 | `stripe:find_customer` | [`findCustomer.schema.ts`](../../../integrations/stripe/actions/findCustomer.schema.ts) | XOR (`customerId?` OR `email?`) | `{found, customer: {…} \| null}` | PORT. Cross-field XOR runtime-enforced; description-only at meta level. |
| 4 | `stripe:create_payment_intent` | [`createPaymentIntent.schema.ts`](../../../integrations/stripe/actions/createPaymentIntent.schema.ts) | `amount` (req, **DOLLARS**), `currency` (req, lowercase ISO-4217), `customerId?`, `description?`, `metadata?` | `{paymentIntentId, clientSecret, amount, currency, status, customerId, description, created, metadata, nextAction}` | PORT. **CRITICAL FOOTGUN:** `amount` is in DOLLARS here but in CENTS on `capture_payment_intent`. Meta description MUST scream "USD dollars (e.g. 20.99); handler converts to cents." Output `amount` is in CENTS (Stripe wire-format echo). |
| 5 | `stripe:confirm_payment_intent` | [`confirmPaymentIntent.schema.ts`](../../../integrations/stripe/actions/confirmPaymentIntent.schema.ts) | `paymentIntentId` (req), `payment_method?`, `receipt_email?`, `return_url?` | `{paymentIntentId, status, amount, currency, clientSecret, nextAction}` | PORT. **NOTE:** schema uses snake_case for `payment_method` / `receipt_email` / `return_url` (V1 cutover parity); meta field names must mirror exactly. |
| 6 | `stripe:capture_payment_intent` | [`capturePaymentIntent.schema.ts`](../../../integrations/stripe/actions/capturePaymentIntent.schema.ts) | `paymentIntentId` (req), `amount_to_capture?` (**CENTS, integer**) | `{paymentIntentId, status, amount, amountCaptured, currency}` | PORT. **CRITICAL FOOTGUN:** `amount_to_capture` is in CENTS (not dollars). Meta description MUST scream "Stripe wire-format CENTS — e.g. 2099 for $20.99." Field is `number` with `integer:true, min:1`. Omit to capture full authorized amount (common case). |
| 7 | `stripe:create_refund` | [`createRefund.schema.ts`](../../../integrations/stripe/actions/createRefund.schema.ts) | XOR (`chargeId?` OR `paymentIntentId?`), `amount?` (**DOLLARS**), `reason?` (enum 3 values), `metadata?` | `{refundId, amount, currency, status, charge, paymentIntent, reason, receiptNumber, created, metadata}` | PORT. XOR runtime-enforced. `amount` in DOLLARS (handler converts). Omit for full refund (common case). `reason` enum: `duplicate \| fraudulent \| requested_by_customer`. |
| 8 | `stripe:create_subscription` | [`createSubscription.schema.ts`](../../../integrations/stripe/actions/createSubscription.schema.ts) | `customerId` (req), `priceId` (req), `default_payment_method?`, `payment_behavior?` (enum 4 values), `trialPeriodDays?` (positive int), `metadata?` | `{subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, trialStart, trialEnd, priceId, quantity, created, metadata}` | PORT. Single-price subscription only (multi-item deferred at schema). |
| 9 | `stripe:update_subscription` | [`updateSubscription.schema.ts`](../../../integrations/stripe/actions/updateSubscription.schema.ts) | `subscriptionId` (req), `priceId?`, `quantity?`, `trial_end?` (union `number \| "now"`), `cancel_at_period_end?`, `proration_behavior?` (enum), `default_payment_method?`, `metadata?`, `collection_method?` (enum), `days_until_due?` | `{subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, trialStart, trialEnd, items, metadata}` | PORT. **NOTE:** `trial_end` is `union(number \| "now")` — model as `text` with placeholder explaining BOTH forms (numeric epoch OR literal `"now"`). |
| 10 | `stripe:cancel_subscription` | [`cancelSubscription.schema.ts`](../../../integrations/stripe/actions/cancelSubscription.schema.ts) | `subscriptionId` (req), `at_period_end?`, `invoice_now?`, `prorate?` | `{subscriptionId, status, canceledAt, cancelAtPeriodEnd, currentPeriodEnd, customerId, endedAt}` | PORT. **DESTRUCTIVE — money-moving:** description must clearly state immediate vs at-period-end behavior. All three flags optional with NO default (Q11). |
| 11 | `stripe:create_checkout_session` | [`createCheckoutSession.schema.ts`](../../../integrations/stripe/actions/createCheckoutSession.schema.ts) | `mode` (req enum 3 values), `successUrl` (req URL), `cancelUrl` (req URL), `lineItems?` (`[{priceId, quantity}]`, conditional on mode), `customer?` XOR `customerEmail?`, `clientReferenceId?`, `metadata?`, `allowPromotionCodes?`, `automaticTax?` (`{enabled: boolean}`) | `{sessionId, url, mode, status, paymentStatus, customerId, customerEmail, clientReferenceId, paymentIntentId, subscriptionId, amountTotal, currency, expiresAt, successUrl, cancelUrl, metadata, livemode}` | PORT. **HEAVIEST META:** 9 user-configurable fields. Two cross-field constraints (mode↔lineItems, customer↔customerEmail). `lineItems` + `automaticTax` are paste-JSON textareas (nested-object shape). |
| 12 | `stripe:create_payment_link` | [`createPaymentLink.schema.ts`](../../../integrations/stripe/actions/createPaymentLink.schema.ts) | `lineItems` (req `[{priceId, quantity}]`, 1..20), `metadata?`, `allowPromotionCodes?`, `afterCompletion?` (discriminated union) | `{paymentLinkId, url, active, currency, metadata, livemode}` | PORT. `lineItems` + `afterCompletion` are paste-JSON textareas. Note: handler does NOT echo `lineItems` in output (Stripe omits without `expand`); meta description explains. |
| 13 | `stripe:create_invoice` | [`createInvoice.schema.ts`](../../../integrations/stripe/actions/createInvoice.schema.ts) | `customerId` (req), `description?`, `metadata?`, `autoAdvance?` | `{invoiceId, customerId, subscriptionId, status, collectionMethod, autoAdvance, hostedInvoiceUrl, invoicePdf, amountDue, amountPaid, currency, description, metadata, livemode}` | PORT. **`autoAdvance` carries side-effect risk:** when true (Stripe's default), Stripe auto-finalizes the draft and queues collection. Meta description must explain default behavior + non-destructive false override. |
| 14 | `stripe:get_payments` | [`getPayments.schema.ts`](../../../integrations/stripe/actions/getPayments.schema.ts) | `customer?`, `limit?` (1..100, integer), `startingAfter?` XOR `endingBefore?` | `{payments: array, count, hasMore, nextCursor}` — each entry: `{chargeId, amount, currency, status, paid, refunded, customerId, paymentIntentId, created, description, receiptUrl, metadata, livemode}` | PORT. **Pagination is exposed** — `startingAfter` / `endingBefore` are author-supplied cursors (unlike Notion which omits cursors entirely). XOR runtime-enforced. |
| 15 | `stripe:find_subscription` | [`findSubscription.schema.ts`](../../../integrations/stripe/actions/findSubscription.schema.ts) | `subscriptionId` (req) | `{found, subscription: {…} \| null}` | PORT. Id-only lookup. Returns `found: false` on 404 (no throw). |
| 16 | `stripe:find_payment_intent` | [`findPaymentIntent.schema.ts`](../../../integrations/stripe/actions/findPaymentIntent.schema.ts) | `paymentIntentId` (req) | `{found, paymentIntent: {…} \| null}` | PORT. Id-only lookup. Same `found: false` shape as find_customer / find_subscription. |

**Totals:** 16 handlers · 0 metas · **16 metas missing** · **0 DEFER · 0 SKIP** — every registered handler is in scope for metadata coverage. No dead/unregistered handlers; no permanently-unsupported actions.

### 2.1 Cross-cutting observations

- **Every action requires the Stripe integration** (`requiresIntegration: true`). Stripe has no native variant.
- **Zero `producesFileRef` / `consumesFileRef`** actions in Stripe. FileRef is irrelevant to this batch (no attachment / file surfaces on the registered actions).
- **`metadata` field appears on 9 of 16 actions.** It's always `Record<string, string>` (Stripe's wire-format constraint). **Perfect fit for `keyvalue` FieldType** — no other provider's metadata batch has had this clean a fit. See §4.2.
- **Two unique field shapes need paste-JSON:** `lineItems` (on `create_checkout_session` + `create_payment_link`) and `afterCompletion` + `automaticTax` (on `create_payment_link` / `create_checkout_session`). Mirrors Slack `post_interactive_blocks.blocks` + Notion `properties` precedent.
- **Amount unit footgun is the biggest documentation risk** — `create_payment_intent.amount` and `create_refund.amount` are DOLLARS; `capture_payment_intent.amount_to_capture` is CENTS. Schemas document this but the meta layer is the user-facing surface — descriptions must be unambiguous. See §8.
- **Pagination model differs from Notion** — Stripe exposes `startingAfter` / `endingBefore` as author-supplied cursors on `get_payments` (Stripe's list convention is "id of last result", not opaque tokens). Notion omitted `startCursor`; Stripe DOES expose them. See §4.3.
- **Four "find" actions return `{found, …: {…} \| null}`** instead of throwing on 404 — a different output convention from Notion's `get_*` actions which throw on missing. Meta outputs document this shape explicitly.
- **`clientSecret` is intentionally exposed on PaymentIntent outputs** — required for frontend payment confirmation flows. NOT a leak. Description should explain its purpose without warning fatigue.

---

## 3. Trigger inventory — defer one meta

Stripe ships exactly **one** trigger handler — `stripe:event_received` (webhook). The activation hook validates `enabledEvents: string[]` against an 18-entry allowlist:

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
customer.subscription.trial_will_end
invoice.created
invoice.paid
invoice.payment_failed
checkout.session.completed
```

### 3.1 Why this trigger meta DEFERS from this arc

The Stripe trigger meta needs **multi-select with a static allowlist** for `enabledEvents`. The ideal renderer is `select` / `combobox` with `multiple: true` + 18 static options. But:

1. **Multi-select combobox is deferred** per Slice 3.7 ([Slack plan §4.2](./slack-action-metadata-plan.md), `invite_users_to_channel.users` precedent). The contract slot exists but the renderer doesn't.
2. **Falling back to `string-array`** (free-text chip input) loses the allowlist-aware UX — authors would have to type `"payment_intent.succeeded"` exactly, with no validation hint until activation. Runtime activate would reject typos, but design-time UX would be a footgun.
3. **`COVERED_PROVIDERS` does NOT require trigger metas.** Verified in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts): `listRegisteredHandlers()` returns only action handlers, and the structural test enforces 1:1 between those and `listAllActionMetas()`. Notion shipped to coverage with zero triggers.
4. **`hasMetadata=true` flips on action metas alone** — `listProvidersWithMetadata()` iterates BOTH action and trigger metas, so action metas are sufficient to flip Stripe.

**Recommendation:** Defer `stripe:event_received.meta.ts` to a follow-up slice that lands AFTER multi-select combobox infrastructure. Document explicitly so this trigger meta gap doesn't get lost.

### 3.2 If Marcus disagrees with deferral

The fallback is `string-array` for `enabledEvents` — would surface 18 valid values via the description but lose static-allowlist validation. Three options to layer in if needed in the meantime:

| Approach | Pros | Cons |
| --- | --- | --- |
| `string-array` + description listing the 18 event types | Lands immediately, no new infra | Author must type exactly; typos fail at activation, not design time |
| Single `select` + force one event per workflow trigger | Renderer works today | Loses Stripe's "subscribe to N events on one workflow" semantics — would force authors to clone the trigger node |
| Build multi-select combobox renderer alongside Stripe trigger meta | Best UX | Out of scope for the Stripe action arc; multi-slice infrastructure investment |

**Plan ships action-only.** Trigger meta gets its own follow-up.

---

## 4. Field metadata strategy

### 4.1 Use existing FieldTypes only

Every Stripe field maps cleanly to one of the 12 existing `FieldType` variants. **No new FieldType is introduced in this batch.** The mapping:

| Schema field shape | FieldType | Reason |
| --- | --- | --- |
| `z.string().min(1)` IDs (`customerId`, `paymentIntentId`, `chargeId`, `subscriptionId`, `priceId`, `payment_method`) | `text` | v1 stays text-first; future `stripe:customers` / `stripe:prices` resolvers can flip these without contract churn. |
| `z.string().email()` (`email`, `customerEmail`, `receipt_email`) | `text` | No `email` FieldType; renderer uses a plain text input. Description hints at the email format. |
| `z.string().url(...)` (`successUrl`, `cancelUrl`, `return_url`, `afterCompletion.redirectUrl`) | `text` | No `url` FieldType today. |
| `z.string().regex(/^[a-z]{3}$/)` (`currency`) | `text` | Schema enforces lowercase ISO-4217. Description shows the regex hint. **NOT a `select`** even though there's a finite list — Stripe supports 135+ currencies; static options would balloon the meta. |
| `z.union([z.number().positive(), z.string().regex(...)])` (`amount` on payment_intent / refund, DOLLARS) | `number` with `numeric: {min: 0.01, step: 0.01}` | NOT `integer: true` — amount in dollars allows 2 decimal places. Description ANCHORS the unit ("USD dollars, e.g. 20.99 — handler converts to cents for Stripe"). |
| `z.number().int().positive()` (`amount_to_capture` CENTS, `trialPeriodDays`, `limit`, `quantity`, `days_until_due`, `clientReferenceId` length) | `number` with `numeric: {min: 1, integer: true, step: 1}` | Description for `amount_to_capture` ANCHORS the unit ("Stripe wire-format CENTS, e.g. 2099 for $20.99"). |
| `z.boolean()` (`autoAdvance`, `allowPromotionCodes`, `at_period_end`, `invoice_now`, `prorate`, `cancel_at_period_end`) | `boolean` | No defaults — Q11 stance preserves explicit user choice. |
| `z.enum(...)` with ≤ 10 values (`reason`, `payment_behavior`, `proration_behavior`, `collection_method`, `mode`) | `select` with static `options[]` | Each option's `label` is a human-readable form of the enum value (e.g. `requested_by_customer` → "Requested by customer"). |
| `z.record(z.string(), z.string())` (`metadata` — 9 actions) | **`keyvalue`** | Perfect contract fit — `keyvalue` is `Record<string, string>` natively. See §4.2. |
| `z.string()` body / multi-line (`description`) | `textarea` | Multi-line free input. |
| Nested object / discriminated union (`lineItems`, `afterCompletion`, `automaticTax`, `trial_end` union) | `textarea` | Paste-JSON OR `{{...}}` reference. Mirrors Notion + Slack precedent. See §4.4. |

### 4.2 `metadata` fields → `keyvalue` (clean win)

9 of 16 actions accept a `metadata: Record<string, string>` field. This is the cleanest `keyvalue` fit in any provider batch to date. Every metadata field renders as:

```ts
{
  name: "metadata",
  label: "Metadata",
  description: "Optional key/value pairs persisted on the Stripe object. Stripe coerces non-string values to strings server-side; the meta layer stays strict (Record<string,string>) to surface conversion at design time.",
  type: "keyvalue",
  required: false,
  keyValueMaxRows: 50,
}
```

Stripe's documented cap is 50 keys per metadata object — set `keyValueMaxRows: 50` to match. No `defaultValue` (Q11).

### 4.3 Pagination cursors are AUTHOR-SUPPLIED (differs from Notion)

Notion omitted `startCursor` from every meta because Stripe / Notion pagination is server-managed. **Stripe is different** — `get_payments` exposes `startingAfter` and `endingBefore` as part of the user-facing config. The handler computes `nextCursor` from the last result's id (Stripe's list convention).

So `get_payments` ships BOTH cursor fields as `text` (optional), with descriptions documenting:
- "Forward pagination — id of the last charge from the previous page" (`startingAfter`)
- "Backward pagination — id of the first charge from the next page; mutually exclusive with startingAfter" (`endingBefore`)

The XOR is runtime-enforced (description-only at meta layer).

### 4.4 Paste-JSON fields → `textarea` (3 unique shapes)

Three logical fields across the inventory carry nested object/array shapes that no single FieldType represents structurally. Follows the established Slack `post_interactive_blocks.blocks` + Notion `properties` precedent.

| Field | Where it appears | Shape | Placeholder |
| --- | --- | --- | --- |
| `lineItems` | `create_checkout_session`, `create_payment_link` | `[{priceId: string, quantity: positiveInt}]` (1..99 on checkout, 1..20 on payment_link) | `[{"priceId":"price_1ABC","quantity":1}]` |
| `automaticTax` | `create_checkout_session` | `{enabled: boolean}` | `{"enabled":true}` |
| `afterCompletion` | `create_payment_link` | discriminated `{type:"redirect",redirectUrl} \| {type:"hosted_confirmation"}` | `{"type":"redirect","redirectUrl":"https://example.com/thanks"}` |

`trial_end` on `update_subscription` is special — `union(number, "now")`. **Model as `text`** with placeholder `now` or `1798765432` (a unix epoch second). Authors type either the literal `"now"` (with quotes interpreted at the runtime layer) or a number. The runtime schema's `z.union([z.number().int().positive(), z.literal("now")])` accepts both.

### 4.5 Required vs optional

Mirror the Zod schemas exactly. Q11 (no hidden high-risk defaults) — none of the Stripe fields trip the high-risk list ([`learning/docs/handler-defaults-audit.md`](../../../learning/docs/handler-defaults-audit.md) registry has zero Stripe entries). Three schema-`refine`d cross-field constraints (description-only at meta layer):

- `find_customer`: exactly one of `customerId` / `email`.
- `create_refund`: exactly one of `chargeId` / `paymentIntentId`.
- `create_checkout_session`: `mode === "setup"` rejects `lineItems`; other modes require it. AND `customer` + `customerEmail` are mutually exclusive.
- `get_payments`: `startingAfter` + `endingBefore` are mutually exclusive.

### 4.6 What metas MUST NOT expose

- **Internal handler knobs** (`idempotencyKey` — the handler builds it from `runId:nodeId:actionType`). NOT a user-facing field; never expose.
- **`accountId`** — resolved automatically from `triggerEvent` or integration row. Never a user-facing field.
- **Raw bytes / base64 / content / data.** None apply — Stripe has no FileRef-producing actions.

---

## 5. `optionsSource` strategy

**No Stripe option resolvers ship in this slice.** All ID fields (`customerId`, `paymentIntentId`, `chargeId`, `subscriptionId`, `priceId`, `payment_method`) render as plain `text` for v1.

Reasoning (matches Slack + Notion precedent — ship coverage first, picker polish later):

- The highest-leverage candidate is `stripe:customers` — `find_customer.customerId`, `update_customer.customerId`, `create_payment_intent.customerId`, `create_subscription.customerId`, `create_invoice.customerId`, `create_checkout_session.customer`, `get_payments.customer` would all benefit. But Stripe customer lists frequently exceed 100 entries per merchant, so the single-page resolver model from `slack:channels` would need search-by-email behavior to be useful. Out of scope for the metadata batch.
- `stripe:prices` — `create_subscription.priceId`, `lineItems[*].priceId` on checkout / payment_link. Same single-page concern.
- `stripe:products` — could feed a 2-hop cascade (`product → price`). Real product, but multi-hop cascade testing is better validated on Google Sheets first.
- `stripe:subscriptions` — only `find_subscription.subscriptionId` and `update_subscription.subscriptionId` benefit. Workflows typically wire from `{{stripe:create_subscription.subscriptionId}}` or a Stripe trigger event. Low marginal value.
- Most Stripe ID fields in real workflows are wired from upstream Stripe action outputs OR from trigger event payloads. The variable picker already handles that case.
- The metadata coverage unlock (16 actions) dwarfs the marginal UX improvement on typed-id fields.

**Future possible resolvers** (each = single-slice polish on top of completed metadata coverage):

| Source | Backing API | Would unlock | Priority |
| --- | --- | --- | --- |
| `stripe:customers` (with `email` search) | `GET /v1/customers?limit=20[&email=X]` | 7 customer-id fields | **Highest** for Stripe UX polish. Search-by-email is the key affordance. |
| `stripe:prices` (with `product` filter) | `GET /v1/prices?limit=20[&product=X]` | `priceId` on subscription + lineItems | Medium — pricing changes infrequently; authors copy ids from Stripe Dashboard. |
| `stripe:products` | `GET /v1/products?limit=20` | parent for `stripe:prices` cascade | Medium — cascade test bed. |
| `stripe:subscriptions` | `GET /v1/subscriptions?limit=20[&customer=X]` | 2 subscription-id fields | Low. |

Each resolver is a 1-slice polish on top of completed metadata coverage. **None block this batch.**

---

## 6. Output metadata strategy

Mirror handler return shapes verbatim. Verified by reading every handler under [`integrations/stripe/actions/`](../../../integrations/stripe/actions/) — output shapes are stable per Slice 11 + Stripe 2.1 commits.

### 6.1 Output discipline

- **No raw Stripe response spreads at top level.** Every output names its fields explicitly per the handler's `return { output: { ... } }` statement (verified across all 16 handlers).
- **Bounded sub-objects ARE allowed at the field level.** `metadata` (echoed `Record<string,string>`), `nextAction` (Stripe's polymorphic 3DS/setup descriptor on PaymentIntent), `items` (subscription items array on `update_subscription`), `payments[]` (charge projection array on `get_payments`), `customer` / `subscription` / `paymentIntent` (nested find-action results). All bounded by handler projections — declared as `object` / `array` at meta level.
- **`clientSecret` is exposed intentionally** on `create_payment_intent` and `confirm_payment_intent` outputs. Required for frontend Payment Element confirmation. Description documents the use without warning fatigue — workflows that don't need it simply don't reference it.
- **`amount` is in CENTS in outputs** (Stripe wire-format). Different from `amount` in INPUTS on create_payment_intent / create_refund where it's in DOLLARS. Description must clarify the asymmetry per-output.
- **No `bytes` / `base64` / `content` / `data` sibling fields** — Stripe has no FileRef-producing actions. Verified via registry test (will be added in §11.1).
- **Output descriptions are picker-useful.** "Stripe payment intent id — wire to confirm_payment_intent.paymentIntentId or capture_payment_intent.paymentIntentId downstream" beats "the payment intent id".

### 6.2 Per-action output shape summary

Drafted by reading each handler's `return { output: ... }`. Final descriptions land at meta-implementation time.

| Action | Output keys |
| --- | --- |
| `create_customer` / `update_customer` | `customerId`, `email`, `name`, `description`, `created`, `livemode`, `metadata` |
| `find_customer` | `found: boolean`, `customer: object \| null` (`{customerId, email, name, description, created, livemode, metadata}`) |
| `create_payment_intent` | `paymentIntentId`, `clientSecret`, `amount` (CENTS), `currency`, `status`, `customerId`, `description`, `created`, `metadata`, `nextAction: object` |
| `confirm_payment_intent` | `paymentIntentId`, `status`, `amount` (CENTS), `currency`, `clientSecret`, `nextAction: object` |
| `capture_payment_intent` | `paymentIntentId`, `status`, `amount` (CENTS), `amountCaptured` (CENTS), `currency` |
| `create_refund` | `refundId`, `amount` (CENTS), `currency`, `status`, `charge`, `paymentIntent`, `reason`, `receiptNumber`, `created`, `metadata` |
| `create_subscription` | `subscriptionId`, `customerId`, `status`, `currentPeriodStart` (ISO), `currentPeriodEnd` (ISO), `cancelAtPeriodEnd`, `trialStart` (ISO), `trialEnd` (ISO), `priceId`, `quantity`, `created`, `metadata` |
| `update_subscription` | `subscriptionId`, `customerId`, `status`, `currentPeriodStart` (Unix), `currentPeriodEnd` (Unix), `cancelAtPeriodEnd`, `trialStart` (Unix), `trialEnd` (Unix), `items: array`, `metadata` |
| `cancel_subscription` | `subscriptionId`, `status`, `canceledAt`, `cancelAtPeriodEnd`, `currentPeriodEnd`, `customerId`, `endedAt` |
| `create_checkout_session` | `sessionId`, `url`, `mode`, `status`, `paymentStatus`, `customerId`, `customerEmail`, `clientReferenceId`, `paymentIntentId`, `subscriptionId`, `amountTotal`, `currency`, `expiresAt`, `successUrl`, `cancelUrl`, `metadata`, `livemode` |
| `create_payment_link` | `paymentLinkId`, `url`, `active`, `currency`, `metadata`, `livemode` |
| `create_invoice` | `invoiceId`, `customerId`, `subscriptionId`, `status`, `collectionMethod`, `autoAdvance`, `hostedInvoiceUrl`, `invoicePdf`, `amountDue`, `amountPaid`, `currency`, `description`, `metadata`, `livemode` |
| `get_payments` | `payments: array`, `count: number`, `hasMore: boolean`, `nextCursor: string` |
| `find_subscription` | `found: boolean`, `subscription: object \| null` (14-key projection) |
| `find_payment_intent` | `found: boolean`, `paymentIntent: object \| null` (12-key projection) |

All `producesFileRef` / `consumesFileRef` flags are **false** for every Stripe action.

### 6.3 V1-to-V2 output asymmetry to surface in descriptions

`create_subscription` returns `currentPeriodStart` / `currentPeriodEnd` / `trialStart` / `trialEnd` as **ISO strings**, but `update_subscription` returns them as **Unix epoch seconds**. This is V1 behavior preserved mechanically (handler comments call it out). The meta output type is `string` for both — but description on `update_subscription` outputs should explicitly say "Unix epoch seconds" so downstream consumers don't expect ISO. Drift fix is a runtime concern, NOT a meta concern (per Slack precedent — meta mirrors handler).

---

## 7. Category strategy

`ActionCategorySchema` ([`contracts/actionMeta.ts:306-321`](../../../contracts/actionMeta.ts)) enum: `messaging`, `email`, `calendar`, `files`, `data`, `commerce`, `crm`, `marketing`, `developer`, `logic`, `http`, `transform`, `scheduling`, `other`. **`commerce`** exists and is the obvious fit.

**Recommendation: all 16 Stripe actions use `category: "commerce"`.** Reasoning:

- Matches the "one category per provider" precedent (Slack `messaging` for 28 of 31; Notion `data` for all 16; Outlook `email` for all 9).
- Stripe's surface is uniformly billing/payment/subscription/invoice — all commerce.
- `commerce` is currently empty in the discovery registry (no provider has shipped commerce-category metas yet). Stripe seeds the category.
- Alternatives considered and rejected:
  - **Split by action type** (customer CRUD → `crm`; payment/refund → `commerce`; subscription → `commerce`). Inconsistent — Stripe's customer surface is billing-context, not CRM-context.
  - **`crm` for customer-only actions.** Wrong — Stripe customers exist for billing relationships, not CRM.
  - **`data` for `get_payments` / `find_*`.** Inconsistent — they're reading commerce data, not arbitrary records.

The picker UI groups by category visually; using a single Stripe category keeps the surface compact and seeds the `commerce` bucket for future Shopify metas.

---

## 8. Safety / Q11 review (money-moving risk surface)

Stripe actions can move money, cancel subscriptions, refund payments, and create charges. The metadata layer's job is to surface these consequences clearly at design time. **No runtime changes are proposed here** — runtime Q11 enforcement is the schema's job. This section catalogs what META DESCRIPTIONS must communicate clearly.

### 8.1 Critical safety findings (all schema-level, runtime-enforced)

| Action | Risk | What meta description must say |
| --- | --- | --- |
| `create_payment_intent` | Authorizes a charge against a payment method (typically only `succeeded` once `confirm_payment_intent` runs). `amount` in **DOLLARS**. | "USD dollars (e.g. 20.99). Handler converts to cents for Stripe. Output `amount` echoes back in CENTS (Stripe wire-format)." |
| `confirm_payment_intent` | Triggers the actual charge attempt. | "Completes the payment authorization. Customer is charged synchronously (or 3DS-redirected via the `nextAction` output)." |
| `capture_payment_intent` | Money movement. `amount_to_capture` in **CENTS**. | "Captures (settles) a previously-authorized payment intent. `amount_to_capture` is in CENTS (e.g. 2099 for $20.99). Omit to capture the full authorized amount. **Different unit from create_payment_intent.amount which is DOLLARS.**" |
| `create_refund` | Reverses a charge — money out. `amount` in **DOLLARS**. | "Refunds a charge or payment intent. Omit `amount` for a full refund (the common case). `amount` is in USD dollars; handler converts to cents." |
| `create_subscription` | Recurring billing setup. | "Subscribes the customer to a price. Stripe begins billing per the price's cadence. `payment_behavior` controls how Stripe handles upfront payment failures — pick explicitly (no default)." |
| `update_subscription` | Can change billing cadence / pricing mid-cycle. | "Mutates an existing subscription. `proration_behavior` controls how Stripe handles mid-period price changes — explicit choice required." |
| `cancel_subscription` | Stops billing. | "Cancels the subscription. `at_period_end: true` keeps the subscription active until the current period ends (most common for paid customers). `at_period_end: false` (or unset) cancels immediately. Choose explicitly." |
| `create_checkout_session` | Customer-facing payment URL. | "Creates a Stripe-hosted checkout page. `mode` picks payment / subscription / setup — Stripe validates the mode↔price-type pairing server-side." |
| `create_payment_link` | Reusable payment URL. | "Creates a shareable payment URL. The link is reusable across customers — destructive in the sense that it persists publicly until deactivated." |
| `create_invoice` | Bills a customer. `autoAdvance` behavior matters. | "Creates a draft invoice. When `autoAdvance: true` (default), Stripe automatically finalizes the draft and attempts collection. Pass `autoAdvance: false` to keep it in `draft` for downstream actions to attach line items first." |

### 8.2 Q11 — no hidden destructive defaults

Verified by reading every schema: no Stripe action has a hidden destructive default. All money-moving choices (refund amount, cancel timing, proration, capture amount) are user-controlled. `proration_behavior` is optional (Stripe's server-side default is `create_prorations`); `payment_behavior` is optional. The meta layer mirrors the schema — no `defaultValue` on any high-risk field.

**No runtime changes proposed in this plan.** If a future audit finds a hidden destructive default, it's a runtime concern (handler / schema), not a meta concern.

### 8.3 Documentation discipline

Every money-moving action's `description` (top-level meta description) must:
1. State the side effect in one sentence.
2. Name the unit when amounts are involved (dollars vs cents).
3. Note the destructive-vs-reversible posture (refund is reversible by issuing another payment; cancel is potentially reversible via re-subscribe; charge capture is NOT reversible without a refund).

Description copy is drafted at implementation time; this plan locks the policy.

---

## 9. Implementation grouping

**Recommendation: TWO implementation slices.** Group split by surface area, with the heavier metas (and risk surface) bundled in the second slice.

### 9.1 Slice 3.45 — Stripe customer + payment lifecycle (8 actions)

`create_customer`, `update_customer`, `find_customer`, `create_payment_intent`, `confirm_payment_intent`, `capture_payment_intent`, `create_refund`, `find_payment_intent`.

Why grouped together: the "money in / money out" core. Every action keys on `customerId` / `paymentIntentId` / `chargeId`. Documents the dollars/cents footgun in the canonical place (`create_payment_intent` + `capture_payment_intent` are in the same slice — back-to-back tests force any inconsistency to surface). Includes one of the heaviest find-action outputs (`find_payment_intent`'s 12-key projection).

Single integration test: `stripe-create-payment-intent-config.test.tsx` — exercises the dollars-amount field + currency regex + clientSecret output round-trip. (See §11.3.)

### 9.2 Slice 3.46 — Stripe subscriptions + commerce surfaces + COVERED_PROVIDERS flip (8 actions + structural)

`create_subscription`, `update_subscription`, `cancel_subscription`, `find_subscription`, `create_checkout_session`, `create_payment_link`, `create_invoice`, `get_payments` + Stripe added to `COVERED_PROVIDERS` + final regression sweep.

Why grouped: the recurring-billing + customer-facing-commerce surface. Bundles the heaviest meta (`create_checkout_session` — 9 fields, 2 cross-field constraints, 3 nested-object fields). `create_payment_link` rides here because it shares the lineItems shape. The COVERED_PROVIDERS flip lands in this same slice — same precedent as Slack 3.38 and Notion 3.42.

Single integration test: `stripe-create-checkout-session-config.test.tsx` — exercises every UX shape in one go (text URLs, select enum for `mode`, paste-JSON `lineItems`, keyvalue `metadata`, boolean `allowPromotionCodes`, paste-JSON `automaticTax`). (See §11.3.)

### 9.3 Slice size rationale

- 3.45 is 8 actions — moderate. Three actions involve money movement (PI create / capture / refund), each with clear unit-documentation requirements. The other 5 are flat customer + find shapes.
- 3.46 is 8 actions including the heaviest single meta in the entire Stripe surface (`create_checkout_session`). The COVERED_PROVIDERS flip rides here per established precedent.
- Symmetric split (8/8) keeps both slices reviewable in one sitting.

### 9.4 Alternative groupings considered

- **Single slice (all 16).** Reject — same reason Slack and Notion avoided it. A 16-meta single PR is unforgiving. Plus the checkout/payment-link/invoice/get-payments surface is heavier than the customer/PI surface; splitting lets the lighter slice ship first.
- **Three slices (customer / payment-intent / subscription+commerce).** Reject — too granular; the resulting slices would each be 4-6 actions which is below the threshold where multi-slice splitting pays for itself.
- **Split by risk** (low-risk read-only vs high-risk money-moving). Reject — the find_* / get_payments actions don't cleanly separate from their write counterparts (`find_customer` belongs with `create_customer`; `find_payment_intent` belongs with `create_payment_intent`).

---

## 10. `COVERED_PROVIDERS` strategy

Stripe stays out of [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) `COVERED_PROVIDERS` until the final Slice 3.46. Until then the structural test treats Stripe as uncovered (`{native, github, gmail, microsoft-outlook, slack, notion}` only).

The flip itself is one line + a green regression sweep:

```ts
const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
  "slack",
  "notion",
  "stripe",         // ← added at the end of Slice 3.46
]);
```

The structural test will then enforce: every Stripe handler in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (16 entries) MUST have a meta in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts). Drift becomes a build error.

**Trigger meta gap is explicitly EXCLUDED from the COVERED_PROVIDERS gate** — the structural test only enforces action coverage. The deferred `stripe:event_received.meta.ts` (see §3) does NOT block the flip.

The flip MUST land in the same PR as the last batch of action metas (Slice 3.46). Splitting would mean a red `main` between PRs.

---

## 11. Testing strategy

### 11.1 Per-slice registry tests

Each implementation slice adds metas to [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts) and extends [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts) with per-action assertions:

- Stripe action count matches the registered handler count (8 after Slice 3.45, 16 after Slice 3.46).
- All Stripe metas have `provider: "stripe"`.
- All Stripe metas have `requiresIntegration: true`.
- All Stripe metas have `category: "commerce"` (pinned per §7).
- All Stripe metas have `producesFileRef: false` and `consumesFileRef: false`.
- Field names + types + required flags mirror the Zod schema (per-action).
- Outputs match the handler return shape verbatim (per-action).
- `displayOrder` is unique within Stripe and produces a stable sort.
- **Unit-anchoring assertion:** `create_payment_intent.amount` description contains "dollars"; `capture_payment_intent.amount_to_capture` description contains "cents". Catches drift that would re-introduce the footgun.
- **`keyvalue` metadata assertion:** every action whose schema declares `metadata` exposes a `keyvalue` field with `keyValueMaxRows: 50`.

### 11.2 Provider-route count test

[`tests/unit/app/api/providers/providers-route.test.ts:124-134`](../../../tests/unit/app/api/providers/providers-route.test.ts) currently asserts `hubspot.hasMetadata === false`. **First implementation slice (3.45) flips Stripe's `hasMetadata` to `true`** AND adds a `GET /api/providers/stripe/actions` route assertion (8 metas after 3.45 → 16 after 3.46, in displayOrder). After 3.46, swap the "next-uncovered guard" from `hubspot` to whatever the new uncovered leader is (will be hubspot or mailchimp depending on next-slice direction).

### 11.3 Integration tests

Add tests sparingly — one canonical builder-shell flow per major UX shape, not one per action. Mirror Slack + Notion precedent:

| Slice | Canonical integration test | Why this action |
| --- | --- | --- |
| 3.45 | `stripe-create-payment-intent-config.test.tsx` | Exercises the DOLLARS amount field (`number` with decimal step) + currency text field with regex hint + customerId text + metadata `keyvalue` chip flow + clientSecret output. If this works, the lighter customer/find_* metas in the same slice work. |
| 3.46 | `stripe-create-checkout-session-config.test.tsx` | Exercises every UX shape: text URLs, `select` enum for `mode`, paste-JSON `lineItems`, `keyvalue` `metadata`, `boolean` `allowPromotionCodes`, paste-JSON `automaticTax`. The heaviest Stripe meta. Round-trips through Modal Save → Toolbar Save like the Slack / Notion integration tests. |

**Total: 2 integration tests across 2 slices.** Mirrors the Notion ratio (4/16 = 25%). Stripe's slice count is the same (2) but the actions group up tightly enough that 1 test per slice covers the canonical UX shapes.

### 11.4 Structural test

The `COVERED_PROVIDERS` flip in Slice 3.46 triggers the structural test's full 1:1 sweep. The same PR must produce zero violations. **Trigger meta absence is silent** (structural test is action-only).

---

## 12. Out of scope

- **Runtime Stripe handler changes.** Every meta mirrors the existing schema; no schema rewrites, no handler reshaping, no new Stripe API calls.
- **Runtime fixes for V1-cutover quirks.** The dollars/cents asymmetry on `capture_payment_intent.amount_to_capture` vs `create_payment_intent.amount` is documented in schema JSDoc and will be documented in meta descriptions. A V2 cleanup that normalizes everything to cents (or everything to dollars) is a runtime concern, NOT this slice's job. The ISO-vs-Unix timestamp asymmetry on `create_subscription` vs `update_subscription` is the same — surface in description, defer fix.
- **Stripe trigger metadata** (`stripe:event_received`). Deferred to a follow-up slice after multi-select combobox renderer infrastructure lands. See §3.
- **Stripe OAuth scope changes.** All scopes for currently-registered handlers already ship in [`integrations/stripe/manifest.ts`](../../../integrations/stripe/manifest.ts) — `read_write` is the binary Stripe Connect scope.
- **New Stripe actions.** Adding `create_product`, `list_products`, `create_price`, `void_invoice`, `pay_invoice`, etc. is not part of metadata coverage. The orphan-action backfill cadence is on-demand only.
- **`stripe:customers` / `stripe:prices` / `stripe:products` / `stripe:subscriptions` resolvers.** Each is a follow-up after the coverage flip — see §5 future-resolver table.
- **Multi-select combobox.** Slice 3.7 deferral stands. Required for `stripe:event_received.enabledEvents` UX but blocks the trigger meta only.
- **Type-aware variable picker filtering.** Out of scope per FileRef deferrals (D-FRA-6 / D-SFR-10).
- **Stripe Dashboard URL hydration / Stripe Element preview.** Out of scope.
- **Canvas polish.** Out of scope per the checkpoint recommendation.
- **Pushing / PR creation.** Local-only branch.

---

## 13. Open decisions for Marcus

Recommended defaults listed first; mark disagreements when accepting the plan.

| Decision | Recommended default | Why |
| --- | --- | --- |
| Single slice (all 16) vs two slices (8 + 8)? | **Two slices: 3.45 (customer + payment lifecycle, 8 actions) / 3.46 (subscriptions + commerce surfaces + flip, 8 actions).** | Symmetric split, two reviewable PRs, heaviest meta + COVERED_PROVIDERS flip ride together in 3.46 per established precedent. |
| Category — one (`commerce`) or per-action split? | **One — all 16 actions use `commerce`.** | Matches the "one category per provider" precedent. `commerce` is currently empty in the registry; Stripe seeds it. |
| Should Stripe IDs (`customerId`, `priceId`, `paymentIntentId`, etc.) stay as `text` in v1? | **Yes — defer all resolvers to follow-up slices.** | Lands 16 actions immediately. Authors wire IDs from upstream Stripe action outputs / trigger payloads via the variable picker. Resolvers are 1-slice polish on top of completed coverage. |
| Should the first resolver (`stripe:customers` with email search) ship BEFORE Slice 3.45 to flip the 7 customer-id fields from day one? | **No — ship metadata batch first.** | Same precedent as Slack 3.27 (channel field text-first, picker polish in 3.32) and Notion 3.41 (databaseId text-first, `notion:databases` is a follow-up). Building the resolver first delays the bigger metadata unlock. |
| Should the Stripe trigger meta (`stripe:event_received`) ride along in this arc? | **No — defer to a follow-up slice that lands AFTER multi-select combobox renderer.** | `enabledEvents` needs multi-select with a static allowlist; `string-array` chip fallback loses validation. `COVERED_PROVIDERS` is action-only; `hasMetadata=true` flips on action metas alone. See §3. |
| Should the dollars/cents footgun be addressed in this slice via runtime normalization? | **No — descriptions only; runtime cleanup is a separate slice.** | Meta accuracy beats meta aspiration. Schemas already document the asymmetry; meta descriptions make it visible at picker-pick time. A V2 normalization slice can land later without changing meta. |
| Should money-moving actions (`create_refund`, `cancel_subscription`, `capture_payment_intent`) ship a UI confirmation step at meta level? | **No — meta layer doesn't model confirmation UX; runtime / shell handles it.** | The contract has no "requires-confirmation" field. If destructive-action confirmation becomes a builder feature, it's a separate infra slice (FieldMeta or top-level ActionMeta flag, schemaForm change). Document the risk in description; defer UX. |
| Should `metadata` be `keyvalue` or `textarea` paste-JSON? | **`keyvalue` — perfect contract fit.** | `keyvalue` is `Record<string, string>` natively, exact match for Stripe's `metadata` shape. 9 of 16 actions benefit. No paste-JSON footgun. |
| Should `lineItems` ship as a structured editor (new FieldType) or `textarea` paste-JSON? | **`textarea` paste-JSON for v1.** | Mirrors Slack `post_interactive_blocks.blocks` and Notion `children` precedent. A structured "add line item" editor is a separate infra slice (new FieldType). Workflows typically wire `lineItems` from upstream cart / product data via `{{...}}` references. |
| Should `currency` ship as `text` or `select` with the ~135 ISO codes? | **`text` with regex placeholder.** | `select` with 135+ options balloons the meta payload and forces the picker through a long list. Real workflows use 1-3 currencies per merchant; text-with-validation is faster to fill. |
| Canonical integration tests — 2 total or more? | **2 total (1 per slice).** | Slack 6/29 ≈ 21%; Notion 4/16 = 25%; Stripe 2/16 = 12.5%. Lower ratio because Stripe's per-action shapes are tighter than Notion's paste-JSON-heavy surface — registry tests + provider-route tests cover the per-action correctness. Two integration tests pick the heaviest UX shape per slice. |
| Should `COVERED_PROVIDERS` flip in Slice 3.45 (after 8 metas) or 3.46 (after all 16)? | **3.46 only.** | Same precedent as Slack and Notion — flip with the last batch so the structural test goes green in one move. |

---

## 14. Acceptance criteria for the arc

By the end of Slice 3.46:

- ✅ All 16 Stripe action handlers have metas in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts).
- ✅ Stripe is in `COVERED_PROVIDERS` and [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) passes.
- ✅ [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) asserts `stripe.hasMetadata === true` and the full 16-action Stripe list in displayOrder.
- ✅ Every meta field mirrors its Zod schema (required/optional, type, FieldType mapping per §4).
- ✅ Every output mirrors its handler's `return { output: ... }` shape verbatim.
- ✅ Every Stripe meta declares `category: "commerce"`, `requiresIntegration: true`, `producesFileRef: false`, `consumesFileRef: false`.
- ✅ Unit-anchoring descriptions in place — `create_payment_intent.amount` says "dollars"; `capture_payment_intent.amount_to_capture` says "cents".
- ✅ Every action with a `metadata` field uses `keyvalue` with `keyValueMaxRows: 50`.
- ✅ Two new integration tests covering the canonical UX shapes (per §11.3).
- ✅ `npm test` green, `tsc` clean, lint clean (apart from the pre-existing `_registry.ts` max-lines warning).
- ✅ No runtime Stripe handler changes shipped under this arc.
- ✅ No new `optionsSource` resolvers introduced under this arc.
- ✅ Local-only branch `v2-provider-port-local`; no pushes.

**Open after this arc** (documented follow-up gaps so they don't get lost):

- 🟡 `stripe:event_received` trigger meta — deferred pending multi-select combobox infrastructure.
- 🟡 `stripe:customers` resolver (with email search) — first Stripe ideal-UX follow-up.
- 🟡 Runtime dollars/cents unit normalization — separate cleanup slice.
- 🟡 Runtime ISO-vs-Unix timestamp asymmetry on subscription create/update — separate cleanup slice.
