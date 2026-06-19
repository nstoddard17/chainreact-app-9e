import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { hubspotApiBase, HUBSPOT_CRM_VERSION } from "@/integrations/_shared/hubspot/api/_base";
import { NotFoundError, surfaceHubSpotError } from "@/integrations/_shared/hubspot/errors";
import type { ContactsSearchFilter } from "@/integrations/_shared/hubspot/api/contacts";

/**
 * Bounded, READ-ONLY, COUNT-ONLY HubSpot CRM reader for the analytics source
 * (Slice ANALYTICS-SOURCES-HUBSPOT-1).
 *
 * PRIVACY: this deliberately does NOT reuse the workflow `contactsSearch` /
 * `dealsSearch` / `companiesSearch` / `ticketsSearch` wrappers — those return full
 * record `results[]` (properties: email / name / dealname / amount …). This reader
 * issues the CRM v3 Search request with `properties: []` + `limit: 1` and reads ONLY
 * the response's `total` integer. No CRM record's properties — names, emails, phone
 * numbers, company names, deal names, amounts, notes, owners, associations, ids — are
 * ever read, returned, or cached. The single (defaulted) record HubSpot returns under
 * `limit: 1` is never touched.
 *
 * No raw HubSpot query comes from widget config: the object type is pinned to a fixed
 * literal and the filters are server-side constants (a `createdate` window or a closed
 * /closed-won boolean), never a caller-supplied filter document.
 *
 * Auth: the access token is threaded in by `refreshAndRetry`'s `apiCall` callback
 * (HubSpot is account-shared + oauth_with_refresh). A 401 throws
 * `Unauthorized401Error` so `refreshAndRetry` refreshes + retries once; a 429 throws
 * {@link HubSpotRateLimitError}; anything else surfaces a generic, body-sanitized
 * Error. The adapter maps all of these to typed, leak-free AnalyticsSourceError codes.
 */

/** A HubSpot CRM standard object the analytics source can count. */
export type CrmObjectType = "contacts" | "deals" | "companies" | "tickets";

/** Search filter shape — reuses the shared CRM search filter type (AND-ed group). */
export type SearchFilter = ContactsSearchFilter;

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class HubSpotRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotRateLimitError";
  }
}

export interface SearchTotalInput {
  /** Decrypted access token (threaded by refreshAndRetry). */
  accessToken: string;
  objectType: CrmObjectType;
  /** AND-ed filters; omitted/empty = count every record of the object type. */
  filters?: readonly SearchFilter[];
}

/**
 * Count of objects matching `filters` via `POST /crm/v3/objects/{type}/search`.
 * Reads ONLY `total` — `properties: []` + `limit: 1` keep the response record-free
 * for our purposes (the count is exact regardless of `limit`; HubSpot returns the
 * full match count in `total`). No record data is read.
 */
export async function searchTotal(input: SearchTotalInput): Promise<number> {
  const url = `${hubspotApiBase()}/crm/${HUBSPOT_CRM_VERSION}/objects/${input.objectType}/search`;
  const body: Record<string, unknown> = { limit: 1, properties: [] };
  if (input.filters && input.filters.length > 0) {
    body.filterGroups = [{ filters: [...input.filters] }];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(`HubSpot search ${input.objectType} returned HTTP 401`);
  }
  if (res.status === 429) {
    throw new HubSpotRateLimitError(`HubSpot search ${input.objectType} rate-limited (HTTP 429)`);
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(`${input.objectType} (search)`, surfaceHubSpotError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HubSpot search ${input.objectType} failed: ${surfaceHubSpotError(text, res.status)}`,
    );
  }

  // Read ONLY the count. `results`/`paging` are intentionally ignored (never read).
  const data = (await res.json()) as { total?: unknown };
  return typeof data.total === "number" ? data.total : 0;
}

/** A `createdate` window filter ([startMs, endMs)) for the count-over-time series. */
export function createdInRangeFilters(startMs: number, endMs: number): SearchFilter[] {
  return [
    { propertyName: "createdate", operator: "GTE", value: String(startMs) },
    { propertyName: "createdate", operator: "LT", value: String(endMs) },
  ];
}
