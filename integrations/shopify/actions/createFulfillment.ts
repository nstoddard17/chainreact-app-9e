import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  fulfillmentOrdersList,
  fulfillmentsCreate,
  type ShopifyFulfillmentTrackingInfo,
} from "../../_shared/shopify/api/fulfillments";
import { CreateFulfillmentConfigSchema } from "./createFulfillment.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `create_fulfillment` Shopify action handler (Slice 12 Commit 3).
 *
 * Two-step REST flow (Shopify deprecated the legacy direct-create
 * endpoint in 2022-04 — modern flow goes through fulfillment orders):
 *
 *   1. GET `/orders/{id}/fulfillment_orders.json` — discover the
 *      fulfillment orders for the parent order. Auxiliary call,
 *      `refreshAndRetry`-wrapped.
 *   2. POST `/fulfillments.json` — create a fulfillment for the
 *      first eligible (`open` / `scheduled`) fulfillment order
 *      with all its remaining-quantity line items, optional tracking
 *      info, and the Q11-gated `notify_customer`.
 *
 * Multi-fulfillment-order flows (split shipments across locations)
 * are deferred — Slice 12 picks the first eligible fulfillment order
 * and includes ALL its line items. Workflows requiring split
 * shipments need a future enhancement.
 *
 * Throws if no fulfillment orders exist or if all are already closed
 * — surfaces as a clear "nothing to fulfill" error to the workflow
 * runner.
 */
export const createFulfillment: ActionHandler = async (input) => {
  const config = CreateFulfillmentConfigSchema.parse(input.config);
  const { shopDomain, accountId } = await resolveShopDomain({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  // Step 1 — fetch fulfillment orders.
  const fulfillmentOrders = await refreshAndRetry({
    userId: input.userId,
    provider: "shopify",
    accountId,
    apiCall: (accessToken) =>
      fulfillmentOrdersList({
        shopDomain,
        accessToken,
        orderId: config.order_id,
      }),
  });

  if (fulfillmentOrders.length === 0) {
    throw new Error(
      `Shopify create_fulfillment: order ${config.order_id} has no fulfillment orders.`,
    );
  }

  const eligible =
    fulfillmentOrders.find(
      (fo) => fo.status === "open" || fo.status === "scheduled",
    ) ?? fulfillmentOrders[0]!;

  const lineItems = (eligible.line_items ?? [])
    .filter((li) => (li.remaining_quantity ?? li.fulfillable_quantity ?? 0) > 0)
    .map((li) => ({
      id: li.id,
      quantity: li.remaining_quantity ?? li.fulfillable_quantity ?? 0,
    }));

  if (lineItems.length === 0) {
    throw new Error(
      `Shopify create_fulfillment: fulfillment order ${eligible.id} has no fulfillable line items remaining.`,
    );
  }

  // Build tracking_info only when at least one field is supplied.
  let tracking_info: ShopifyFulfillmentTrackingInfo | undefined;
  if (
    config.tracking_number !== undefined ||
    config.tracking_company !== undefined ||
    config.tracking_url !== undefined
  ) {
    tracking_info = {};
    if (config.tracking_number !== undefined) tracking_info.number = config.tracking_number;
    if (config.tracking_company !== undefined) tracking_info.company = config.tracking_company;
    if (config.tracking_url !== undefined) tracking_info.url = config.tracking_url;
  }

  // Step 2 — create the fulfillment.
  const fulfillment = await refreshAndRetry({
    userId: input.userId,
    provider: "shopify",
    accountId,
    apiCall: (accessToken) =>
      fulfillmentsCreate({
        shopDomain,
        accessToken,
        fulfillment_order_id: eligible.id,
        line_items: lineItems,
        notify_customer: config.notify_customer,
        tracking_info,
      }),
  });

  return {
    output: {
      success: true,
      fulfillmentId: fulfillment.id,
      orderId:
        typeof config.order_id === "number"
          ? config.order_id
          : Number(config.order_id),
      status: fulfillment.status ?? null,
      trackingNumber:
        fulfillment.tracking_number ??
        (fulfillment.tracking_numbers?.[0] ?? null),
      trackingUrl:
        fulfillment.tracking_url ?? (fulfillment.tracking_urls?.[0] ?? null),
      adminUrl: `https://${shopDomain}/admin/orders/${config.order_id}`,
      createdAt: fulfillment.created_at ?? null,
    },
  };
};
