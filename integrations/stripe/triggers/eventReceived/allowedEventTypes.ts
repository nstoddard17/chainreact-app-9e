/**
 * Slice 11 Batch 1 curated Stripe event-type allowlist.
 *
 * The consolidated `event_received` trigger lets workflow authors pick
 * one or more Stripe event types from this list at trigger config
 * time. Activation rejects values outside the list — Q11 fail-loud
 * design-time signal vs silently registering a webhook for unsupported
 * events.
 *
 * 16 events selected to cover V1's 14 trigger node types + the most
 * common upgrade paths (per Slice 11 plan §3 / §4):
 *   - 3 payment_intent.* (succeeded / payment_failed / created)
 *   - 4 charge.* (succeeded / failed / refunded / dispute.created)
 *   - 4 customer.* core lifecycle (created / updated / deleted +
 *     subscription.deleted)
 *   - 2 customer.subscription.* lifecycle (created / updated)
 *   - 2 invoice.* core (paid / payment_failed)
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
