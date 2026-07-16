import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/customers` resource wrappers.
 *
 * Slice 12 Commit 3. Covers `create_customer` and `update_customer`.
 * RESOLVERS-1 adds the read-only `customersList` (GET /customers.json)
 * backing the `shopify:customers` options resolver.
 *
 * The `send_email_welcome` field is Shopify's REST equivalent of the
 * Q11 `send_welcome_email` consent gate from the action schema.
 * Mapped at the wrapper boundary (the action's required boolean lands
 * in this exact REST field).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyCustomer {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  tags?: string;
  note?: string | null;
  accepts_marketing?: boolean;
  total_spent?: string;
  orders_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyCustomerResponse {
  customer: ShopifyCustomer;
}

// ─── customersList ──────────────────────────────────────────────────────────

export interface CustomersListInput {
  shopDomain: string;
  accessToken: string;
  /** Page size, 1..250 (Shopify max). Callers pass an explicit bound. */
  limit: number;
}

interface ShopifyCustomersListResponse {
  customers: ShopifyCustomer[];
}

/**
 * One bounded page of customers — GET `/customers.json?limit=N`.
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/customer#get-customers
 *
 * RESOLVERS-1: read path for the `shopify:customers` options resolver.
 * No cursor / `page_info` pagination is exposed — the resolver is
 * single-page by design (V2 posture: bounded page + local q filter).
 */
export async function customersList(
  input: CustomersListInput,
): Promise<ShopifyCustomer[]> {
  const query = new URLSearchParams();
  query.append("limit", String(input.limit));

  const response = await shopifyRequest<ShopifyCustomersListResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: "/customers.json",
    query,
    resourceForNotFound: "customers (list)",
  });
  return response.customers;
}

// ─── customersCreate ────────────────────────────────────────────────────────

export interface CustomersCreateInput {
  shopDomain: string;
  accessToken: string;
  email: string;
  /** Q11 consent gate — required at the action schema. */
  send_email_welcome: boolean;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string;
}

export async function customersCreate(
  input: CustomersCreateInput,
): Promise<ShopifyCustomer> {
  const customer: Record<string, unknown> = {
    email: input.email,
    send_email_welcome: input.send_email_welcome,
  };
  if (input.first_name !== undefined) customer.first_name = input.first_name;
  if (input.last_name !== undefined) customer.last_name = input.last_name;
  if (input.phone !== undefined) customer.phone = input.phone;
  if (input.tags !== undefined) customer.tags = input.tags;

  const response = await shopifyRequest<ShopifyCustomerResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/customers.json",
    body: { customer },
    resourceForNotFound: "customer (create)",
  });
  return response.customer;
}

// ─── customersUpdate ────────────────────────────────────────────────────────

export interface CustomersUpdateInput {
  shopDomain: string;
  accessToken: string;
  customerId: string | number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string;
  note?: string;
  accepts_marketing?: boolean;
}

export async function customersUpdate(
  input: CustomersUpdateInput,
): Promise<ShopifyCustomer> {
  const customer: Record<string, unknown> = { id: Number(input.customerId) };
  if (input.email !== undefined) customer.email = input.email;
  if (input.first_name !== undefined) customer.first_name = input.first_name;
  if (input.last_name !== undefined) customer.last_name = input.last_name;
  if (input.phone !== undefined) customer.phone = input.phone;
  if (input.tags !== undefined) customer.tags = input.tags;
  if (input.note !== undefined) customer.note = input.note;
  if (input.accepts_marketing !== undefined) {
    customer.accepts_marketing = input.accepts_marketing;
  }

  const response = await shopifyRequest<ShopifyCustomerResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "PUT",
    path: `/customers/${encodeURIComponent(String(input.customerId))}.json`,
    body: { customer },
    resourceForNotFound: `customer ${input.customerId}`,
  });
  return response.customer;
}
