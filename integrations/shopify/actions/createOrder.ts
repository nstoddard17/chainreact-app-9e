import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ordersCreate } from "../../_shared/shopify/api/orders";
import { CreateOrderConfigSchema } from "./createOrder.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `create_order` Shopify action handler (Slice 12 Commit 3).
 *
 * POST `/admin/api/2024-10/orders.json` with the connected shop's
 * merchant access token. The shop domain is sourced from the
 * integration row (NOT action config) per Slice 12 plan
 * §"OAuth model".
 *
 * Q11 — `send_receipt` is required at the schema layer (no default).
 * The boolean lands directly in Shopify's `order.send_receipt` REST
 * field, controlling the customer-facing receipt email.
 *
 * Output shape (downstream variable refs):
 *   { orderId, orderNumber, totalPrice, currency, financialStatus,
 *     fulfillmentStatus, adminUrl, createdAt }
 */
export const createOrder: ActionHandler = async (input) => {
  const config = CreateOrderConfigSchema.parse(input.config);

  const { shopDomain, providerAccountId } = await resolveShopDomain({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const order = await refreshAndRetry({
    accountId: input.accountId,
    provider: "shopify",
    providerAccountId,
    apiCall: (accessToken) =>
      ordersCreate({
        shopDomain,
        accessToken,
        email: config.email,
        line_items: config.line_items,
        send_receipt: config.send_receipt,
        financial_status: config.financial_status,
        tags: config.tags,
        note: config.note,
        shipping_address: config.shipping_address,
        billing_address: config.billing_address,
      }),
  });

  return {
    output: {
      orderId: order.id,
      orderNumber: order.order_number ?? null,
      orderName: order.name ?? null,
      email: order.email ?? null,
      totalPrice: order.total_price ?? null,
      currency: order.currency ?? null,
      financialStatus: order.financial_status ?? null,
      fulfillmentStatus: order.fulfillment_status ?? null,
      adminUrl: `https://${shopDomain}/admin/orders/${order.id}`,
      createdAt: order.created_at ?? null,
    },
  };
};
