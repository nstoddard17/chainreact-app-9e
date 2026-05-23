import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:find_payment_intent`.
 *
 * **Read-only.** Direct id lookup via `GET /v1/payment_intents/{id}`.
 * 404 → `{found: false, paymentIntent: null}` (NOT thrown).
 *
 * Mirrors `findPaymentIntent.schema.ts` — single required field.
 *
 * Outputs match `findPaymentIntent.ts:return` exactly — bounded
 * 12-key payment-intent projection. Notable inclusions:
 *   - `latestChargeId` — wire to `find_customer` / `create_refund`
 *     downstream.
 *   - `amount` / `amountReceived` in CENTS (Stripe wire-format).
 */
export const stripeFindPaymentIntentMeta: ActionMeta = {
  key: "stripe:find_payment_intent",
  provider: "stripe",
  type: "find_payment_intent",
  displayName: "Find Payment Intent",
  description:
    "Look up a Stripe PaymentIntent by id. Read-only — no money moves. Returns `found: false` on 404 (does NOT throw). Useful for branching on PaymentIntent state after a webhook event or for chained workflows that need the current charge state.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "paymentIntentId",
      label: "Payment Intent ID",
      description:
        "Stripe PaymentIntent id (`pi_xxx`) to look up. Usually wired from `{{stripe:create_payment_intent.paymentIntentId}}` or a Stripe webhook trigger payload.",
      type: "text",
      required: true,
      placeholder: "pi_xxx",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when Stripe returned the PaymentIntent; false when the lookup 404'd.",
    },
    {
      name: "paymentIntent",
      type: "object",
      description:
        "Bounded PaymentIntent projection when `found: true` (`{paymentIntentId, amount, amountReceived, currency, status, customerId, latestChargeId, paymentMethodId, description, receiptEmail, metadata, livemode}`); null when `found: false`. Amounts in CENTS (Stripe wire-format). Drill via `{{nodeId.paymentIntent.<field>}}`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
