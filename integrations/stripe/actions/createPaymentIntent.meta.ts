import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_payment_intent`.
 *
 * **MONEY-MOVING — payment initiation.** This action creates a Stripe
 * PaymentIntent which authorizes a charge once confirmed (via
 * Confirm Payment Intent OR Stripe's hosted confirmation flow). The
 * meta description and unit-anchored `amount` field communicate this
 * loudly at design time.
 *
 * Mirrors `createPaymentIntent.schema.ts`:
 *   - `amount`      (required, **DOLLARS**) — schema accepts number OR
 *                   string with ≤2 decimal places. Handler converts to
 *                   CENTS via `dollarsToCents`. Output `amount` echoes
 *                   back in CENTS (Stripe wire-format).
 *   - `currency`    (required) — lowercase ISO-4217 (`usd`, `eur`, …).
 *                   Schema rejects uppercase / non-3-letter codes.
 *   - `customerId`  (optional) — Stripe customer to charge.
 *   - `description` (optional) — visible on customer's bank statement
 *                   if Stripe routes it as `statement_descriptor`.
 *   - `metadata`    (optional) — Record<string,string>.
 *
 * Outputs match `createPaymentIntent.ts:return` exactly. `clientSecret`
 * is exposed intentionally — required for frontend Payment Element
 * confirmation (e.g. handing off to Stripe.js / mobile SDK). Workflows
 * that don't surface the secret to a client simply don't reference it.
 */
export const stripeCreatePaymentIntentMeta: ActionMeta = {
  key: "stripe:create_payment_intent",
  provider: "stripe",
  type: "create_payment_intent",
  displayName: "Create Payment Intent",
  description:
    "Create a Stripe PaymentIntent — the canonical Stripe surface for collecting a payment. This action AUTHORIZES the charge but does not capture it until Confirm Payment Intent runs (or the customer completes Stripe's hosted confirmation). `amount` is in USD DOLLARS (e.g. 20.99); the handler converts to CENTS for Stripe. Output `amount` echoes back in CENTS (Stripe wire-format).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "amount",
      label: "Amount (USD dollars)",
      description:
        "Payment amount in DOLLARS — e.g. `20.99`. The handler converts to CENTS for Stripe's API. Output `amount` echoes back in CENTS. **Critical:** do NOT pass cents here — the capture action expects cents, but THIS action expects dollars.",
      type: "number",
      required: true,
      numeric: { min: 0.01, step: 0.01 },
      placeholder: "20.99",
    },
    {
      name: "currency",
      label: "Currency",
      description:
        "Lowercase ISO-4217 currency code — e.g. `usd`, `eur`, `gbp`. Stripe rejects uppercase codes (`USD` will fail at validation).",
      type: "text",
      required: true,
      placeholder: "usd",
    },
    {
      name: "customerId",
      label: "Customer ID",
      description:
        "Optional Stripe customer (`cus_xxx`) to charge. Usually wired from `{{stripe:create_customer.customerId}}` or `{{stripe:find_customer.customer.customerId}}`. Required for off-session / saved-card flows; optional for one-time guest payments.",
      type: "text",
      required: false,
      placeholder: "cus_xxx",
    },
    {
      name: "description",
      label: "Description",
      description:
        "Optional human-readable description (visible in Stripe Dashboard; may appear on the customer's bank statement depending on Stripe routing).",
      type: "textarea",
      required: false,
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the PaymentIntent. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
  ],
  outputs: [
    {
      name: "paymentIntentId",
      type: "string",
      description:
        "Stripe PaymentIntent id (`pi_xxx`). Wire to Confirm Payment Intent / Capture Payment Intent / Find Payment Intent downstream.",
    },
    {
      name: "clientSecret",
      type: "string",
      description:
        "Client secret used by Stripe.js / Payment Element on the FRONTEND to confirm the payment. Exposed intentionally — workflows that hand off to a client checkout surface need this value. NOT a Stripe API key; safe to send to the client per Stripe's documented flow.",
    },
    {
      name: "amount",
      type: "number",
      description:
        "Payment amount in CENTS (Stripe wire-format echo). Note: input is in dollars; output is in cents.",
    },
    {
      name: "currency",
      type: "string",
      description: "Lowercase ISO-4217 currency code (echoed).",
    },
    {
      name: "status",
      type: "string",
      description:
        "Current PaymentIntent state — typically `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `succeeded`, or `canceled`.",
    },
    {
      name: "customerId",
      type: "string",
      description: "Stripe customer id (echoed). Null when omitted at input.",
    },
    {
      name: "description",
      type: "string",
      description: "Description (echoed). Null when omitted at input.",
    },
    {
      name: "created",
      type: "number",
      description: "Unix epoch seconds when Stripe created the intent.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the intent (echoed `Record<string,string>`).",
    },
    {
      name: "nextAction",
      type: "object",
      description:
        "Stripe's polymorphic next-action descriptor — populated when the PaymentIntent requires customer action (3D Secure redirect, setup intent, off-session continuation). Null when no action is required. Drill via `{{nodeId.nextAction.type}}`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Authorizes a charge (capture pending). Money does not move until capture, but the authorization is real.",
};
