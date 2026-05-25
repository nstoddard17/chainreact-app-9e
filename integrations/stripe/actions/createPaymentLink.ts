import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { paymentLinksCreate } from "../api/paymentLinks";
import { CreatePaymentLinkConfigSchema } from "./createPaymentLink.schema";

/**
 * Stripe `create_payment_link` action handler — Stripe 2.1 Commit 2.
 *
 * POSTs `/v1/payment_links` with the connected merchant's access
 * token. Payment Links are shareable, reusable URLs hosted by Stripe
 * — lighter-weight than full Checkout Sessions (no per-customer
 * success/cancel URLs required, link is reusable across customers).
 *
 * Idempotency-keyed (Q4) — Payment Links are billing-impacting (a
 * duplicate link adds noise + can confuse customers about which URL
 * to use). The key shape is `${runId}:${nodeId}:
 * stripe_action_create_payment_link` — same convention as every
 * other V2 Stripe action. V1's `createPaymentLink.ts` did NOT send
 * an Idempotency-Key header; V2 adds it for cutover safety and
 * matches the Slice 11 pattern.
 *
 * `accountId` resolution: when the workflow's trigger is a Stripe
 * webhook event, `triggerEvent.accountId` carries the connected
 * merchant's `stripe_user_id`. For manual / cross-provider triggers,
 * `accountId` is null and `refreshAndRetry`'s integration lookup
 * picks the user's single Stripe integration row.
 *
 * Output shape (downstream variable refs — locked to 6 stable keys):
 *   { paymentLinkId, url, active, currency, metadata, livemode }
 *
 *   Stripe's `POST /v1/payment_links` response does NOT inline
 *   `line_items` without `expand: ["line_items"]`. V2 doesn't request
 *   expansion — workflows that need the line-item snapshot back
 *   already have it as their input config, and an extra Graph
 *   round-trip just to echo would burn quota. So `lineItems` is
 *   intentionally absent from the output. V1's
 *   `paymentLink.line_items?.data || []` returned an empty array on
 *   every call (Stripe doesn't ship the data without expand); V2
 *   surfaces that reality by omitting the field.
 *
 *   Input is NOT spread into output (V2 convention — handler builds
 *   a typed projection from Stripe's response only).
 */
export const createPaymentLink: ActionHandler = async (input) => {
  const config = CreatePaymentLinkConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_payment_link",
  });

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_payment_link",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      paymentLinksCreate({
        accessToken,
        lineItems: config.lineItems.map((item) => ({
          price: item.priceId,
          quantity: item.quantity,
        })),
        metadata: config.metadata,
        allowPromotionCodes: config.allowPromotionCodes,
        afterCompletion: config.afterCompletion,
        idempotencyKey,
      }),
  });

  return {
    output: {
      paymentLinkId: result.id,
      url: result.url,
      active: result.active,
      currency: result.currency,
      metadata: result.metadata,
      livemode: result.livemode,
    },
  };
};
