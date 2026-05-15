import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { checkoutSessionsCreate } from "../api/checkoutSessions";
import { CreateCheckoutSessionConfigSchema } from "./createCheckoutSession.schema";

/**
 * Stripe `create_checkout_session` action handler — Stripe 2.1
 * Commit 1.
 *
 * POSTs `/v1/checkout/sessions` with the connected merchant's access
 * token. The handler is a thin map between V2's typed config and the
 * Stripe wire-format the `checkoutSessionsCreate` wrapper expects.
 *
 * Idempotency-keyed (Q4) — Checkout sessions are billing-impacting
 * (a duplicate session emits duplicate Stripe-hosted payment URLs
 * which a buggy retry could pass to the customer twice). The key
 * shape is `${runId}:${nodeId}:stripe_action_create_checkout_session`
 * — same convention as `create_customer` / `create_payment_intent`
 * (V1 used identical shape; cutover parity).
 *
 * `accountId` resolution: when the workflow's trigger is a Stripe
 * webhook event, `triggerEvent.accountId` carries the connected
 * merchant's `stripe_user_id`. For manual / cross-provider triggers,
 * `accountId` is null and `refreshAndRetry`'s integration lookup
 * picks the user's single Stripe integration row.
 *
 * Output shape (downstream variable refs):
 *   { sessionId, url, mode, status, paymentStatus, customerId,
 *     customerEmail, clientReferenceId, paymentIntentId,
 *     subscriptionId, amountTotal, currency, expiresAt,
 *     successUrl, cancelUrl, metadata, livemode }
 *
 *   Required-stable fields (workflow author can pin against): `sessionId`,
 *   `url`, `mode`. Stripe always populates these. The rest of the keys
 *   are `null`-able to match Stripe's response — `paymentIntentId` is
 *   null for `subscription` / `setup` modes, `subscriptionId` is null
 *   for `payment` / `setup` modes, `amountTotal` is null until the
 *   session is completed, etc.
 *
 *   Input is NOT spread into output (V2 convention — handler builds
 *   a typed projection from Stripe's response only).
 */
export const createCheckoutSession: ActionHandler = async (input) => {
  const config = CreateCheckoutSessionConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_checkout_session",
  });

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      checkoutSessionsCreate({
        accessToken,
        mode: config.mode,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
        lineItems: config.lineItems?.map((item) => ({
          price: item.priceId,
          quantity: item.quantity,
        })),
        customer: config.customer,
        customerEmail: config.customerEmail,
        clientReferenceId: config.clientReferenceId,
        metadata: config.metadata,
        allowPromotionCodes: config.allowPromotionCodes,
        automaticTaxEnabled: config.automaticTax?.enabled,
        idempotencyKey,
      }),
  });

  return {
    output: {
      sessionId: result.id,
      url: result.url,
      mode: result.mode,
      status: result.status,
      paymentStatus: result.payment_status,
      customerId: result.customer,
      customerEmail: result.customer_email,
      clientReferenceId: result.client_reference_id,
      paymentIntentId: result.payment_intent,
      subscriptionId: result.subscription,
      amountTotal: result.amount_total,
      currency: result.currency,
      expiresAt: result.expires_at,
      successUrl: result.success_url,
      cancelUrl: result.cancel_url,
      metadata: result.metadata,
      livemode: result.livemode,
    },
  };
};
