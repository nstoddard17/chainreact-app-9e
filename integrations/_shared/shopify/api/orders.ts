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
 *   - `ordersList` — GET `/orders.json` (RESOLVERS-2; read-only, one
 *     bounded page, backs the `shopify:orders` options resolver)
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

// ─── ordersList (RESOLVERS-2) ───────────────────────────────────────────────

/** One page is 50 — orders are heavier rows than products; 50 recent orders is a usable picker. */
export const ORDERS_PAGE_SIZE = 50;

/**
 * Normalized order option — ONLY what a picker label needs.
 *
 * PRIVACY BOUNDARY: the customer's **name parts only**. Shopify's
 * `customer` sub-object also carries `email` / `phone` / addresses;
 * they are dropped HERE, at the wrapper, so they can never reach a
 * resolver, an option label, or the browser.
 */
export interface OrderOption {
  /** Numeric order id (Shopify REST id). */
  id: number;
  /** Customer-facing order name, e.g. `#1001`. Empty when Shopify omits it. */
  name: string;
  /** Customer-facing order number, e.g. 1001. Null when omitted. */
  orderNumber: number | null;
  /** Customer display name (first + last), trimmed. Empty when there's no customer. */
  customerName: string;
  /** Decimal-as-string total, e.g. "84.20". Empty when omitted. */
  totalPrice: string;
  /** ISO-4217 currency code, e.g. "USD". Empty when omitted. */
  currency: string;
  /** `paid` / `pending` / `refunded` / … Empty when omitted. */
  financialStatus: string;
  /** ISO timestamp the order was created. Empty when omitted. */
  createdAt: string;
}

interface ShopifyOrdersListResponse {
  orders?: Array<{
    id?: number;
    name?: string;
    order_number?: number;
    total_price?: string;
    currency?: string;
    financial_status?: string;
    created_at?: string;
    customer?: {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
  }>;
}

export interface OrdersListInput {
  shopDomain: string;
  accessToken: string;
}

export interface OrdersListResult {
  /** Most-recent-first (sorted on `createdAt` descending by this wrapper). */
  orders: OrderOption[];
  /** True when a full page came back — more orders may exist. */
  truncated: boolean;
}

/**
 * List the shop's orders, normalized to {@link OrderOption}.
 * READ-ONLY on the already-granted `read_orders` scope.
 *
 * `GET /orders.json?status=any&limit=50&order=created_at+desc
 *   &fields=id,name,order_number,total_price,currency,financial_status,created_at,customer`
 *
 * - `status=any` — the picker backs `update_order_status` /
 *   `add_order_note` / `create_fulfillment`, so archived + cancelled
 *   orders must be selectable too (the label carries the financial
 *   status for disambiguation).
 * - `order=created_at desc` — Shopify's list sort param. Shopify
 *   silently IGNORES unrecognized query params rather than erroring, so
 *   this can only help; the explicit descending re-sort below makes the
 *   RETURNED page's ordering deterministic regardless.
 * - `fields=…` — a closed column list. `customer` is requested for the
 *   name, and reduced to `customerName` here; **no email / phone /
 *   address ever leaves this function** (see {@link OrderOption}).
 *
 * BOUNDED: one page of {@link ORDERS_PAGE_SIZE}. `Link`-header cursor
 * pagination is intentionally not followed — callers report `truncated`
 * honestly and keep a manual / upstream-mapped order-id path.
 *
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/order#get-orders
 */
export async function ordersList(
  input: OrdersListInput,
): Promise<OrdersListResult> {
  const query = new URLSearchParams({
    status: "any",
    limit: String(ORDERS_PAGE_SIZE),
    order: "created_at desc",
    fields:
      "id,name,order_number,total_price,currency,financial_status,created_at,customer",
  });

  const response = await shopifyRequest<ShopifyOrdersListResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: "/orders.json",
    query,
    resourceForNotFound: "orders (list)",
  });

  const orders: OrderOption[] = [];
  for (const o of response.orders ?? []) {
    if (!o || typeof o.id !== "number") continue;
    const customerName = [o.customer?.first_name, o.customer?.last_name]
      .filter(
        (part): part is string =>
          typeof part === "string" && part.trim().length > 0,
      )
      .join(" ")
      .trim();
    orders.push({
      id: o.id,
      name: typeof o.name === "string" ? o.name : "",
      orderNumber: typeof o.order_number === "number" ? o.order_number : null,
      customerName,
      totalPrice: typeof o.total_price === "string" ? o.total_price : "",
      currency: typeof o.currency === "string" ? o.currency : "",
      financialStatus:
        typeof o.financial_status === "string" ? o.financial_status : "",
      createdAt: typeof o.created_at === "string" ? o.created_at : "",
    });
  }
  const truncated = orders.length === ORDERS_PAGE_SIZE;

  // Deterministic most-recent-first ordering of the page we got back,
  // independent of whether Shopify honored `order=created_at desc`.
  // Ties / missing timestamps fall back to descending id (Shopify ids
  // are monotonically increasing per shop).
  orders.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return b.id - a.id;
  });

  return { orders, truncated };
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
