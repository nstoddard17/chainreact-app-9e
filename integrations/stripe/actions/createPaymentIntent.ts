import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { dollarsToCents } from "@/integrations/_shared/stripe/amount";
import { paymentIntentsCreate } from "../api/paymentIntents";
import { CreatePaymentIntentConfigSchema } from "./createPaymentIntent.schema";

/**
 * Stripe `create_payment_intent` action handler.
 *
 * Idempotency-keyed (Q4) — load-bearing for billing-impacting
 * actions. Without the header, an engine-level retry of a
 * temporarily-failed run would charge the customer twice.
 *
 * Amount conversion: dollars → cents via `dollarsToCents`. Throws
 * before reaching Stripe if the user's amount is non-finite or
 * negative — typed handler-side error rather than a Stripe 400.
 *
 * Output shape:
 *   { paymentIntentId, clientSecret, amount, currency, status,
 *     customerId, description, created, metadata, nextAction }
 *
 *   `amount` echoes back in CENTS (Stripe wire-format). Workflows
 *   that display it should convert; workflows that pass it to
 *   downstream Stripe actions consume it as-is.
 */
export const createPaymentIntent: ActionHandler = async (input) => {
  const config = CreatePaymentIntentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_payment_intent",
  });

  const amountCents = dollarsToCents(config.amount);

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      paymentIntentsCreate({
        accessToken,
        amount: amountCents,
        currency: config.currency,
        customer: config.customerId,
        description: config.description,
        metadata: config.metadata,
        idempotencyKey,
      }),
  });

  return {
    output: {
      paymentIntentId: result.id,
      clientSecret: result.client_secret,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
      customerId: result.customer,
      description: result.description,
      created: result.created,
      metadata: result.metadata,
      nextAction: result.next_action,
    },
  };
};
