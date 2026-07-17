import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_checkout_session`.
 *
 * **Commerce / payment-initiation.** Creates a Stripe-hosted Checkout
 * Session — Stripe returns a `url` the workflow author hands off to
 * the customer (email, SMS, redirect). Money does NOT move at create
 * time; the customer pays inside Stripe's hosted page, and the
 * `checkout.session.completed` webhook fires once payment succeeds.
 *
 * Mirrors `createCheckoutSession.schema.ts`:
 *   - `mode`               (required enum) — `payment` /
 *                           `subscription` / `setup`.
 *   - `successUrl`         (required) — Stripe redirects here on
 *                           successful payment.
 *   - `cancelUrl`          (required) — Stripe redirects here on
 *                           customer abandon.
 *   - `lineItems`          (required for payment/subscription,
 *                           REJECTED for setup) — object-list rows of
 *                           `{priceId, quantity}`. Min 1, max 99.
 *                           `visibleWhen: mode ∈ {payment, subscription}`
 *                           + `required: true` (required-when-visible)
 *                           mirrors the runtime superRefine: readiness
 *                           demands it exactly when the runtime does,
 *                           and the field is hidden (and auto-cleared)
 *                           in `setup` mode where the runtime rejects it.
 *   - `customer`           (optional) — Stripe customer id. Mutex
 *                           with customerEmail (schema refines).
 *   - `customerEmail`      (optional) — pre-fill the email field.
 *                           Mutex with customer.
 *   - `clientReferenceId`  (optional) — workflow-defined string
 *                           echoed back on the webhook.
 *   - `metadata`           (optional) — Record<string,string>.
 *   - `allowPromotionCodes`(optional boolean) — no default.
 *   - `automaticTax`       (optional `object` fixed-key editor,
 *                           Advanced) — single boolean key `enabled`,
 *                           mirroring the runtime `.strict()` shape.
 *
 * Cross-field invariants:
 *   - `lineItems` REQUIRED when `mode` is `payment` / `subscription`;
 *     REJECTED when `mode` is `setup` — expressed via `visibleWhen`
 *     (above) AND enforced by the runtime superRefine.
 *   - `customer` + `customerEmail` MUTEX — pass one, not both
 *     (runtime-enforced; no either-or grouping in FieldMeta yet).
 *
 * Outputs match `createCheckoutSession.ts:return` — 17-key bounded
 * projection. `url` is the customer-facing Stripe-hosted checkout
 * page (intentional and safe to expose).
 */
export const stripeCreateCheckoutSessionMeta: ActionMeta = {
  key: "stripe:create_checkout_session",
  provider: "stripe",
  type: "create_checkout_session",
  displayName: "Create Checkout Session",
  description:
    "Create a Stripe-hosted Checkout Session — Stripe returns a `url` the workflow hands off to the customer (email, SMS, redirect). Money does NOT move at create time; the customer pays inside Stripe's hosted page. **Cross-field invariant:** `lineItems` is REQUIRED when `mode` is `payment` or `subscription` and REJECTED when `mode` is `setup`. **Mutex invariant:** pass EXACTLY ONE of `customer` or `customerEmail`. Both invariants are enforced at runtime by the schema.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "mode",
      label: "Mode",
      description:
        "Stripe Checkout session mode. `payment` for one-time charges, `subscription` for recurring billing, `setup` for collecting a payment method without charging.",
      type: "select",
      required: true,
      options: [
        {
          value: "payment",
          label: "payment",
          description:
            "One-time payment. Requires `lineItems` with priced products.",
        },
        {
          value: "subscription",
          label: "subscription",
          description:
            "Recurring subscription. Requires `lineItems` with recurring prices.",
        },
        {
          value: "setup",
          label: "setup",
          description:
            "Collect a payment method without charging (for off-session use later). `lineItems` MUST be omitted in this mode.",
        },
      ],
    },
    {
      name: "successUrl",
      sensitivity: "recipient",
      label: "Success URL",
      description:
        "Absolute URL Stripe redirects the customer to after successful payment. Stripe appends `?session_id={CHECKOUT_SESSION_ID}` if the literal placeholder is included.",
      type: "text",
      required: true,
      placeholder: "https://example.com/checkout/success",
    },
    {
      name: "cancelUrl",
      sensitivity: "recipient",
      label: "Cancel URL",
      description:
        "Absolute URL Stripe redirects the customer to if they abandon the checkout page.",
      type: "text",
      required: true,
      placeholder: "https://example.com/checkout/cancel",
    },
    {
      name: "lineItems",
      label: "Line items",
      description:
        "What the customer is paying for. Add one line per Stripe price (max 99).",
      type: "object-list",
      required: true,
      visibleWhen: { field: "mode", valueIn: ["payment", "subscription"] },
      listMaxItems: 99,
      itemFields: [
        {
          // RESOLVERS-3 — picked from the merchant's own Stripe catalog
          // (`stripe:prices`, registered since RESOLVERS-1) instead of
          // hand-typing a `price_xxx` id. `allowManualEntry` keeps upstream
          // `{{...}}` mapping + paste-an-id working; the committed value is
          // the same raw price id the .strict() schema always took.
          name: "priceId",
          label: "Price",
          description:
            "The Stripe price to charge. Pick one from your catalog, or map it from an earlier step.",
          type: "text",
          required: true,
          placeholder: "Search prices…",
          optionsSource: "stripe:prices",
          allowManualEntry: true,
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          required: true,
          placeholder: "1",
        },
      ],
    },
    {
      name: "customer",
      label: "Customer",
      description:
        "Optional — attach the session to an existing customer. Use this OR Customer email, not both.",
      type: "combobox",
      required: false,
      placeholder: "cus_xxx",
      optionsSource: "stripe:customers",
      allowManualEntry: true,
    },
    {
      name: "customerEmail",
      sensitivity: "recipient",
      label: "Customer email",
      description:
        "Optional email to pre-fill on the Stripe-hosted checkout page. **Mutex with Customer ID — pass one, not both.** Stripe will create a guest customer if you pass email but no customer id.",
      type: "text",
      required: false,
      placeholder: "customer@example.com",
    },
    {
      name: "clientReferenceId",
      label: "Client reference ID",
      description:
        "Optional workflow-defined string (1..200 chars). Echoed back on `checkout.session.completed` webhook for downstream workflow ↔ external-system correlation.",
      type: "text",
      required: false,
      placeholder: "order-42",
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the Checkout Session and propagated to the resulting PaymentIntent / Subscription. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueShape: "record",
      keyValueMaxRows: 50,
    },
    {
      name: "allowPromotionCodes",
      label: "Allow promotion codes",
      description:
        "Optional — when true, Stripe shows a promotion-code input field on the hosted page. No default applied here; Stripe applies `false` when omitted.",
      type: "boolean",
      required: false,
    },
    {
      name: "automaticTax",
      label: "Automatic tax",
      description:
        "Optional. Turn on to have Stripe calculate and collect tax from the customer's address (requires Stripe Tax on the account). Leave untouched to use Stripe's default (off).",
      type: "object",
      required: false,
      advanced: true,
      itemFields: [
        {
          name: "enabled",
          label: "Calculate tax automatically",
          type: "boolean",
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: "sessionId",
      type: "string",
      description:
        "Stripe Checkout Session id (`cs_xxx`). Wire to downstream lookups or for log correlation.",
    },
    {
      name: "url",
      type: "string",
      description:
        "**Customer-facing Stripe-hosted checkout URL.** Hand off to the customer via email / SMS / redirect — they complete payment inside Stripe's hosted page. Safe to expose; this is the documented Stripe Checkout entry point.",
      sensitive: true,
    },
    {
      name: "mode",
      type: "string",
      description:
        "Mode the session was created in (`payment` / `subscription` / `setup`).",
    },
    {
      name: "status",
      type: "string",
      description:
        "Session status — typically `open` (waiting for customer), `complete` (paid), or `expired`.",
    },
    {
      name: "paymentStatus",
      type: "string",
      description:
        "Payment status — `paid`, `unpaid`, or `no_payment_required` (for `setup` mode).",
    },
    {
      name: "customerId",
      type: "string",
      description:
        "Stripe customer id associated with the session. Null when no customer was supplied AND Stripe has not yet created one.",
    },
    {
      name: "customerEmail",
      type: "string",
      description: "Customer email (echoed). Null when not pre-filled. Marked sensitive — PII (a real customer email address); redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    {
      name: "clientReferenceId",
      type: "string",
      description: "Workflow-supplied reference id (echoed). Null when omitted.",
    },
    {
      name: "paymentIntentId",
      type: "string",
      description:
        "Stripe PaymentIntent (`pi_xxx`) attached to the session. Null for `subscription` / `setup` modes.",
    },
    {
      name: "subscriptionId",
      type: "string",
      description:
        "Stripe subscription (`sub_xxx`) attached to the session. Null for `payment` / `setup` modes.",
    },
    {
      name: "amountTotal",
      type: "number",
      description:
        "Final total amount in CENTS (Stripe wire-format). Null until the session is completed.",
    },
    {
      name: "currency",
      type: "string",
      description:
        "Lowercase ISO-4217 currency code. Null until Stripe resolves it from the line items.",
    },
    {
      name: "expiresAt",
      type: "number",
      description: "Unix epoch seconds when the session expires (24h from create).",
    },
    {
      name: "successUrl",
      type: "string",
      description: "Success URL (echoed).",
    },
    {
      name: "cancelUrl",
      type: "string",
      description: "Cancel URL (echoed).",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the session (echoed).",
    },
    {
      name: "livemode",
      type: "boolean",
      description:
        "True for live Stripe account; false for test mode.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a Checkout Session URL — customer completes payment on Stripe-hosted page; no charge until they submit.",
};
