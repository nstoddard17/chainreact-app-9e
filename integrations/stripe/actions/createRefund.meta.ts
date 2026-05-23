import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_refund`.
 *
 * **MONEY-MOVING — destructive.** Reverses a previously-captured
 * charge or completed PaymentIntent. Money flows from the merchant
 * back to the customer.
 *
 * Mirrors `createRefund.schema.ts`:
 *   - `chargeId`        (optional) — refund a specific charge.
 *   - `paymentIntentId` (optional) — refund the latest charge attached
 *                       to a payment intent.
 *   - `amount`          (optional, **DOLLARS**) — partial refund amount.
 *                       Schema accepts number OR string with ≤2 decimal
 *                       places. Handler converts to CENTS.
 *                       **Omit for FULL refund (Stripe's default).**
 *   - `reason`          (optional enum) — `duplicate` / `fraudulent` /
 *                       `requested_by_customer`.
 *   - `metadata`        (optional) — `Record<string,string>`.
 *
 * Cross-field invariant (runtime-enforced, NOT expressible in FieldMeta):
 * EXACTLY ONE of `chargeId` / `paymentIntentId` must be supplied. The
 * description documents this; schema's `.refine` rejects bad payloads.
 *
 * Outputs match `createRefund.ts:return` exactly.
 */
export const stripeCreateRefundMeta: ActionMeta = {
  key: "stripe:create_refund",
  provider: "stripe",
  type: "create_refund",
  displayName: "Create Refund",
  description:
    "Reverse a Stripe charge — moves money from the merchant back to the customer. **DESTRUCTIVE — not reversible.** Provide EXACTLY ONE of Charge ID or Payment Intent ID. **Omit `amount` for a full refund** (Stripe's default — common case); supply `amount` (in DOLLARS) for partial refunds.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "chargeId",
      label: "Charge ID",
      description:
        "Stripe charge id (`ch_xxx`) to refund. Leave empty when refunding via Payment Intent ID instead.",
      type: "text",
      required: false,
      placeholder: "ch_xxx",
    },
    {
      name: "paymentIntentId",
      label: "Payment Intent ID",
      description:
        "Stripe PaymentIntent id (`pi_xxx`) to refund — Stripe refunds the latest charge attached to the intent. Leave empty when refunding via Charge ID instead.",
      type: "text",
      required: false,
      placeholder: "pi_xxx",
    },
    {
      name: "amount",
      label: "Amount (USD dollars)",
      description:
        "Partial-refund amount in DOLLARS — e.g. `5.00` to refund $5.00. Handler converts to CENTS for Stripe. **Omit entirely for a FULL refund (the common case).** Cannot exceed the original charge amount.",
      type: "number",
      required: false,
      numeric: { min: 0.01, step: 0.01 },
      placeholder: "5.00",
    },
    {
      name: "reason",
      label: "Reason",
      description:
        "Optional structured refund reason — Stripe stores this on the refund object and surfaces in the Dashboard. Free-text reasons should use Metadata instead.",
      type: "select",
      required: false,
      options: [
        {
          value: "duplicate",
          label: "Duplicate charge",
          description: "Customer was charged more than once for the same purchase.",
        },
        {
          value: "fraudulent",
          label: "Fraudulent",
          description: "Charge was unauthorized / fraudulent.",
        },
        {
          value: "requested_by_customer",
          label: "Requested by customer",
          description: "Customer requested the refund (most common).",
        },
      ],
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the refund object. Use for workflow correlation IDs or free-text reasons that don't fit the structured Reason enum. Stripe caps at 50 keys.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
  ],
  outputs: [
    {
      name: "refundId",
      type: "string",
      description: "Stripe refund id (`re_xxx`).",
    },
    {
      name: "amount",
      type: "number",
      description: "Refunded amount in CENTS (Stripe wire-format).",
    },
    {
      name: "currency",
      type: "string",
      description: "Lowercase ISO-4217 currency code.",
    },
    {
      name: "status",
      type: "string",
      description:
        "Refund state — typically `succeeded`, `pending`, `requires_action`, or `failed`.",
    },
    {
      name: "charge",
      type: "string",
      description:
        "Charge id that was refunded (echoed). Populated for both lookup paths.",
    },
    {
      name: "paymentIntent",
      type: "string",
      description:
        "Payment intent id associated with the refunded charge (echoed). Null when the charge was created directly without a PaymentIntent.",
    },
    {
      name: "reason",
      type: "string",
      description: "Structured reason (echoed). Null when omitted at input.",
    },
    {
      name: "receiptNumber",
      type: "string",
      description:
        "Stripe-issued receipt number for the refund. Null until Stripe assigns one.",
    },
    {
      name: "created",
      type: "number",
      description: "Unix epoch seconds when Stripe created the refund.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the refund (echoed).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription: "Issues a refund — money moves from merchant to customer. Cannot be undone.",
};
