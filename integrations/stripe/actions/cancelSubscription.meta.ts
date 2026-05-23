import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:cancel_subscription`.
 *
 * **DESTRUCTIVE — terminates recurring billing.** Cancellation removes
 * the customer's access to whatever the subscription gates: the next
 * invoice does not generate, billing stops, and the customer loses
 * service at the cancellation time (immediate vs end-of-period
 * depending on `at_period_end`).
 *
 * Mirrors `cancelSubscription.schema.ts`:
 *   - `subscriptionId` (required) — subscription to cancel.
 *   - `at_period_end` (optional boolean) — when true, cancellation is
 *                     scheduled for the end of the current billing
 *                     period (customer keeps service through the
 *                     paid period). When false / omitted, cancellation
 *                     is IMMEDIATE — customer loses service at the
 *                     time of the call. Maps to Stripe's
 *                     `cancel_at_period_end` query param. Schema
 *                     field name preserved as snake_case for V1
 *                     cutover parity.
 *   - `invoice_now`  (optional boolean) — emit a final invoice for any
 *                    unbilled time before cancellation. Schema field
 *                    name preserved as snake_case.
 *   - `prorate`      (optional boolean) — calculate prorated charges /
 *                    credits at the time of cancellation. Schema field
 *                    name preserved as snake_case.
 *
 * **No defaults applied here** (Q11). When `at_period_end` is omitted,
 * Stripe defaults to immediate cancellation — the description makes
 * this loud. `invoice_now` / `prorate` default to Stripe's
 * server-side defaults when omitted.
 *
 * Outputs match `cancelSubscription.ts:return` exactly.
 */
export const stripeCancelSubscriptionMeta: ActionMeta = {
  key: "stripe:cancel_subscription",
  provider: "stripe",
  type: "cancel_subscription",
  displayName: "Cancel Subscription",
  description:
    "Cancel a Stripe subscription — **DESTRUCTIVE — affects the customer's billing access.** When `at_period_end` is true, the subscription continues until the end of the current paid period and then cancels (customer keeps service through what they already paid for). When `at_period_end` is false or omitted, cancellation is IMMEDIATE — the customer loses service at the time of the call. No defaults applied here; omitted optional flags fall through to Stripe's server-side defaults.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "subscriptionId",
      label: "Subscription ID",
      description:
        "Stripe subscription (`sub_xxx`) to cancel. Usually wired from `{{stripe:create_subscription.subscriptionId}}` or a Stripe webhook trigger payload.",
      type: "text",
      required: true,
      placeholder: "sub_xxx",
    },
    {
      name: "at_period_end",
      label: "Cancel at period end",
      description:
        "When true, cancellation is scheduled for the end of the current billing period — customer keeps service through the paid period. When false or omitted, cancellation is **IMMEDIATE** and the customer loses service now. Maps to Stripe's `cancel_at_period_end` query parameter. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "boolean",
      required: false,
    },
    {
      name: "invoice_now",
      label: "Invoice now",
      description:
        "Optional — emit a final invoice for any unbilled time before cancellation. Omit to fall through to Stripe's server-side default. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "boolean",
      required: false,
    },
    {
      name: "prorate",
      label: "Prorate",
      description:
        "Optional — calculate prorated charges or credits at the time of cancellation. Omit to fall through to Stripe's server-side default. Schema field name preserved as snake_case for V1 cutover parity.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    {
      name: "subscriptionId",
      type: "string",
      description: "Stripe subscription id (echoed).",
    },
    {
      name: "status",
      type: "string",
      description:
        "Subscription state after cancellation — typically `canceled` for immediate cancellation OR `active` with `cancelAtPeriodEnd: true` for scheduled cancellation.",
    },
    {
      name: "canceledAt",
      type: "number",
      description:
        "Unix epoch seconds when Stripe marked the subscription canceled. Null when cancellation is scheduled but not yet effective.",
    },
    {
      name: "cancelAtPeriodEnd",
      type: "boolean",
      description:
        "True when the cancellation is scheduled for end-of-period (vs already effective).",
    },
    {
      name: "currentPeriodEnd",
      type: "number",
      description:
        "Unix epoch seconds when the current billing period ends — when `cancelAtPeriodEnd: true`, this is when the customer loses service.",
    },
    {
      name: "customerId",
      type: "string",
      description: "Stripe customer id (echoed).",
    },
    {
      name: "endedAt",
      type: "number",
      description:
        "Unix epoch seconds when the subscription actually ended. Null while a scheduled cancellation has not yet taken effect.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
};
