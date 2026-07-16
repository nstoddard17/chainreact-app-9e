import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:capture_payment_intent`.
 *
 * **MONEY-MOVING — settles a previously-authorized payment.** Captures
 * funds from an authorized PaymentIntent into the merchant account.
 * Capture is NOT reversible without issuing a refund.
 *
 * Mirrors `capturePaymentIntent.schema.ts`:
 *   - `paymentIntentId`   (required) — intent to capture.
 *   - `amount_to_capture` (optional, **CENTS — Stripe wire-format**) —
 *                         partial-capture amount. **Different unit from
 *                         create_payment_intent.amount which is DOLLARS.**
 *                         Omit to capture the full authorized amount
 *                         (the common case).
 *
 * Outputs match `capturePaymentIntent.ts:return` exactly.
 */
export const stripeCapturePaymentIntentMeta: ActionMeta = {
  key: "stripe:capture_payment_intent",
  provider: "stripe",
  type: "capture_payment_intent",
  displayName: "Capture Payment Intent",
  description:
    "Capture (settle) a previously-authorized Stripe PaymentIntent. Moves funds from the authorization into the merchant account. **Capture is NOT reversible without a refund.** `amount_to_capture` is in Stripe wire-format CENTS (e.g. 2099 for $20.99) — different from Create Payment Intent's `amount` which is dollars. Omit to capture the full authorized amount.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "paymentIntentId",
      label: "Payment Intent ID",
      description:
        "Stripe PaymentIntent id (`pi_xxx`) to capture. Must already be in `requires_capture` state (created with `capture_method: manual` and successfully confirmed).",
      type: "text",
      required: true,
      placeholder: "pi_xxx",
    },
    {
      name: "amount_to_capture",
      label: "Amount to capture (cents)",
      description:
        "Optional partial-capture amount in CENTS — e.g. `2099` for $20.99, `100` for $1.00. **DIFFERENT unit from Create Payment Intent's `amount` which is DOLLARS.** Omit to capture the full authorized amount (the common case). Cannot exceed the originally authorized amount.",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 1, integer: true, step: 1 },
      placeholder: "2099",
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
        "PaymentIntent state after capture — typically `succeeded` on success or unchanged on failure.",
    },
    {
      name: "amount",
      type: "number",
      description:
        "Originally authorized amount in CENTS (echoed from Stripe response).",
    },
    {
      name: "amountCaptured",
      type: "number",
      description:
        "Actual amount captured in CENTS (Stripe's `amount_received`). For full captures equals `amount`; for partial captures equals what was settled. Null when Stripe's response omits the field.",
    },
    {
      name: "currency",
      type: "string",
      description: "Lowercase ISO-4217 currency code (echoed).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription: "CAPTURES the authorized charge — money moves from customer to merchant. Reversal requires a separate refund.",
};
