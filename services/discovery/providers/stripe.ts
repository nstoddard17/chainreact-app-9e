import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Stripe discovery sub-registry — Slice 4.STRIPE-TRIGGER-META-2.
 *
 * Per-provider extraction of the Stripe meta imports. Closes the
 * remaining direct-import case — Stripe was the LAST provider importing
 * its action metas directly into `services/discovery/_registry.ts`
 * (lines 246-264 before this slice). After this refactor, **all 26
 * providers use the same per-provider sub-registry pattern** — one
 * template for future provider arcs.
 *
 * Coverage:
 *   - **16 action metas** (Slices 3.45 + 3.46 — customer/payment lifecycle
 *     + subscriptions/commerce, full Stripe action coverage).
 *   - **1 trigger meta** — the `event_received` consolidated webhook
 *     trigger that closes the single launch blocker identified by
 *     PROVIDER-AUDIT-1. Activation registered in
 *     `integrations/stripe/triggers/eventReceived/index.ts`, so the
 *     trigger-meta-activation-invariant passes with no exemption.
 *
 * displayOrder: 10..160 across the actions (matches the existing comment
 * blocks in `_registry.ts` pre-refactor — 10..80 for the customer +
 * payment lifecycle 8 actions, 90..160 for subscriptions + commerce).
 * The trigger sits at displayOrder 10 (only trigger for the provider).
 *
 * **enabledEvents field name MUST be `enabledEvents` verbatim** — drift
 * silently breaks activation. The trigger meta imports
 * `STRIPE_ALLOWED_EVENT_TYPES` directly from
 * `integrations/stripe/triggers/eventReceived/allowedEventTypes.ts` so
 * meta and runtime share one source of truth.
 */

import { stripeCreateCustomerMeta } from "@/integrations/stripe/actions/createCustomer.meta";
import { stripeUpdateCustomerMeta } from "@/integrations/stripe/actions/updateCustomer.meta";
import { stripeFindCustomerMeta } from "@/integrations/stripe/actions/findCustomer.meta";
import { stripeCreatePaymentIntentMeta } from "@/integrations/stripe/actions/createPaymentIntent.meta";
import { stripeConfirmPaymentIntentMeta } from "@/integrations/stripe/actions/confirmPaymentIntent.meta";
import { stripeCapturePaymentIntentMeta } from "@/integrations/stripe/actions/capturePaymentIntent.meta";
import { stripeCreateRefundMeta } from "@/integrations/stripe/actions/createRefund.meta";
import { stripeFindPaymentIntentMeta } from "@/integrations/stripe/actions/findPaymentIntent.meta";
import { stripeCreateSubscriptionMeta } from "@/integrations/stripe/actions/createSubscription.meta";
import { stripeUpdateSubscriptionMeta } from "@/integrations/stripe/actions/updateSubscription.meta";
import { stripeCancelSubscriptionMeta } from "@/integrations/stripe/actions/cancelSubscription.meta";
import { stripeFindSubscriptionMeta } from "@/integrations/stripe/actions/findSubscription.meta";
import { stripeCreateCheckoutSessionMeta } from "@/integrations/stripe/actions/createCheckoutSession.meta";
import { stripeCreatePaymentLinkMeta } from "@/integrations/stripe/actions/createPaymentLink.meta";
import { stripeCreateInvoiceMeta } from "@/integrations/stripe/actions/createInvoice.meta";
import { stripeGetPaymentsMeta } from "@/integrations/stripe/actions/getPayments.meta";

import { stripeEventReceivedTriggerMeta } from "@/integrations/stripe/triggers/eventReceived/eventReceived.meta";

/** Stripe action metas in displayOrder (10..160). */
export const STRIPE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  // Customer + payment lifecycle (Slice 3.45 — 8 of 16, displayOrder 10..80).
  // Money-moving actions; every meta carries unit-anchored descriptions
  // (DOLLARS vs CENTS) per the metadata plan §8.
  stripeCreateCustomerMeta,
  stripeUpdateCustomerMeta,
  stripeFindCustomerMeta,
  stripeCreatePaymentIntentMeta,
  stripeConfirmPaymentIntentMeta,
  stripeCapturePaymentIntentMeta,
  stripeCreateRefundMeta,
  stripeFindPaymentIntentMeta,
  // Subscriptions + commerce surfaces (Slice 3.46 — closes Stripe at 16/16,
  // displayOrder 90..160). Money/subscription-changing actions; descriptions
  // explicitly call out money-moving / destructive / cancellation-risk
  // semantics.
  stripeCreateSubscriptionMeta,
  stripeUpdateSubscriptionMeta,
  stripeCancelSubscriptionMeta,
  stripeFindSubscriptionMeta,
  stripeCreateCheckoutSessionMeta,
  stripeCreatePaymentLinkMeta,
  stripeCreateInvoiceMeta,
  stripeGetPaymentsMeta,
];

/** Stripe trigger metas — 1 consolidated webhook trigger (STRIPE-TRIGGER-META-2). */
export const STRIPE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  stripeEventReceivedTriggerMeta,
];
