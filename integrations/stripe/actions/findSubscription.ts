import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import {
  subscriptionsGet,
  type StripeSubscription,
} from "../api/subscriptions";
import { FindSubscriptionConfigSchema } from "./findSubscription.schema";

/**
 * Stripe `find_subscription` action handler — Stripe 2.1 Commit 5.
 *
 * Direct id lookup via `GET /v1/subscriptions/{subscriptionId}`. Read-only —
 * no Idempotency-Key (Stripe rejects the header on GET).
 *
 * 404 → `{ found: false, subscription: null }` (NOT thrown). Mirrors
 * `find_customer`'s catch-NotFoundError-here pattern: the wrapper layer's
 * contract is "throw on 404" and `find_subscription`'s contract is
 * "no-throw on no-match."
 *
 * Output shape (bounded 14-key projection):
 *   { found: boolean,
 *     subscription: {
 *       subscriptionId, customerId, status,
 *       currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt,
 *       trialStart, trialEnd,
 *       collectionMethod, currency, latestInvoiceId,
 *       metadata, livemode,
 *     } | null }
 *
 *   No raw Stripe response spread — every key is an explicit projection.
 *   Nullable Stripe fields (canceledAt / trialStart / trialEnd /
 *   collectionMethod / currency / latestInvoiceId) preserve their null
 *   values rather than defaulting.
 *
 *   The full raw `items` array is intentionally NOT included — V2 ships a
 *   bounded projection per parity-stripe Q4. Workflow authors who need
 *   line-item data should use `get_subscription_items` (future) or the
 *   Stripe API directly.
 */
export const findSubscription: ActionHandler = async (input) => {
  const config = FindSubscriptionConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  try {
    const result = await refreshAndRetry({
      userId: input.userId,
      provider: "stripe",
      accountId,
      apiCall: (accessToken) =>
        subscriptionsGet({
          accessToken,
          subscriptionId: config.subscriptionId,
        }),
    });
    return {
      output: { found: true, subscription: subscriptionOutput(result) },
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { output: { found: false, subscription: null } };
    }
    // Defensive: refreshAndRetry already handled the refresh path before
    // a remaining 401 bubbles up.
    if (err instanceof Unauthorized401Error) throw err;
    throw err;
  }
};

function subscriptionOutput(s: StripeSubscription): Record<string, unknown> {
  return {
    subscriptionId: s.id,
    customerId: s.customer,
    status: s.status,
    currentPeriodStart: s.current_period_start,
    currentPeriodEnd: s.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    canceledAt: s.canceled_at,
    trialStart: s.trial_start,
    trialEnd: s.trial_end,
    collectionMethod: s.collection_method,
    currency: s.currency,
    latestInvoiceId: s.latest_invoice,
    metadata: s.metadata,
    livemode: s.livemode,
  };
}
