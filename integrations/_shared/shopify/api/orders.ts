import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/orders` resource wrappers.
 *
 * Slice 12 Commit 3. Per-resource thin wrapper layer — body shape per
 * endpoint lives here; HTTP semantics + auth + error mapping live in
 * `_request.ts`. Output types match Shopify's REST response shape
 * (snake_case wire format); handlers map the wire shape to typed
 * outputs at their boundary.
 *
 * Resources covered:
 *   - `ordersCreate` — POST `/orders.json` (Slice 12 `create_order`)
 *   - `ordersGet` — GET `/orders/{id}.json` (auxiliary fetch for
 *     `add_order_note` append mode and `update_order_status`
 *     add_tags / add_note routes)
 *   - `ordersUpdate` — PUT `/orders/{id}.json` (used by
 *     `update_order_status` add_tags / add_note + `add_order_note`)
 *   - `ordersCancel` — POST `/orders/{id}/cancel.json` (used by
 *     `update_order_status` cancel route)
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyOrderLineItem {
  id?: number;
  variant_id?: number;
  product_id?: number;
  quantity: number;
  title?: string;
  price?: string;
}

export interface ShopifyOrderAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  country_code?: string;
  zip?: string;
}

export interface ShopifyOrder {
  id: number;
  order_number?: number;
  name?: string;
  email?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  tags?: string;
  note?: string | null;
  line_items?: ShopifyOrderLineItem[];
  shipping_address?: ShopifyOrderAddress | null;
  billing_address?: ShopifyOrderAddress | null;
  created_at?: string;
  updated_at?: string;
  cancelled_at?: string | null;
}

interface ShopifyOrderResponse {
  order: ShopifyOrder;
}

// ─── ordersCreate ───────────────────────────────────────────────────────────

export interface OrdersCreateLineItem {
  variant_id: number;
  quantity: number;
}

export interface OrdersCreateInput {
  shopDomain: string;
  accessToken: string;
  email: string;
  line_items: OrdersCreateLineItem[];
  send_receipt: boolean;
  financial_status?: string;
  tags?: string;
  note?: string;
  shipping_address?: ShopifyOrderAddress;
  billing_address?: ShopifyOrderAddress;
}

export async function ordersCreate(
  input: OrdersCreateInput,
): Promise<ShopifyOrder> {
  const order: Record<string, unknown> = {
    email: input.email,
    line_items: input.line_items,
    send_receipt: input.send_receipt,
  };
  if (input.financial_status !== undefined) order.financial_status = input.financial_status;
  if (input.tags !== undefined) order.tags = input.tags;
  if (input.note !== undefined) order.note = input.note;
  if (input.shipping_address !== undefined) order.shipping_address = input.shipping_address;
  if (input.billing_address !== undefined) order.billing_address = input.billing_address;

  const response = await shopifyRequest<ShopifyOrderResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/orders.json",
    body: { order },
    resourceForNotFound: "order (create)",
  });
  return response.order;
}

// ─── ordersGet ──────────────────────────────────────────────────────────────

export interface OrdersGetInput {
  shopDomain: string;
  accessToken: string;
  orderId: string | number;
}

export async function ordersGet(input: OrdersGetInput): Promise<ShopifyOrder> {
  const response = await shopifyRequest<ShopifyOrderResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: `/orders/${encodeURIComponent(String(input.orderId))}.json`,
    resourceForNotFound: `order ${input.orderId}`,
  });
  return response.order;
}

// ─── ordersUpdate ───────────────────────────────────────────────────────────

export interface OrdersUpdateInput {
  shopDomain: string;
  accessToken: string;
  orderId: string | number;
  /**
   * Fields to update. Shopify's PUT /orders/{id}.json accepts a partial
   * order body — only supplied fields are changed. `tags` and `note`
   * are the ones Slice 12 exercises (via update_order_status +
   * add_order_note).
   */
  fields: Partial<{
    tags: string;
    note: string;
  }>;
}

export async function ordersUpdate(
  input: OrdersUpdateInput,
): Promise<ShopifyOrder> {
  const order: Record<string, unknown> = { id: Number(input.orderId) };
  if (input.fields.tags !== undefined) order.tags = input.fields.tags;
  if (input.fields.note !== undefined) order.note = input.fields.note;

  const response = await shopifyRequest<ShopifyOrderResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "PUT",
    path: `/orders/${encodeURIComponent(String(input.orderId))}.json`,
    body: { order },
    resourceForNotFound: `order ${input.orderId}`,
  });
  return response.order;
}

// ─── ordersCancel ───────────────────────────────────────────────────────────

export interface OrdersCancelInput {
  shopDomain: string;
  accessToken: string;
  orderId: string | number;
  /**
   * Maps to Shopify's `email` body field — controls whether the
   * customer receives a cancellation email. Slice 12 surfaces this
   * via `update_order_status`'s required `notify_customer` field
   * (Q11 — no silent default).
   */
  notify_customer: boolean;
  reason?: string;
  restock?: boolean;
}

export async function ordersCancel(
  input: OrdersCancelInput,
): Promise<ShopifyOrder> {
  const body: Record<string, unknown> = {
    email: input.notify_customer,
  };
  if (input.reason !== undefined) body.reason = input.reason;
  if (input.restock !== undefined) body.restock = input.restock;

  const response = await shopifyRequest<ShopifyOrderResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: `/orders/${encodeURIComponent(String(input.orderId))}/cancel.json`,
    body,
    resourceForNotFound: `order ${input.orderId}`,
  });
  return response.order;
}
