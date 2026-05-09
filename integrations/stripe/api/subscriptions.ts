import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/subscriptions` API wrappers.
 *
 * Four endpoints in Slice 11 Batch 1: create, get, update, cancel.
 *
 * The update flow is two-stage in V1 — fetch the subscription first
 * to extract the subscription_item id (`si_xxx`), then POST with
 * `items: [{id, price?, quantity?}]`. V2 mirrors this in the handler
 * (not the wrapper) since it's a workflow concern, not a wire-level
 * concern. The `subscriptionsGet` wrapper exists for that pre-fetch.
 */

export interface StripeSubscriptionItem {
  id: string;
  object: "subscription_item";
  price: { id: string; product: string };
  quantity: number;
  metadata?: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  object: "subscription";
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  items: { object: "list"; data: StripeSubscriptionItem[] };
  metadata: Record<string, string>;
  created: number;
}

// ─── subscriptionsCreate ────────────────────────────────────────────────────

export interface SubscriptionsCreateInput {
  accessToken: string;
  customer: string;
  /** Single price id (Slice 11 Batch 1 — multi-item arrays deferred). */
  priceId: string;
  default_payment_method?: string;
  payment_behavior?:
    | "allow_incomplete"
    | "default_incomplete"
    | "error_if_incomplete"
    | "pending_if_incomplete";
  trial_period_days?: number;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export async function subscriptionsCreate(
  input: SubscriptionsCreateInput,
): Promise<StripeSubscription> {
  const body: Record<string, unknown> = {
    customer: input.customer,
    items: [{ price: input.priceId }],
  };
  if (input.default_payment_method !== undefined) {
    body.default_payment_method = input.default_payment_method;
  }
  if (input.payment_behavior !== undefined) {
    body.payment_behavior = input.payment_behavior;
  }
  if (input.trial_period_days !== undefined) {
    body.trial_period_days = input.trial_period_days;
  }
  if (input.metadata !== undefined) body.metadata = input.metadata;

  return stripeRequest<StripeSubscription>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/subscriptions",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "subscription (create)",
  });
}

// ─── subscriptionsGet ───────────────────────────────────────────────────────

export interface SubscriptionsGetInput {
  accessToken: string;
  subscriptionId: string;
}

export async function subscriptionsGet(
  input: SubscriptionsGetInput,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    resourceForNotFound: `subscription ${input.subscriptionId}`,
  });
}

// ─── subscriptionsUpdate ────────────────────────────────────────────────────

export interface SubscriptionItemUpdate {
  id?: string;
  price?: string;
  quantity?: number;
}

export interface SubscriptionsUpdateInput {
  accessToken: string;
  subscriptionId: string;
  items?: SubscriptionItemUpdate[];
  trial_end?: number | "now";
  cancel_at_period_end?: boolean;
  proration_behavior?: "create_prorations" | "none" | "always_invoice";
  default_payment_method?: string;
  metadata?: Record<string, string>;
  collection_method?: "charge_automatically" | "send_invoice";
  days_until_due?: number;
}

export async function subscriptionsUpdate(
  input: SubscriptionsUpdateInput,
): Promise<StripeSubscription> {
  const body: Record<string, unknown> = {};
  if (input.items !== undefined && input.items.length > 0) body.items = input.items;
  if (input.trial_end !== undefined) body.trial_end = input.trial_end;
  if (input.cancel_at_period_end !== undefined) {
    body.cancel_at_period_end = input.cancel_at_period_end;
  }
  if (input.proration_behavior !== undefined) {
    body.proration_behavior = input.proration_behavior;
  }
  if (input.default_payment_method !== undefined) {
    body.default_payment_method = input.default_payment_method;
  }
  if (input.metadata !== undefined) body.metadata = input.metadata;
  if (input.collection_method !== undefined) {
    body.collection_method = input.collection_method;
  }
  if (input.days_until_due !== undefined) {
    body.days_until_due = input.days_until_due;
  }

  return stripeRequest<StripeSubscription>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    body,
    resourceForNotFound: `subscription ${input.subscriptionId}`,
  });
}

// ─── subscriptionsCancel ────────────────────────────────────────────────────

export interface SubscriptionsCancelInput {
  accessToken: string;
  subscriptionId: string;
  /**
   * Stripe's API: when `cancel_at_period_end=true` is sent, the
   * subscription is updated (not deleted) to cancel at period end.
   * Otherwise DELETE cancels immediately. V1 sends both flag families
   * via query params on a DELETE — V2 mirrors the wire shape.
   */
  cancel_at_period_end?: boolean;
  invoice_now?: boolean;
  prorate?: boolean;
}

export async function subscriptionsCancel(
  input: SubscriptionsCancelInput,
): Promise<StripeSubscription> {
  const query = new URLSearchParams();
  if (input.cancel_at_period_end === true) query.set("cancel_at_period_end", "true");
  if (input.invoice_now === true) query.set("invoice_now", "true");
  if (input.prorate === true) query.set("prorate", "true");

  return stripeRequest<StripeSubscription>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    query: query.toString().length > 0 ? query : undefined,
    resourceForNotFound: `subscription ${input.subscriptionId}`,
  });
}
