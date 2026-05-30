import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { subscriptionsCreate } from "../api/subscriptions";
import { CreateSubscriptionConfigSchema } from "./createSubscription.schema";

/**
 * Stripe `create_subscription` action handler.
 *
 * Idempotency-keyed (Q4) — subscriptions are billing-impacting;
 * without the header, an engine-level retry could enroll the
 * customer in two subscriptions to the same price.
 *
 * `currentPeriodStart` / `currentPeriodEnd` / `trialStart` /
 * `trialEnd` are converted from Unix epoch seconds to ISO-8601
 * strings (V1 behavior preserved — V1's `createSubscription.ts:139-150`
 * uses ISO format for create's output but raw Unix for update's
 * output, an asymmetry V2 mirrors mechanically; future V2 may
 * normalize).
 */
export const createSubscription: ActionHandler = async (input) => {
  const config = CreateSubscriptionConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.providerAccountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_subscription",
  });

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "stripe",
    providerAccountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_subscription",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      subscriptionsCreate({
        accessToken,
        customer: config.customerId,
        priceId: config.priceId,
        default_payment_method: config.default_payment_method,
        payment_behavior: config.payment_behavior,
        trial_period_days: config.trialPeriodDays,
        metadata: config.metadata,
        idempotencyKey,
      }),
  });

  const firstItem = result.items.data[0] ?? null;

  return {
    output: {
      subscriptionId: result.id,
      customerId: result.customer,
      status: result.status,
      currentPeriodStart: epochToIso(result.current_period_start),
      currentPeriodEnd: epochToIso(result.current_period_end),
      cancelAtPeriodEnd: result.cancel_at_period_end,
      trialStart: epochToIso(result.trial_start),
      trialEnd: epochToIso(result.trial_end),
      priceId: firstItem?.price?.id ?? null,
      quantity: firstItem?.quantity ?? null,
      created: result.created,
      metadata: result.metadata,
    },
  };
};

function epochToIso(seconds: number | null): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000).toISOString();
}
