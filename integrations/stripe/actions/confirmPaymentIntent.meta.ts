import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:confirm_payment_intent`.
 *
 * **MONEY-MOVING — completes the payment authorization.** Once
 * confirmed, the customer is charged synchronously (or 3D-Secure /
 * redirect-flow handed off via the `nextAction` output).
 *
 * Mirrors `confirmPaymentIntent.schema.ts`:
 *   - `paymentIntentId` (required) — intent to confirm.
 *   - `payment_method`  (optional) — Stripe payment method id (`pm_xxx`).
 *                       Pass when the PaymentIntent wasn't already
 *                       associated with a payment method; omit when
 *                       confirming an intent that already has one
 *                       attached (Stripe uses the attached method).
 *   - `receipt_email`   (optional) — Stripe sends a receipt to this
 *                       email after a successful charge.
 *   - `return_url`      (optional) — URL Stripe redirects to after
 *                       3DS / off-session flows complete.
 *
 * Schema-side field naming (`payment_method` / `receipt_email` /
 * `return_url`) uses snake_case for V1 cutover parity — meta field
 * names mirror exactly so existing V1 workflow configs migrate
 * cleanly.
 *
 * Outputs match `confirmPaymentIntent.ts:return` exactly.
 */
export const stripeConfirmPaymentIntentMeta: ActionMeta = {
  key: "stripe:confirm_payment_intent",
  provider: "stripe",
  type: "confirm_payment_intent",
  displayName: "Confirm Payment Intent",
  description:
    "Confirm an existing Stripe PaymentIntent. Triggers the actual charge attempt — the customer is charged synchronously OR redirected to 3D Secure / a return URL via the `nextAction` output. Idempotent on the resource id (calling twice on a `succeeded` intent yields the same final state).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "paymentIntentId",
      label: "Payment Intent ID",
      description:
        "Stripe PaymentIntent id (`pi_xxx`) to confirm. Usually wired from `{{stripe:create_payment_intent.paymentIntentId}}`.",
      type: "text",
      required: true,
      placeholder: "pi_xxx",
    },
    {
      name: "payment_method",
      label: "Payment method ID",
      description:
        "Optional Stripe payment method id (`pm_xxx`). Required when the PaymentIntent has no payment method attached yet; omit when confirming an intent that already has one (Stripe uses the attached method).",
      type: "text",
      required: false,
      placeholder: "pm_xxx",
    },
    {
      name: "receipt_email",
      label: "Receipt email",
      description:
        "Optional email Stripe sends the receipt to after a successful charge.",
      type: "text",
      required: false,
      placeholder: "customer@example.com",
    },
    {
      name: "return_url",
      label: "Return URL",
      description:
        "Optional URL Stripe redirects the customer to after 3D Secure / off-session redirect flows complete. Required when the PaymentIntent uses payment methods that need redirect (e.g. iDEAL, SOFORT).",
      type: "text",
      required: false,
      placeholder: "https://example.com/checkout/return",
    },
  ],
  outputs: [
    {
      name: "paymentIntentId",
      type: "string",
      description: "Stripe PaymentIntent id (echoed).",
    },
    {
      name: "status",
      type: "string",
      description:
        "PaymentIntent state after confirmation — typically `succeeded`, `requires_action`, `processing`, or `requires_payment_method` (on failure).",
    },
    {
      name: "amount",
      type: "number",
      description: "Amount in CENTS (Stripe wire-format).",
    },
    {
      name: "currency",
      type: "string",
      description: "Lowercase ISO-4217 currency code (echoed).",
    },
    {
      name: "clientSecret",
      type: "string",
      description:
        "Client secret for frontend handoff. Exposed intentionally — Stripe.js / Payment Element on the client uses this to resolve `requires_action` states. NOT a Stripe API key; safe to send to the client per Stripe's documented flow.",
    },
    {
      name: "nextAction",
      type: "object",
      description:
        "Stripe's polymorphic next-action descriptor — populated when status is `requires_action` (3D Secure redirect, off-session continuation, etc.). Null when no action is required (most `succeeded` confirmations).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
};
