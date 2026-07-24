/**
 * Pure readers for the Stripe **Subscription** wire shape
 * (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Extracted so the two places that must agree about "when does this subscription's
 * period end / can it still bill again?" read the SAME code:
 *   - `services/billing/stripeBillingWebhook.ts` — inbound verified events;
 *   - `services/billing/subscriptionCancellation.ts` — outbound REST reads used by the
 *     cancel / resume / deletion / purge-fail-closed paths.
 *
 * Pure (`core/` rule): no I/O, no repositories, no services. Input is an already-parsed
 * Stripe Subscription object (or the subset of it an event carries).
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Resolve a subscription's current-period-end (unix seconds) from EITHER the pre-Basil
 * top-level `current_period_end` OR the Basil+ per-item location
 * (`items.data[].current_period_end`).
 *
 * Stripe's Basil API (2025-03-31.basil onward — the version this integration pins in
 * `_shared/stripe/api/_base.ts`) REMOVED the subscription-level `current_period_end` and
 * moved it onto each subscription item. The shape of an INBOUND webhook event follows the
 * API version configured on the Stripe Dashboard webhook endpoint (not the `Stripe-Version`
 * header the platform REST client sends), which may be Basil. Reading both locations keeps
 * the period-end correct regardless of which version delivers the object — top-level wins
 * when present (pre-Basil), else the furthest-out item period (mixed-interval subs carry a
 * period per item; the latest end is the correct "access ends / renews on" boundary).
 */
export function resolveSubscriptionPeriodEndSeconds(
  obj: Record<string, unknown>,
): number | null {
  const topLevel = obj.current_period_end;
  if (typeof topLevel === "number" && Number.isFinite(topLevel)) return topLevel;
  const items = asRecord(obj.items).data;
  if (!Array.isArray(items)) return null;
  let latest: number | null = null;
  for (const item of items) {
    const end = asRecord(item).current_period_end;
    if (typeof end === "number" && Number.isFinite(end)) {
      latest = latest === null ? end : Math.max(latest, end);
    }
  }
  return latest;
}

/**
 * Stripe subscription statuses that are TERMINAL — the subscription is dead and can never
 * bill the customer again. Everything else (`active`, `trialing`, `past_due`, `unpaid`,
 * `incomplete`, `paused`, or any status Stripe adds later) is treated as still-live.
 *
 * Deliberately an allow-list of DEAD states, not of live ones: an unrecognized status must
 * read as "still live" so the purge fail-closed guard errs toward keeping the account
 * rather than destroying data while a subscription can still charge.
 */
const TERMINAL_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "incomplete_expired",
]);

/**
 * True when this subscription can still bill the customer again — i.e. it is not in a
 * terminal state. Note this stays TRUE for a subscription that is merely
 * `cancel_at_period_end` (it is still live and still owns an open billing period); only a
 * fully ended subscription reads false. That conservatism is intentional: the account-
 * deletion path cancels IMMEDIATELY, so a still-live subscription at purge time means the
 * cancellation did not take effect and the purge must not proceed.
 */
export function isLiveStripeSubscriptionStatus(status: string | null): boolean {
  if (status === null) return false;
  return !TERMINAL_STRIPE_STATUSES.has(status);
}
