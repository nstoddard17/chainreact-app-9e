import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST fulfillment resource wrappers.
 *
 * Slice 12 Commit 3 — covers the fulfillment-order-driven flow that
 * Shopify's REST API requires from 2022-04 onwards. The legacy
 * `POST /orders/{id}/fulfillments.json` endpoint is deprecated in
 * 2024-10; the modern flow is:
 *
 *   1. GET `/orders/{id}/fulfillment_orders.json` — discover the
 *      fulfillment orders associated with the parent order. Each
 *      represents a portion of the order (location-split, partial
 *      fulfill, etc.).
 *   2. Pick the first eligible (`open` or `scheduled`) fulfillment
 *      order. For Slice 12 Batch 1 we always pick the first eligible
 *      one — multi-fulfillment-order flows (split shipments) are
 *      deferred. If none are eligible, fall back to the first one
 *      and let Shopify return a clear error.
 *   3. POST `/fulfillments.json` with
 *      `line_items_by_fulfillment_order: [{ fulfillment_order_id,
 *      fulfillment_order_line_items: [{id, quantity}] }]`,
 *      `tracking_info`, and `notify_customer`.
 *
 * V1's [`createFulfillment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createFulfillment.ts)
 * uses the GraphQL `fulfillmentCreateV2` mutation for the same flow;
 * V2 ports to REST per Slice 12 plan §"V1 patterns to skip" (no
 * GraphQL in Batch 1).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyFulfillmentOrderLineItem {
  id: number;
  remaining_quantity?: number;
  fulfillable_quantity?: number;
}

export interface ShopifyFulfillmentOrder {
  id: number;
  status: string;
  line_items: ShopifyFulfillmentOrderLineItem[];
}

interface ShopifyFulfillmentOrdersResponse {
  fulfillment_orders: ShopifyFulfillmentOrder[];
}

export interface ShopifyFulfillmentTrackingInfo {
  number?: string | null;
  url?: string | null;
  company?: string | null;
}

export interface ShopifyFulfillment {
  id: number;
  order_id?: number;
  status?: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_company?: string | null;
  tracking_numbers?: string[];
  tracking_urls?: string[];
  created_at?: string;
  updated_at?: string;
}

interface ShopifyFulfillmentResponse {
  fulfillment: ShopifyFulfillment;
}

// ─── fulfillmentOrdersList ──────────────────────────────────────────────────

export interface FulfillmentOrdersListInput {
  shopDomain: string;
  accessToken: string;
  orderId: string | number;
}

export async function fulfillmentOrdersList(
  input: FulfillmentOrdersListInput,
): Promise<ShopifyFulfillmentOrder[]> {
  const response = await shopifyRequest<ShopifyFulfillmentOrdersResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: `/orders/${encodeURIComponent(String(input.orderId))}/fulfillment_orders.json`,
    resourceForNotFound: `order ${input.orderId} (fulfillment orders)`,
  });
  return response.fulfillment_orders ?? [];
}

// ─── fulfillmentsCreate ─────────────────────────────────────────────────────

export interface FulfillmentsCreateLineItem {
  /** Fulfillment-order line item id (NOT the order line-item id). */
  id: number;
  quantity: number;
}

export interface FulfillmentsCreateInput {
  shopDomain: string;
  accessToken: string;
  fulfillment_order_id: number;
  line_items: FulfillmentsCreateLineItem[];
  /**
   * Q11 consent gate — required at the action schema. Maps directly to
   * Shopify's `notify_customer` body field.
   */
  notify_customer: boolean;
  tracking_info?: ShopifyFulfillmentTrackingInfo;
}

export async function fulfillmentsCreate(
  input: FulfillmentsCreateInput,
): Promise<ShopifyFulfillment> {
  const fulfillment: Record<string, unknown> = {
    notify_customer: input.notify_customer,
    line_items_by_fulfillment_order: [
      {
        fulfillment_order_id: input.fulfillment_order_id,
        fulfillment_order_line_items: input.line_items,
      },
    ],
  };
  if (input.tracking_info !== undefined) {
    fulfillment.tracking_info = input.tracking_info;
  }

  const response = await shopifyRequest<ShopifyFulfillmentResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/fulfillments.json",
    body: { fulfillment },
    resourceForNotFound: "fulfillment (create)",
  });
  return response.fulfillment;
}
