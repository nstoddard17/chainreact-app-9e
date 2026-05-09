import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/customers` API wrappers.
 *
 * Per-resource thin wrapper layer over `stripeRequest`. Body
 * construction lives here (typed shape per endpoint); HTTP semantics
 * + auth + version + form-encoding live in `stripeRequest`.
 *
 * Output types match Stripe's REST response shape literally — handlers
 * map the snake_case wire shape to camelCase output keys. Keeping the
 * wrapper in lockstep with Stripe's response means a future API
 * version bump only touches this file (not every handler).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface StripeCustomer {
  id: string;
  object: "customer";
  email: string | null;
  name: string | null;
  phone: string | null;
  description: string | null;
  created: number;
  currency: string | null;
  balance: number;
  delinquent: boolean | null;
  address: Record<string, unknown> | null;
  shipping: Record<string, unknown> | null;
  tax_exempt: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface StripeCustomerListResponse {
  object: "list";
  data: StripeCustomer[];
  has_more: boolean;
  url: string;
}

// ─── customersCreate ────────────────────────────────────────────────────────

export interface CustomersCreateInput {
  accessToken: string;
  email: string;
  name?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export async function customersCreate(
  input: CustomersCreateInput,
): Promise<StripeCustomer> {
  const body: Record<string, unknown> = { email: input.email };
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.metadata !== undefined) body.metadata = input.metadata;

  return stripeRequest<StripeCustomer>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/customers",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "customer (create)",
  });
}

// ─── customersUpdate ────────────────────────────────────────────────────────

export interface CustomersUpdateInput {
  accessToken: string;
  customerId: string;
  email?: string;
  name?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export async function customersUpdate(
  input: CustomersUpdateInput,
): Promise<StripeCustomer> {
  const body: Record<string, unknown> = {};
  if (input.email !== undefined) body.email = input.email;
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.metadata !== undefined) body.metadata = input.metadata;

  return stripeRequest<StripeCustomer>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v1/customers/${encodeURIComponent(input.customerId)}`,
    body,
    resourceForNotFound: `customer ${input.customerId}`,
  });
}

// ─── customersGet ───────────────────────────────────────────────────────────

export interface CustomersGetInput {
  accessToken: string;
  customerId: string;
}

export async function customersGet(
  input: CustomersGetInput,
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/customers/${encodeURIComponent(input.customerId)}`,
    resourceForNotFound: `customer ${input.customerId}`,
  });
}

// ─── customersList (used by find_customer's email lookup) ───────────────────

export interface CustomersListInput {
  accessToken: string;
  email?: string;
  limit?: number;
}

export async function customersList(
  input: CustomersListInput,
): Promise<StripeCustomerListResponse> {
  const query = new URLSearchParams();
  if (input.email !== undefined) query.set("email", input.email);
  if (input.limit !== undefined) query.set("limit", String(input.limit));

  return stripeRequest<StripeCustomerListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/customers",
    query,
    resourceForNotFound: "customer (list)",
  });
}
