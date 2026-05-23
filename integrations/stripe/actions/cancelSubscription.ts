import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { subscriptionsCancel } from "../api/subscriptions";
import { CancelSubscriptionConfigSchema } from "./cancelSubscription.schema";

/**
 * Stripe `cancel_subscription` action handler.
 *
 * DELETEs `/v1/subscriptions/{id}` with optional query params for
 * Stripe's at-period-end / invoice-now / prorate behaviors. No
 * `Idempotency-Key` — DELETE on a resource id is server-side
 * idempotent (calling twice yields the same final state, the
 * second call returns the already-canceled subscription).
 *
 * Maps the V1 config field name `at_period_end` → Stripe's
 * `cancel_at_period_end` query param. (V1's wire-format mapping
 * preserved.)
 */
export const cancelSubscription: ActionHandler = async (input) => {
  const config = CancelSubscriptionConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    preflight: stripeLivemodePreflight({
      actionType: "cancel_subscription",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      subscriptionsCancel({
        accessToken,
        subscriptionId: config.subscriptionId,
        cancel_at_period_end: config.at_period_end,
        invoice_now: config.invoice_now,
        prorate: config.prorate,
      }),
  });

  return {
    output: {
      subscriptionId: result.id,
      status: result.status,
      canceledAt: result.canceled_at,
      cancelAtPeriodEnd: result.cancel_at_period_end,
      currentPeriodEnd: result.current_period_end,
      customerId: result.customer,
      endedAt: result.ended_at,
    },
  };
};
