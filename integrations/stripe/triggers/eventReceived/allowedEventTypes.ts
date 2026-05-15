/**
 * Curated Stripe event-type allowlist.
 *
 * The consolidated `event_received` trigger lets workflow authors pick
 * one or more Stripe event types from this list at trigger config
 * time. Activation rejects values outside the list — Q11 fail-loud
 * design-time signal vs silently registering a webhook for unsupported
 * events.
 *
 * Slice 11 Batch 1 shipped 16 events; Stripe 2.1 Commit 3 adds
 * `invoice.created` (pairs with the new `create_invoice` action so
 * workflows can react to invoice creation downstream — closes the
 * P4 phantom-eventMap gap from V1's webhook route) +
 * `customer.subscription.trial_will_end` (Stripe emits this ~3 days
 * before a trial ends — common workflow trigger for "nudge customer
 * before trial conversion"). 18 events total:
 *   - 3 payment_intent.* (succeeded / payment_failed / created)
 *   - 4 charge.* (succeeded / failed / refunded / dispute.created)
 *   - 4 customer.* core lifecycle (created / updated / deleted +
 *     subscription.deleted)
 *   - 3 customer.subscription.* (created / updated / trial_will_end)
 *   - 3 invoice.* (created / paid / payment_failed)
 *   - 1 checkout.session.completed
 *
 * Adding a new event type is a 1-line additive change here + a Stripe
 * dashboard / e2e mock surface review. No schema migration.
 *
 * The receive route ALSO defends against unsupported events arriving
 * out of band (a Stripe dashboard re-config could subscribe an
 * endpoint to a non-allowlisted event); see `webhooks/receive.ts`.
 */
export const STRIPE_ALLOWED_EVENT_TYPES = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.created",
  "charge.succeeded",
  "charge.failed",
  "charge.refunded",
  "charge.dispute.created",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
] as const;

export type StripeAllowedEventType = (typeof STRIPE_ALLOWED_EVENT_TYPES)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(STRIPE_ALLOWED_EVENT_TYPES);

export function isAllowedStripeEventType(
  value: string,
): value is StripeAllowedEventType {
  return ALLOWED_SET.has(value);
}
