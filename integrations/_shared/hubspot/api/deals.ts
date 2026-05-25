import { crmPath, hubspotRequest } from "./_request";
import type { ContactsSearchFilter } from "./contacts";

/**
 * HubSpot CRM v3 `deals` resource wrappers — Slice 13 Commit 3.
 *
 * Endpoints covered:
 *   - POST   /crm/v3/objects/deals                      (create)
 *   - PATCH  /crm/v3/objects/deals/{id}                 (update)
 *   - GET    /crm/v3/objects/deals/{id}                 (read by id)
 *   - POST   /crm/v3/objects/deals/search               (search)
 *
 * Required properties per V1 `createHubSpotDeal`: `dealname`,
 * `dealstage`. `pipeline` is optional but recommended (HubSpot defaults
 * to "default" pipeline when omitted).
 */

export interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface DealsSearchResponse {
  total: number;
  results: HubSpotDeal[];
  paging?: { next?: { after?: string; link?: string } };
}

// ─── dealsCreate ────────────────────────────────────────────────────────────

export interface DealsCreateInput {
  accessToken: string;
  /** `dealname` + `dealstage` required at the schema layer. */
  properties: Record<string, string>;
}

export async function dealsCreate(
  input: DealsCreateInput,
): Promise<HubSpotDeal> {
  return hubspotRequest<HubSpotDeal>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/deals"),
    body: { properties: input.properties },
    resourceForNotFound: "deal (create)",
  });
}

// ─── dealsUpdate ────────────────────────────────────────────────────────────

export interface DealsUpdateInput {
  accessToken: string;
  dealId: string;
  properties: Record<string, string>;
}

export async function dealsUpdate(
  input: DealsUpdateInput,
): Promise<HubSpotDeal> {
  return hubspotRequest<HubSpotDeal>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/deals/${encodeURIComponent(input.dealId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `deal ${input.dealId}`,
  });
}

// ─── dealsGet ───────────────────────────────────────────────────────────────

export interface DealsGetInput {
  accessToken: string;
  dealId: string;
  properties?: readonly string[];
}

export async function dealsGet(input: DealsGetInput): Promise<HubSpotDeal> {
  const query =
    input.properties && input.properties.length > 0
      ? new URLSearchParams({ properties: input.properties.join(",") })
      : undefined;
  return hubspotRequest<HubSpotDeal>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/deals/${encodeURIComponent(input.dealId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `deal ${input.dealId}`,
  });
}

// ─── dealsSearch ────────────────────────────────────────────────────────────

export interface DealsSearchInput {
  accessToken: string;
  limit?: number;
  after?: string;
  properties?: readonly string[];
  filters?: readonly ContactsSearchFilter[];
}

export async function dealsSearch(
  input: DealsSearchInput,
): Promise<DealsSearchResponse> {
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
  return hubspotRequest<DealsSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/deals/search"),
    body,
    resourceForNotFound: "deal (search)",
  });
}
