import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_subscription`.
 *
 * **MONEY-MOVING — recurring billing.** Creates a Stripe subscription
 * object that enrolls the customer into recurring billing under the
 * selected price. Stripe may charge the customer immediately or queue
 * the first invoice depending on `payment_behavior` and the price's
 * billing cycle.
 *
 * Mirrors `createSubscription.schema.ts`:
 *   - `customerId`            (required) — Stripe customer to enroll.
 *   - `priceId`               (required) — Stripe price (`price_xxx`)
 *                              the subscription bills against.
 *   - `default_payment_method` (optional) — Stripe payment method
 *                              (`pm_xxx`) Stripe charges. Required for
 *                              off-session billing if the customer has
 *                              no default payment method on file.
 *   - `payment_behavior`      (optional enum) — Stripe's documented
 *                              enum (`allow_incomplete` /
 *                              `default_incomplete` /
 *                              `error_if_incomplete` /
 *                              `pending_if_incomplete`). NO defaultValue
 *                              per Q11 — let Stripe apply its
 *                              server-side default.
 *   - `trialPeriodDays`       (optional) — number of trial days before
 *                              billing begins.
 *   - `metadata`              (optional) — Record<string,string>.
 *
 * Outputs match `createSubscription.ts:return` exactly. `priceId` /
 * `quantity` are echoed from the first subscription item (the only
 * item V2 supports today).
 */
export const stripeCreateSubscriptionMeta: ActionMeta = {
  key: "stripe:create_subscription",
  provider: "stripe",
  type: "create_subscription",
  displayName: "Create Subscription",
  description:
    "Create a live Stripe subscription that enrolls a customer in recurring billing. **MONEY-MOVING — Stripe may charge the customer immediately depending on the price's billing cycle and the chosen `payment_behavior`.** Single-price only — multi-item subscriptions deferred. No hidden `payment_behavior` default — Stripe applies its server-side default when omitted.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer ID",
      description:
        "Stripe customer (`cus_xxx`) to enroll into the subscription. Usually wired from `{{stripe:create_customer.customerId}}` or `{{stripe:find_customer.customer.customerId}}`.",
      type: "text",
      required: true,
      placeholder: "cus_xxx",
    },
    {
      name: "priceId",
      label: "Price ID",
      description:
        "Stripe price (`price_xxx`) the subscription bills against. Must match the subscription's billing cycle (recurring price, not one-time).",
      type: "text",
      required: true,
      placeholder: "price_xxx",
    },
    {
      name: "default_payment_method",
      label: "Default payment method ID",
      description:
        "Optional Stripe payment method (`pm_xxx`) Stripe will charge for this subscription. Required for off-session billing when the customer has no default payment method on file. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "text",
      required: false,
      placeholder: "pm_xxx",
    },
    {
      name: "payment_behavior",
      label: "Payment behavior",
      description:
        "Optional Stripe payment-behavior selector. Controls how Stripe handles the first invoice when the customer's card is declined or requires action. **No default applied here** — when omitted, Stripe applies its server-side default. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "select",
      required: false,
      options: [
        {
          value: "allow_incomplete",
          label: "allow_incomplete",
          description:
            "Subscription becomes `incomplete` if the first invoice payment fails. Customer can complete payment later.",
        },
        {
          value: "default_incomplete",
          label: "default_incomplete",
          description:
            "Recommended for SaaS — subscription starts as `incomplete` and waits for explicit confirmation via Stripe.js / Payment Element.",
        },
        {
          value: "error_if_incomplete",
          label: "error_if_incomplete",
          description:
            "Stripe rejects the subscription create call entirely if the first payment cannot be made.",
        },
        {
          value: "pending_if_incomplete",
          label: "pending_if_incomplete",
          description:
            "Subscription enters `incomplete` pending state — used with Stripe Billing's automatic retries.",
        },
      ],
    },
    {
      name: "trialPeriodDays",
      label: "Trial period (days)",
      description:
        "Optional number of trial days before recurring billing begins. Positive integer. Omit for no trial.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
      placeholder: "14",
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the Stripe subscription object. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
  ],
  outputs: [
    {
      name: "subscriptionId",
      type: "string",
      description:
        "Stripe subscription id (`sub_xxx`). Wire to Update Subscription / Cancel Subscription / Find Subscription downstream.",
    },
    {
      name: "customerId",
      type: "string",
      description: "Stripe customer id (echoed).",
    },
    {
      name: "status",
      type: "string",
      description:
        "Current subscription state — typically `active`, `trialing`, `incomplete`, `incomplete_expired`, `past_due`, `unpaid`, or `canceled`.",
    },
    {
      name: "currentPeriodStart",
      type: "string",
      description:
        "ISO-8601 timestamp when the current billing period started. (Create output uses ISO; Update output uses raw Unix seconds — V1 asymmetry preserved.)",
    },
    {
      name: "currentPeriodEnd",
      type: "string",
      description:
        "ISO-8601 timestamp when the current billing period ends. (Create output uses ISO; Update output uses raw Unix seconds — V1 asymmetry preserved.)",
    },
    {
      name: "cancelAtPeriodEnd",
      type: "boolean",
      description:
        "True when the subscription is scheduled to cancel at the end of the current period.",
    },
    {
      name: "trialStart",
      type: "string",
      description:
        "ISO-8601 timestamp when the trial started, or null if no trial.",
    },
    {
      name: "trialEnd",
      type: "string",
      description:
        "ISO-8601 timestamp when the trial ends, or null if no trial.",
    },
    {
      name: "priceId",
      type: "string",
      description:
        "Stripe price id of the first subscription item (the only item V2 supports today). Null if Stripe returned no items.",
    },
    {
      name: "quantity",
      type: "number",
      description:
        "Quantity on the first subscription item. Null if Stripe returned no items.",
    },
    {
      name: "created",
      type: "number",
      description: "Unix epoch seconds when Stripe created the subscription.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the subscription (echoed).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription: "Creates a Stripe subscription that enrolls the customer in recurring billing — the first invoice may charge immediately depending on the price's billing cycle and the chosen `payment_behavior`. Activation and real Run-now require typed confirmation per SEC-4B.",
};
