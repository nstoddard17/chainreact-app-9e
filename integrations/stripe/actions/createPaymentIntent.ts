import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { dollarsToCents } from "@/integrations/_shared/stripe/amount";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
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
 *   { paymentIntentId, amount, currency, status,
 *     customerId, description, created, metadata, nextAction }
 *
 *   `amount` echoes back in CENTS (Stripe wire-format). Workflows
 *   that display it should convert; workflows that pass it to
 *   downstream Stripe actions consume it as-is.
 *
 * Slice 3.SEC-8 — `client_secret` is intentionally NOT in the output
 * projection. Stripe's `client_secret` is meant for browser-side
 * Stripe.js / Payment Element flows; surfacing it as a workflow
 * variable lets it land in run history, the variable picker, Slack
 * messages, email bodies, http_request bodies, etc. — every place a
 * workflow author can wire upstream outputs. The SEC-7 redactor masks
 * the value in previews + run-detail serialization, but the safer
 * design (per the SEC-1 audit no-go gate #4) is to never let it leave
 * the handler. Workflows that need a customer-facing payment surface
 * should use `stripe:create_checkout_session.url` or
 * `stripe:create_payment_link.url` instead.
 */
export const createPaymentIntent: ActionHandler = async (input) => {
  const config = CreatePaymentIntentConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.providerAccountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_payment_intent",
  });

  const amountCents = dollarsToCents(config.amount);

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "stripe",
    providerAccountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_payment_intent",
      runTestMode: input.testMode === true,
    }),
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
