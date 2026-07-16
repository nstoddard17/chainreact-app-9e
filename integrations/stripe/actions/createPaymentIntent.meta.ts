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
 * Outputs match `createPaymentIntent.ts:return` exactly. Slice 3.SEC-8
 * removed `clientSecret` from the projection — Stripe's `client_secret`
 * is browser-side flow material; surfacing it as a workflow output
 * leaked it into run history, the variable picker, and downstream
 * sinks. Workflows that need a customer-facing payment surface use
 * `stripe:create_checkout_session.url` / `stripe:create_payment_link.url`
 * instead. See the matching JSDoc on `createPaymentIntent.ts` for the
 * full rationale and the SEC-1 audit no-go-gate #4 reference.
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
      label: "Amount (dollars / major units)",
      description:
        "Payment amount in DOLLARS (major currency units) — e.g. `20.99`. Converted to CENTS for Stripe automatically. Output `amount` echoes back in CENTS. **Critical:** do NOT pass cents here — the capture action expects cents, but THIS action expects dollars.",
      type: "number",
      required: true,
      numeric: { min: 0.01, step: 0.01 },
      placeholder: "20.99",
    },
    {
      name: "currency",
      label: "Currency",
      description:
        "3-letter lowercase code, e.g. `usd`. Uppercase is rejected (`USD` fails validation). Pick a common code or type any lowercase ISO-4217 code.",
      type: "combobox",
      required: true,
      allowManualEntry: true,
      options: [
        { value: "usd", label: "usd — US dollar" },
        { value: "eur", label: "eur — Euro" },
        { value: "gbp", label: "gbp — British pound" },
        { value: "cad", label: "cad — Canadian dollar" },
        { value: "aud", label: "aud — Australian dollar" },
        { value: "jpy", label: "jpy — Japanese yen" },
        { value: "chf", label: "chf — Swiss franc" },
        { value: "sek", label: "sek — Swedish krona" },
        { value: "nzd", label: "nzd — New Zealand dollar" },
        { value: "mxn", label: "mxn — Mexican peso" },
      ],
      placeholder: "usd",
    },
    {
      name: "customerId",
      label: "Customer",
      description:
        "Optional â the customer to charge. Required for off-session / saved-card flows; leave empty for one-time guest payments.",
      type: "combobox",
      required: false,
      placeholder: "cus_xxx",
      optionsSource: "stripe:customers",
      allowManualEntry: true,
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
      keyValueShape: "record",
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
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription: "Creates a Stripe PaymentIntent and starts a customer payment flow — when followed by Confirm Payment Intent (or Stripe's hosted Payment Element) Stripe attempts the real charge. Activation and real Run-now require typed confirmation per SEC-4B.",
};
