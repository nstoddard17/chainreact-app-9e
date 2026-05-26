import type { TriggerMeta } from "@/contracts/triggerMeta";
import { STRIPE_ALLOWED_EVENT_TYPES } from "./allowedEventTypes";

/**
 * Builder metadata for `stripe:event_received` — Slice 4.STRIPE-TRIGGER-META-2.
 *
 * The consolidated Stripe webhook trigger. Activation creates a Connect-mode
 * webhook endpoint per (workflow, node) on the platform Stripe account; the
 * receive route fans events out via `webhook_event_dedup` keyed on Stripe's
 * globally-unique `evt_xxx` id. Stripe webhook endpoints don't expire, so no
 * subscription handler / renewal cron is needed (the runtime's `runRenewals`
 * filter skips Stripe rows by design — see
 * `integrations/stripe/triggers/eventReceived/index.ts`).
 *
 * Closes the single launch blocker identified by PROVIDER-AUDIT-1 §2.1 —
 * Stripe-failed-payment → Slack DM (and every other Stripe-event-driven
 * workflow) becomes catalog-grounded the moment this meta lands.
 *
 * ### Single config field — `enabledEvents` (verbatim runtime name)
 *
 * The activation reads `node.config?.enabledEvents` ([`activate.ts:78`](./activate.ts))
 * — REQUIRED non-empty `string[]`. Each value is validated against
 * `STRIPE_ALLOWED_EVENT_TYPES` via `isAllowedStripeEventType`; activation
 * throws a clear allowlist error on any unknown event type. The meta uses
 * the runtime constant DIRECTLY (single source of truth) and maps each entry
 * to a `FieldOption` with the raw event-type string as both `value` and
 * `label`, plus a one-line human-readable `description` (the AI planner uses
 * the description to pattern-match prompts like "failed payment").
 *
 * **Field name MUST be `enabledEvents` verbatim** — drift to `eventType` or
 * `eventTypes` silently breaks activation (builder writes config the runtime
 * can't read).
 *
 * ### Sensitive payload outputs
 *
 * `data` (the Stripe resource snapshot — PaymentIntent / Subscription /
 * Customer / Invoice / Charge / CheckoutSession) + `previousAttributes`
 * (diff on `*.updated` events) are plan-marked sensitive. Both objects are
 * kept FLAT (no nested `fields[]`) — mirror GCal `events` / GDrive `files`
 * / Outlook Cal `events` precedent. The 6 other payload fields
 * (`stripeEventType` / `created` / `livemode` / `account` / `apiVersion` /
 * `request`) are literals / timestamps / opaque ids / diagnostic context —
 * not marked.
 *
 * **If a future iteration exposes nested `data.customer` / `data.paymentIntent`
 * / `data.subscription` OutputMeta, those children MUST be marked
 * `sensitive:true` — all three names are in `SUSPICIOUS_NAMES` and would
 * otherwise force-fail `sensitive-output-coverage`.**
 */

/**
 * Per-event humanized hints. Used as `FieldOption.description` — the AI
 * planner reads these for prompt → event-type matching. Lean toward
 * concrete behavior (what TRIGGERS the event) rather than abstract concepts.
 */
const STRIPE_EVENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "payment_intent.succeeded": "A PaymentIntent succeeded.",
  "payment_intent.payment_failed":
    "A PaymentIntent failed (e.g. card declined, insufficient funds).",
  "payment_intent.created": "A PaymentIntent was created.",
  "charge.succeeded": "A Charge succeeded.",
  "charge.failed": "A Charge failed (legacy direct-charge flow).",
  "charge.refunded": "A Charge was refunded (full or partial).",
  "charge.dispute.created":
    "A dispute (chargeback) was opened on a previously-succeeded Charge.",
  "customer.created": "A new Customer was created.",
  "customer.updated": "An existing Customer's details changed.",
  "customer.deleted": "A Customer was deleted.",
  "customer.subscription.created": "A new Subscription was created.",
  "customer.subscription.updated":
    "An existing Subscription changed (e.g. plan, status, quantity).",
  "customer.subscription.deleted": "A Subscription was cancelled or expired.",
  "customer.subscription.trial_will_end":
    "A Subscription's trial ends in ~3 days — common nudge trigger.",
  "invoice.created": "A new Invoice was created (drafted, pre-finalization).",
  "invoice.paid": "An Invoice was paid in full.",
  "invoice.payment_failed":
    "An Invoice's automatic payment failed (typically a subscription renewal).",
  "checkout.session.completed": "A Checkout Session completed successfully.",
};

export const stripeEventReceivedTriggerMeta: TriggerMeta = {
  key: "stripe:event_received",
  provider: "stripe",
  type: "event_received",
  displayName: "Stripe Event Received",
  description:
    "Fires when one of the selected Stripe events occurs (e.g. payment_intent.payment_failed, customer.subscription.created). Select one or more event types to subscribe to.",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "enabledEvents",
      label: "Event Types",
      description:
        "Pick one or more Stripe event types to fire on. The trigger fires once per matching event delivered by Stripe. At least one event type is required.",
      type: "combobox",
      required: true,
      multiple: true,
      placeholder: "Pick one or more Stripe event types…",
      options: STRIPE_ALLOWED_EVENT_TYPES.map((eventType) => ({
        value: eventType,
        label: eventType,
        description: STRIPE_EVENT_DESCRIPTIONS[eventType] ?? "",
      })),
    },
  ],
  payloadShape: [
    {
      name: "stripeEventType",
      type: "string",
      description:
        "The actual Stripe event type that fired (e.g. payment_intent.payment_failed). Workflows branch on this.",
    },
    {
      name: "data",
      type: "object",
      description:
        "The Stripe resource snapshot — the primary resource the event is about (PaymentIntent / Subscription / Customer / Invoice / Charge / CheckoutSession).",
      sensitive: true,
    },
    {
      name: "previousAttributes",
      type: "object",
      description:
        "The diff of fields that changed on *.updated events (or null). Same content shape as `data`.",
      sensitive: true,
    },
    {
      name: "created",
      type: "number",
      description: "Unix seconds when Stripe fired the event.",
    },
    {
      name: "livemode",
      type: "boolean",
      description:
        "True if production, false if test mode. Useful for branching on test-vs-prod events.",
    },
    {
      name: "account",
      type: "string",
      description: "Connect account id (acct_xxx) when present, else null.",
    },
    {
      name: "apiVersion",
      type: "string",
      description: "The Stripe API version that signed this event.",
    },
    {
      name: "request",
      type: "object",
      description:
        "Request metadata ({id, idempotency_key}) for the API call that triggered the event — diagnostic context.",
    },
  ],
  displayOrder: 10,
};
