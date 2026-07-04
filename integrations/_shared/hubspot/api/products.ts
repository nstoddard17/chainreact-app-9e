import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `products` resource wrappers — Slice 13 Commit 4
 * (create / update) + HubSpot 2.1 (search).
 *
 * Endpoints:
 *   - POST  /crm/v3/objects/products                     (create)
 *   - PATCH /crm/v3/objects/products/{id}                (update)
 *   - POST  /crm/v3/objects/products/search              (search — HubSpot 2.1)
 *
 * Required property at the schema layer: `name` (V1 enforces; HubSpot
 * accepts empty but enforcing at the schema gives clean fail-fast
 * behavior).
 *
 * Search shape mirrors `contacts.ts:contactsSearch` and
 * `lineItems.ts:lineItemsSearch` — `filterGroups: [{ filters: [...] }]`
 * (single-group AND), pagination via `limit` + `after` cursor,
 * `properties` projection.
 */

export interface HubSpotProduct {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface ProductsCreateInput {
  accessToken: string;
  properties: Record<string, string>;
}

export async function productsCreate(
  input: ProductsCreateInput,
): Promise<HubSpotProduct> {
  return hubspotRequest<HubSpotProduct>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/products"),
    body: { properties: input.properties },
    resourceForNotFound: "product (create)",
  });
}

export interface ProductsUpdateInput {
  accessToken: string;
  productId: string;
  properties: Record<string, string>;
}

export async function productsUpdate(
  input: ProductsUpdateInput,
): Promise<HubSpotProduct> {
  return hubspotRequest<HubSpotProduct>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/products/${encodeURIComponent(input.productId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `product ${input.productId}`,
  });
}

// ─── productsGet ────────────────────────────────────────────────────────────

export interface ProductsGetInput {
  accessToken: string;
  productId: string;
  properties?: readonly string[];
}

/**
 * GET one product by id. Mirrors `tickets.ts:ticketsGet` — optional
 * `properties` projection as a comma-separated query param.
 */
export async function productsGet(
  input: ProductsGetInput,
): Promise<HubSpotProduct> {
  const query =
    input.properties && input.properties.length > 0
      ? new URLSearchParams({ properties: input.properties.join(",") })
      : undefined;
  return hubspotRequest<HubSpotProduct>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/products/${encodeURIComponent(input.productId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `product ${input.productId}`,
  });
}

// ─── productsSearch (HubSpot 2.1) ───────────────────────────────────────────

export interface ProductsSearchFilter {
  propertyName: string;
  operator:
    | "EQ"
    | "NEQ"
    | "GT"
    | "GTE"
    | "LT"
    | "LTE"
    | "BETWEEN"
    | "IN"
    | "NOT_IN"
    | "HAS_PROPERTY"
    | "NOT_HAS_PROPERTY"
    | "CONTAINS_TOKEN";
  value?: string;
  values?: readonly string[];
}

export interface ProductsSearchInput {
  accessToken: string;
  /** Maximum 100 per HubSpot's docs; wrapper clamps callers above 100. */
  limit?: number;
  /** Pagination cursor. */
  after?: string;
  /** Property names to return on each result row. */
  properties?: readonly string[];
  /** Single-group filter; all entries within the array are AND-ed. */
  filters?: readonly ProductsSearchFilter[];
}

export interface ProductsSearchResponse {
  total: number;
  results: HubSpotProduct[];
  paging?: { next?: { after?: string; link?: string } };
}

export async function productsSearch(
  input: ProductsSearchInput,
): Promise<ProductsSearchResponse> {
  const body: Record<string, unknown> = {
    limit: Math.min(input.limit ?? 100, 100),
  };
  if (input.properties && input.properties.length > 0) {
    body.properties = [...input.properties];
  }
  if (input.after) {
    body.after = input.after;
  }
  if (input.filters && input.filters.length > 0) {
    body.filterGroups = [{ filters: [...input.filters] }];
  }
  return hubspotRequest<ProductsSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/products/search"),
    body,
    resourceForNotFound: "product (search)",
  });
}
