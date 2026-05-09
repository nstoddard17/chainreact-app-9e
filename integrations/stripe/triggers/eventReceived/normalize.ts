import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a Stripe webhook event JSON body to V2's canonical
 * `TriggerEvent` shape — Slice 11 Commit 4.
 *
 * Stripe event JSON shape (current docs):
 *   {
 *     id: "evt_xxx",
 *     object: "event",
 *     type: "payment_intent.succeeded",
 *     api_version: "2025-05-28.basil",
 *     created: 1234567890,        // unix seconds
 *     livemode: true,
 *     account: "acct_xxx",        // Connect events only — the
 *                                 // connected merchant account id
 *     data: { object: { ... } },  // resource snapshot
 *     request: { id, idempotency_key },
 *     pending_webhooks: 1
 *   }
 *
 * Canonical TriggerEvent fields:
 *   - `provider: "stripe"` — fixed.
 *   - `eventType: "event_received"` — the consolidated trigger name
 *     (matches `findActivation("stripe", "event_received")` and the
 *     row's `event_type` column). The actual Stripe event type
 *     (`payment_intent.succeeded`) lives in the payload as a
 *     discriminator field that workflows branch on.
 *   - `eventId: event.id` — Stripe's `evt_xxx` is globally unique and
 *     stable across Stripe's retry attempts; load-bearing for
 *     `webhook_event_dedup`.
 *   - `occurredAt: ISO-8601 from event.created`. Stripe's `created`
 *     is unix seconds; we convert.
 *   - `accountId: event.account` if present (Connect events) else the
 *     literal `"<platform>"` (rare — events on the platform's own
 *     account, not from a connected merchant). The normalize layer
 *     never returns null because TriggerEventSchema requires a
 *     non-empty string.
 *   - `payload`: discriminated shape carrying:
 *       - `stripeEventType`: the actual Stripe event type for
 *         workflow branching (e.g. `{{trigger.payload.stripeEventType}}`
 *         === `"payment_intent.succeeded"`).
 *       - `data`: the `event.data.object` resource snapshot — the
 *         primary resource workflows consume (a PaymentIntent,
 *         Subscription, etc.).
 *       - `created`: unix seconds (mirrors Stripe's wire format for
 *         workflows that prefer it over the ISO occurredAt).
 *       - `livemode`: boolean (workflows can branch on test-vs-prod
 *         events).
 *       - `account`: connected account id when present, else null.
 *       - `apiVersion`: the Stripe API version that signed this event
 *         (useful for debugging if the platform pin shifts).
 *       - `request`: the request metadata (id + idempotency_key) when
 *         present — diagnostic context for retries.
 */

export interface StripeEvent {
  id: string;
  object: "event";
  type: string;
  api_version?: string | null;
  created: number;
  livemode?: boolean;
  account?: string | null;
  data?: {
    object?: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  request?: {
    id?: string | null;
    idempotency_key?: string | null;
  } | null;
}

export const STRIPE_TRIGGER_EVENT_TYPE = "event_received";

export function normalizeStripeEvent(event: StripeEvent): TriggerEvent {
  const occurredAt = Number.isFinite(event.created)
    ? new Date(event.created * 1000).toISOString()
    : new Date().toISOString();

  const accountId =
    typeof event.account === "string" && event.account.length > 0
      ? event.account
      : "<platform>";

  return {
    provider: "stripe",
    eventType: STRIPE_TRIGGER_EVENT_TYPE,
    eventId: event.id,
    occurredAt,
    accountId,
    payload: {
      stripeEventType: event.type,
      data: event.data?.object ?? null,
      previousAttributes: event.data?.previous_attributes ?? null,
      created: event.created,
      livemode: typeof event.livemode === "boolean" ? event.livemode : null,
      account: event.account ?? null,
      apiVersion: event.api_version ?? null,
      request: event.request ?? null,
    },
  };
}
