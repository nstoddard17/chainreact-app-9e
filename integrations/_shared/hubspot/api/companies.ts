import { crmPath, hubspotRequest } from "./_request";
import type { ContactsSearchFilter, ContactsSearchResponse } from "./contacts";

/**
 * HubSpot CRM v3 `companies` resource wrappers — Slice 13 Commit 3.
 *
 * Endpoints covered:
 *   - POST   /crm/v3/objects/companies                  (create)
 *   - PATCH  /crm/v3/objects/companies/{id}             (update)
 *   - GET    /crm/v3/objects/companies/{id}             (read by id)
 *   - POST   /crm/v3/objects/companies/search           (search)
 *
 * Reuses `ContactsSearchFilter` / `ContactsSearchResponse` types from
 * `contacts.ts` — HubSpot's search API shape is identical across
 * standard CRM objects (`contacts`, `companies`, `deals`, `tickets`).
 * The shared filter type collapses what would otherwise be 4 nearly-
 * identical type definitions.
 */

export interface HubSpotCompany {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export type CompaniesSearchResponse = Omit<
  ContactsSearchResponse,
  "results"
> & {
  results: HubSpotCompany[];
};

// ─── companiesCreate ────────────────────────────────────────────────────────

export interface CompaniesCreateInput {
  accessToken: string;
  /** `name` SHOULD be present per Slice 13 schema; HubSpot allows missing. */
  properties: Record<string, string>;
}

export async function companiesCreate(
  input: CompaniesCreateInput,
): Promise<HubSpotCompany> {
  return hubspotRequest<HubSpotCompany>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/companies"),
    body: { properties: input.properties },
    resourceForNotFound: "company (create)",
  });
}

// ─── companiesUpdate ────────────────────────────────────────────────────────

export interface CompaniesUpdateInput {
  accessToken: string;
  companyId: string;
  properties: Record<string, string>;
}

export async function companiesUpdate(
  input: CompaniesUpdateInput,
): Promise<HubSpotCompany> {
  return hubspotRequest<HubSpotCompany>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/companies/${encodeURIComponent(input.companyId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `company ${input.companyId}`,
  });
}

// ─── companiesGet ───────────────────────────────────────────────────────────

export interface CompaniesGetInput {
  accessToken: string;
  companyId: string;
  properties?: readonly string[];
}

export async function companiesGet(
  input: CompaniesGetInput,
): Promise<HubSpotCompany> {
  const query =
    input.properties && input.properties.length > 0
      ? new URLSearchParams({ properties: input.properties.join(",") })
      : undefined;
  return hubspotRequest<HubSpotCompany>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/companies/${encodeURIComponent(input.companyId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `company ${input.companyId}`,
  });
}

// ─── companiesSearch ────────────────────────────────────────────────────────

export interface CompaniesSearchInput {
  accessToken: string;
  limit?: number;
  after?: string;
  properties?: readonly string[];
  filters?: readonly ContactsSearchFilter[];
}

export async function companiesSearch(
  input: CompaniesSearchInput,
): Promise<CompaniesSearchResponse> {
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
  return hubspotRequest<CompaniesSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/companies/search"),
    body,
    resourceForNotFound: "company (search)",
  });
}

/**
 * Helper: deterministic search-by-domain. Returns the matching company
 * or null. Used by `create_company`'s duplicate-handling recovery path
 * (same shape as `findContactByEmail`).
 */
export async function findCompanyByDomain(input: {
  accessToken: string;
  domain: string;
  properties?: readonly string[];
}): Promise<HubSpotCompany | null> {
  const res = await companiesSearch({
    accessToken: input.accessToken,
    limit: 1,
    filters: [{ propertyName: "domain", operator: "EQ", value: input.domain }],
    ...(input.properties ? { properties: input.properties } : {}),
  });
  return res.results[0] ?? null;
}
