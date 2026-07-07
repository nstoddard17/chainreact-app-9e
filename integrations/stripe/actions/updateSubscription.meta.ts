import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:update_subscription`.
 *
 * **MONEY-MOVING — modifies an active subscription.** Changes to
 * `priceId` / `quantity` / `proration_behavior` directly affect the
 * customer's next invoice — proration is calculated when supplied
 * (`create_prorations`), suppressed when explicitly set to `none`, or
 * left to Stripe's server-side default when omitted.
 *
 * Mirrors `updateSubscription.schema.ts`:
 *   - `subscriptionId`         (required) — subscription to update.
 *   - `priceId`                (optional) — replace the single
 *                               subscription item's price. Handler
 *                               pre-fetches the existing item id and
 *                               updates IN-PLACE (does not add a 2nd
 *                               item).
 *   - `quantity`               (optional) — replace the item's
 *                               quantity. Positive integer.
 *   - `trial_end`              (optional) — Unix timestamp (seconds)
 *                               OR the literal string `"now"` (ends
 *                               the trial immediately). Schema field
 *                               name preserved as snake_case.
 *   - `cancel_at_period_end`   (optional boolean) — schedule a
 *                               period-end cancellation. NO default.
 *   - `proration_behavior`     (optional enum) — `create_prorations` /
 *                               `none` / `always_invoice`. NO default
 *                               per Q11 — Stripe applies its
 *                               server-side default when omitted.
 *   - `default_payment_method` (optional) — replace the default
 *                               payment method.
 *   - `metadata`               (optional) — REPLACES existing
 *                               metadata (Stripe PATCH semantics).
 *   - `collection_method`      (optional enum) — `charge_automatically`
 *                               / `send_invoice`. Schema field name
 *                               preserved as snake_case.
 *   - `days_until_due`         (optional) — only meaningful when
 *                               `collection_method = send_invoice`.
 *
 * Outputs match `updateSubscription.ts:return` exactly — timestamp
 * fields are RAW Unix seconds here (V1 asymmetry preserved; the
 * `create_subscription` handler converts to ISO).
 */
export const stripeUpdateSubscriptionMeta: ActionMeta = {
  key: "stripe:update_subscription",
  provider: "stripe",
  type: "update_subscription",
  displayName: "Update Subscription",
  description:
    "Modify an existing Stripe subscription. **MONEY-MOVING — changing `priceId` / `quantity` / `proration_behavior` directly affects the customer's next invoice.** No `proration_behavior` default applied here — Stripe applies its server-side default when omitted; pass `none` to suppress proration explicitly. Changing `priceId` updates the existing subscription item IN-PLACE (no second item is added). `metadata` REPLACES the existing object (Stripe PATCH semantics, not a merge).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "subscriptionId",
      label: "Subscription ID",
      description:
        "Stripe subscription (`sub_xxx`) to update. Usually wired from `{{stripe:create_subscription.subscriptionId}}` or a Stripe webhook trigger payload.",
      type: "text",
      required: true,
      placeholder: "sub_xxx",
    },
    {
      name: "priceId",
      label: "Price ID",
      description:
        "Optional — replace the subscription's price. The handler updates the existing subscription item in-place (does not append a second item).",
      type: "text",
      required: false,
      placeholder: "price_xxx",
    },
    {
      name: "quantity",
      label: "Quantity",
      description:
        "Optional — replace the subscription item's quantity. Positive integer.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
      placeholder: "1",
    },
    {
      name: "trial_end",
      label: "Trial end",
      description:
        "Optional — Unix timestamp (seconds) for when the trial should end, OR the literal string `\"now\"` to end the trial immediately. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "text",
      required: false,
      placeholder: "now",
    },
    {
      name: "cancel_at_period_end",
      label: "Cancel at period end",
      description:
        "Optional — when true, the subscription cancels at the end of the current billing period (vs immediate). When false, an existing scheduled cancellation is cleared. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "boolean",
      required: false,
    },
    {
      name: "proration_behavior",
      label: "Proration behavior",
      description:
        "Optional Stripe proration selector. **No default applied here** — when omitted, Stripe applies its server-side default (typically `create_prorations` for mid-cycle changes). Pass `none` explicitly to suppress proration. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "select",
      required: false,
      options: [
        {
          value: "create_prorations",
          label: "create_prorations",
          description:
            "Calculate proration credits/charges and add them to the next invoice (Stripe's default for mid-cycle changes).",
        },
        {
          value: "none",
          label: "none",
          description:
            "Suppress proration entirely. The change takes effect at the next period without billing adjustments.",
        },
        {
          value: "always_invoice",
          label: "always_invoice",
          description:
            "Calculate proration AND immediately invoice the customer for any net charge.",
        },
      ],
    },
    {
      name: "default_payment_method",
      label: "Default payment method ID",
      description:
        "Optional — replace the subscription's default payment method (`pm_xxx`). Schema field name preserved as snake_case for V1 cutover parity.",
      type: "text",
      required: false,
      placeholder: "pm_xxx",
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs. **REPLACES** the subscription's existing metadata (Stripe PATCH semantic — not a merge). Omit to keep existing metadata intact. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueShape: "record",
      keyValueMaxRows: 50,
    },
    {
      name: "collection_method",
      label: "Collection method",
      description:
        "Optional — controls how Stripe collects payment. `charge_automatically` debits the default payment method; `send_invoice` emails an invoice for the customer to pay. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "select",
      required: false,
      options: [
        {
          value: "charge_automatically",
          label: "charge_automatically",
          description:
            "Stripe debits the customer's default payment method when the invoice is finalized.",
        },
        {
          value: "send_invoice",
          label: "send_invoice",
          description:
            "Stripe emails the invoice to the customer; they pay manually via the hosted invoice URL.",
        },
      ],
    },
    {
      name: "days_until_due",
      label: "Days until due",
      description:
        "Optional — number of days from invoice finalization until payment is due. Only meaningful when `collection_method = send_invoice`. Positive integer. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
      placeholder: "30",
    },
  ],
  outputs: [
    {
      name: "subscriptionId",
      type: "string",
      description: "Stripe subscription id (echoed).",
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
        "Current subscription state after the update — typically `active`, `trialing`, `past_due`, `unpaid`, or `canceled`.",
    },
    {
      name: "currentPeriodStart",
      type: "number",
      description:
        "Unix epoch seconds when the current billing period started. (Update output is raw Unix seconds; Create output is ISO — V1 asymmetry preserved.)",
    },
    {
      name: "currentPeriodEnd",
      type: "number",
      description:
        "Unix epoch seconds when the current billing period ends.",
    },
    {
      name: "cancelAtPeriodEnd",
      type: "boolean",
      description:
        "True when the subscription is scheduled to cancel at the end of the current period.",
    },
    {
      name: "trialStart",
      type: "number",
      description:
        "Unix epoch seconds when the trial started, or null if no trial.",
    },
    {
      name: "trialEnd",
      type: "number",
      description:
        "Unix epoch seconds when the trial ends, or null if no trial.",
    },
    {
      name: "items",
      type: "array",
      description:
        "Subscription items after the update — Stripe's `items.data` array (each item is a bounded `subscription_item` object with `id`, `price`, `quantity`, etc.). Drill via `{{nodeId.items[0].price.id}}`.",
    },
    {
      name: "metadata",
      type: "object",
      description:
        "Metadata after the update (echoed `Record<string,string>`).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription: "Modifies an existing Stripe subscription — changing `priceId` / `quantity` / `proration_behavior` directly affects the customer's next invoice and may trigger an immediate proration charge or credit. Activation and real Run-now require typed confirmation per SEC-4B.",
};
