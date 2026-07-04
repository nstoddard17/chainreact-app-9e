import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `contacts` resource wrappers — Slice 13 Commit 3.
 *
 * Endpoints covered:
 *   - POST   /crm/v3/objects/contacts                   (create)
 *   - PATCH  /crm/v3/objects/contacts/{id}              (update)
 *   - GET    /crm/v3/objects/contacts/{id}              (read by id)
 *   - POST   /crm/v3/objects/contacts/search            (search)
 *
 * Body shape:
 *   `properties` is a flat `Record<string, string>` per HubSpot's CRM
 *   v3 wire format. Numeric / boolean property values are accepted as
 *   strings by HubSpot's server (consistent with V1 behavior). Typing
 *   as string-only here forces workflow authors to be explicit about
 *   coercion at the schema layer.
 *
 * Search shape:
 *   HubSpot's search endpoint uses `filterGroups` (NOT top-level
 *   `filters`). V1's `getContacts.ts` posts a top-level `filters`
 *   array — which HubSpot ignores. V2 fixes this during the port.
 */

export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface ContactsSearchResponse {
  total: number;
  results: HubSpotContact[];
  paging?: { next?: { after?: string; link?: string } };
}

// ─── contactsCreate ─────────────────────────────────────────────────────────

export interface ContactsCreateInput {
  accessToken: string;
  /** `properties` map. `email` MUST be present per Slice 13 schema. */
  properties: Record<string, string>;
}

export async function contactsCreate(
  input: ContactsCreateInput,
): Promise<HubSpotContact> {
  return hubspotRequest<HubSpotContact>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/contacts"),
    body: { properties: input.properties },
    resourceForNotFound: "contact (create)",
  });
}

// ─── contactsUpdate ─────────────────────────────────────────────────────────

export interface ContactsUpdateInput {
  accessToken: string;
  contactId: string;
  properties: Record<string, string>;
}

export async function contactsUpdate(
  input: ContactsUpdateInput,
): Promise<HubSpotContact> {
  return hubspotRequest<HubSpotContact>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/contacts/${encodeURIComponent(input.contactId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `contact ${input.contactId}`,
  });
}

// ─── contactsGet ────────────────────────────────────────────────────────────

export interface ContactsGetInput {
  accessToken: string;
  contactId: string;
  properties?: readonly string[];
}

export async function contactsGet(
  input: ContactsGetInput,
): Promise<HubSpotContact> {
  const query = input.properties && input.properties.length > 0
    ? new URLSearchParams({ properties: input.properties.join(",") })
    : undefined;
  return hubspotRequest<HubSpotContact>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`objects/contacts/${encodeURIComponent(input.contactId)}`),
    ...(query ? { query } : {}),
    resourceForNotFound: `contact ${input.contactId}`,
  });
}

// ─── contactsArchive ────────────────────────────────────────────────────────

export interface ContactsArchiveInput {
  accessToken: string;
  contactId: string;
}

/**
 * Archive (soft-delete) a contact: `DELETE /crm/v3/objects/contacts/{id}`.
 * HubSpot moves the contact to the recycle bin (restorable in-app for 90
 * days) and returns 204 No Content. Replaying against an already-archived
 * contact returns 404 -> canonical `NotFoundError`.
 *
 * No registered workflow action exposes this today — it backs the
 * action-smoke staging teardown (the seeded list-membership contact), so
 * smoke runs stop accumulating marked contacts on the throwaway portal.
 */
export async function contactsArchive(
  input: ContactsArchiveInput,
): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: crmPath(`objects/contacts/${encodeURIComponent(input.contactId)}`),
    resourceForNotFound: `contact ${input.contactId}`,
  });
}

// ─── contactsSearch ─────────────────────────────────────────────────────────

export interface ContactsSearchFilter {
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

export interface ContactsSearchInput {
  accessToken: string;
  /** Maximum 100 per HubSpot's docs; wrapper clamps callers above 100. */
  limit?: number;
  /** Pagination cursor. */
  after?: string;
  /**
   * Property names to return on each result row. HubSpot returns a
   * small default set when omitted — Slice 13 callers always pass an
   * explicit list so the response shape is predictable.
   */
  properties?: readonly string[];
  /**
   * Single filter group: all filters within the array are AND-ed
   * together. Multiple filter groups (top-level `filterGroups`) would
   * be OR-ed — Slice 13 Batch 1 wrappers only need single-group AND.
   * Pass an empty array for "return everything" (no filter).
   */
  filters?: readonly ContactsSearchFilter[];
}

export async function contactsSearch(
  input: ContactsSearchInput,
): Promise<ContactsSearchResponse> {
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
  return hubspotRequest<ContactsSearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/contacts/search"),
    body,
    resourceForNotFound: "contact (search)",
  });
}

/**
 * Helper: deterministic search-by-email. Returns the matching
 * `HubSpotContact` or null when no contact has the given email.
 *
 * Slice 13 Batch 1 uses this in `create_contact`'s duplicate-handling
 * recovery path — replaces V1's brittle regex extraction
 * `/Existing ID: (\d+)/` from the error message. The search endpoint
 * is the documented, deterministic way to resolve "I got a 409, find
 * me the existing contact id."
 */
export async function findContactByEmail(input: {
  accessToken: string;
  email: string;
  properties?: readonly string[];
}): Promise<HubSpotContact | null> {
  const res = await contactsSearch({
    accessToken: input.accessToken,
    limit: 1,
    filters: [{ propertyName: "email", operator: "EQ", value: input.email }],
    ...(input.properties ? { properties: input.properties } : {}),
  });
  return res.results[0] ?? null;
}
