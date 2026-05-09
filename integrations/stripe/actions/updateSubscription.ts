import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type SubscriptionItemUpdate,
  subscriptionsGet,
  subscriptionsUpdate,
} from "../api/subscriptions";
import { UpdateSubscriptionConfigSchema } from "./updateSubscription.schema";

/**
 * Stripe `update_subscription` action handler.
 *
 * Two-stage flow (mirrors V1's `updateSubscription.ts:26-34`):
 *   1. GET `/v1/subscriptions/{id}` → extract
 *      `items.data[0].id` (`si_xxx`).
 *   2. POST `/v1/subscriptions/{id}` with
 *      `items: [{id, price?, quantity?}]`. Sending the item id
 *      ensures Stripe updates THE existing item (rather than adding
 *      a second one to the subscription).
 *
 * Both calls wrap in `refreshAndRetry` per CLAUDE.md §6 contract
 * (auxiliary call discipline) — a stale token surfaces on either
 * call, and the refresh path applies to both.
 *
 * No `Idempotency-Key` — update is server-side idempotent on the
 * resource id.
 *
 * Output shape (V1 mechanical port — Unix-seconds timestamps, NOT
 * ISO; this is V1's update-vs-create asymmetry preserved):
 *   { subscriptionId, customerId, status, currentPeriodStart,
 *     currentPeriodEnd, cancelAtPeriodEnd, trialStart, trialEnd,
 *     items, metadata }
 */
export const updateSubscription: ActionHandler = async (input) => {
  const config = UpdateSubscriptionConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  // Build the items array only when priceId or quantity is supplied.
  // When neither is set, omit the items field entirely so the rest of
  // the update (trial_end, cancel_at_period_end, metadata, …) goes
  // through unchanged on the server.
  let items: SubscriptionItemUpdate[] | undefined;
  if (config.priceId !== undefined || config.quantity !== undefined) {
    const existing = await refreshAndRetry({
      userId: input.userId,
      provider: "stripe",
      accountId,
      apiCall: (accessToken) =>
        subscriptionsGet({
          accessToken,
          subscriptionId: config.subscriptionId,
        }),
    });
    const subscriptionItemId = existing.items.data[0]?.id;
    const item: SubscriptionItemUpdate = {};
    if (subscriptionItemId !== undefined) item.id = subscriptionItemId;
    if (config.priceId !== undefined) item.price = config.priceId;
    if (config.quantity !== undefined) item.quantity = config.quantity;
    items = [item];
  }

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      subscriptionsUpdate({
        accessToken,
        subscriptionId: config.subscriptionId,
        items,
        trial_end: config.trial_end,
        cancel_at_period_end: config.cancel_at_period_end,
        proration_behavior: config.proration_behavior,
        default_payment_method: config.default_payment_method,
        metadata: config.metadata,
        collection_method: config.collection_method,
        days_until_due: config.days_until_due,
      }),
  });

  return {
    output: {
      subscriptionId: result.id,
      customerId: result.customer,
      status: result.status,
      currentPeriodStart: result.current_period_start,
      currentPeriodEnd: result.current_period_end,
      cancelAtPeriodEnd: result.cancel_at_period_end,
      trialStart: result.trial_start,
      trialEnd: result.trial_end,
      items: result.items.data,
      metadata: result.metadata,
    },
  };
};
