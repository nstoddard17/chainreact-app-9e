import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `line_items` resource wrappers — Slice 13 Commit 4
 * (create / update) + HubSpot 2.1 (delete / search).
 *
 * Endpoints:
 *   - POST   /crm/v3/objects/line_items                   (create)
 *   - PATCH  /crm/v3/objects/line_items/{id}              (update)
 *   - DELETE /crm/v3/objects/line_items/{id}              (delete — HubSpot 2.1)
 *   - POST   /crm/v3/objects/line_items/search            (search — HubSpot 2.1)
 *
 * Line items represent a quantity of a product associated with a deal.
 * Required property at the schema layer: either `hs_product_id` (link
 * to an existing product) OR `name` (free-form line item), plus
 * `quantity` (string).
 *
 * Association to a deal is handled by
 * `_shared/hubspot/api/associations.ts:attachAssociations` after the
 * line item is created (line_item→deal type id = 20).
 *
 * Search shape mirrors `contacts.ts:contactsSearch` —
 * `filterGroups: [{ filters: [...] }]` (single-group AND), pagination
 * via `limit` + `after` cursor, `properties` projection.
 */

export interface HubSpotLineItem {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface LineItemsCreateInput {
  accessToken: string;
  properties: Record<string, string>;
}

export async function lineItemsCreate(
  input: LineItemsCreateInput,
): Promise<HubSpotLineItem> {
  return hubspotRequest<HubSpotLineItem>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/line_items"),
    body: { properties: input.properties },
    resourceForNotFound: "line item (create)",
  });
}

export interface LineItemsUpdateInput {
  accessToken: string;
  lineItemId: string;
  properties: Record<string, string>;
}

export async function lineItemsUpdate(
  input: LineItemsUpdateInput,
): Promise<HubSpotLineItem> {
  return hubspotRequest<HubSpotLineItem>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/line_items/${encodeURIComponent(input.lineItemId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `line item ${input.lineItemId}`,
  });
}

// ─── lineItemsDelete (HubSpot 2.1) ─────────────────────────────────────────

export interface LineItemsDeleteInput {
  accessToken: string;
  lineItemId: string;
}

/**
 * Delete a line item. HubSpot returns 204 No Content on success.
 * Replaying a DELETE against an already-deleted line item returns 404,
 * which `hubspotRequest` surfaces as the canonical `NotFoundError`.
 */
export async function lineItemsDelete(
  input: LineItemsDeleteInput,
): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: crmPath(`objects/line_items/${encodeURIComponent(input.lineItemId)}`),
    resourceForNotFound: `line item ${input.lineItemId}`,
  });
}

// ─── lineItemsGet ───────────────────────────────────────────────────────────

export interface LineItemsGetInput {
  accessToken: string;
  lineItemId: string;
  properties?: readonly string[];
}

/**
 * GET one line item by id. Mirrors `tickets.ts:ticketsGet` — optional
 * `properties` projection as a comma-separated query param. A deleted
 * (archived) line item returns 404 -> canonical `NotFoundError`.
 */
export async function lineItemsGet(
  input: LineItemsGetInput,
): Promise<HubSpotLineItem> {
  const query =
    input.properties && input.properties.length > 0
      ? new URLSearchParams({ properties: input.properties.join(",") })
      : undefined;
  return hubspotRequest<HubSpotLineItem>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/line_items/${encodeURIComponent(input.lineItemId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `line item ${input.lineItemId}`,
  });
}

// ─── lineItemsSearch (HubSpot 2.1) ─────────────────────────────────────────

export interface LineItemsSearchFilter {
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

export interface LineItemsSearchInput {
  accessToken: string;
  /** Maximum 100 per HubSpot's docs; wrapper clamps callers above 100. */
  limit?: number;
  /** Pagination cursor. */
  after?: string;
  /** Property names to return on each result row. Falls back to a small
   *  default set when the caller omits — HubSpot otherwise returns only
   *  the bare id + a tiny built-in set. */
  properties?: readonly string[];
  /** Single-group filter; all entries within the array are AND-ed. */
  filters?: readonly LineItemsSearchFilter[];
}

export interface LineItemsSearchResponse {
  total: number;
  results: HubSpotLineItem[];
  paging?: { next?: { after?: string; link?: string } };
}

export async function lineItemsSearch(
  input: LineItemsSearchInput,
): Promise<LineItemsSearchResponse> {
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
  return hubspotRequest<LineItemsSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/line_items/search"),
    body,
    resourceForNotFound: "line item (search)",
  });
}
