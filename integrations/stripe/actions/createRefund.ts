import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { dollarsToCents } from "@/integrations/_shared/stripe/amount";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { refundsCreate } from "../api/refunds";
import { CreateRefundConfigSchema } from "./createRefund.schema";

/**
 * Stripe `create_refund` action handler.
 *
 * Idempotency-keyed (Q4) — refunds are billing-impacting; without
 * the header, an engine-level retry could double-refund a customer.
 *
 * Amount conversion: dollars → cents via `dollarsToCents` when
 * `amount` is supplied. When omitted, Stripe full-refunds the
 * underlying charge (common case).
 */
export const createRefund: ActionHandler = async (input) => {
  const config = CreateRefundConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.providerAccountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_refund",
  });

  const amountCents =
    config.amount !== undefined ? dollarsToCents(config.amount) : undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "stripe",
    providerAccountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_refund",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      refundsCreate({
        accessToken,
        charge: config.chargeId,
        payment_intent: config.paymentIntentId,
        amount: amountCents,
        reason: config.reason,
        metadata: config.metadata,
        idempotencyKey,
      }),
  });

  return {
    output: {
      refundId: result.id,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
      charge: result.charge,
      paymentIntent: result.payment_intent,
      reason: result.reason,
      receiptNumber: result.receipt_number,
      created: result.created,
      metadata: result.metadata,
    },
  };
};
