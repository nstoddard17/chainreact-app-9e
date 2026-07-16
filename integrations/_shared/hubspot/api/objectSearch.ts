import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 generic free-text object search — RESOLVERS-1.
 *
 * Endpoint:
 *   - POST /crm/v3/objects/{objectType}/search with a top-level `query`
 *     string. HubSpot searches the object's DEFAULT searchable properties
 *     server-side (e.g. contacts: names/email/phone/company; deals:
 *     dealname; tickets: subject/content). Omitting `query` returns the
 *     first page of all records — the picker's initial unfiltered load.
 *   Docs: https://developers.hubspot.com/docs/guides/api/crm/search
 *
 * Why a separate wrapper instead of extending the per-resource
 * `contactsSearch` / `dealsSearch` / … functions: those wrappers carry the
 * action handlers' filterGroups contract; the options resolvers need only
 * the query-shaped read across six object types, and one parametrized
 * wrapper avoids six copies of identical body construction while leaving
 * the handler-facing wrappers untouched.
 *
 * Scopes (all already in the HubSpot manifest): `crm.objects.contacts.read`,
 * `crm.objects.companies.read`, `crm.objects.deals.read`,
 * `crm.objects.products.read`, `crm.objects.line_items.read`; tickets ride
 * the broad `tickets` scope (no granular ticket object scope in the
 * manifest, matching the ticket action wrappers).
 *
 * Read-only from the caller's perspective (search is HubSpot's documented
 * POST-shaped read; nothing is mutated). Search API is rate-limited harder
 * than plain reads (currently 5 req/s per token per HubSpot's docs) —
 * resolvers issue exactly one bounded call per keystroke-debounced request.
 */

/** One search hit — id + the explicitly-requested property map. */
export interface HubSpotSearchRecord {
  id: string;
  properties: Record<string, string | null>;
}

export interface ObjectsSearchByQueryResponse {
  total: number;
  results: HubSpotSearchRecord[];
  paging?: { next?: { after?: string; link?: string } };
}

export interface ObjectsSearchByQueryInput {
  accessToken: string;
  /** CRM object type path segment — e.g. "contacts", "line_items". */
  objectType:
    | "contacts"
    | "companies"
    | "deals"
    | "tickets"
    | "products"
    | "line_items";
  /**
   * Free-text search string. Omit (or pass empty) for the unfiltered
   * first page — HubSpot returns all records, newest first.
   */
  query?: string;
  /** Maximum 100 per HubSpot's docs; wrapper clamps callers above 100. */
  limit?: number;
  /**
   * Property names to return on each result row. Callers always pass an
   * explicit, minimal display-property list so the response never carries
   * more record data than the picker needs.
   */
  properties: readonly string[];
}

export async function objectsSearchByQuery(
  input: ObjectsSearchByQueryInput,
): Promise<ObjectsSearchByQueryResponse> {
  const body: Record<string, unknown> = {
    limit: Math.min(input.limit ?? 50, 100),
    properties: [...input.properties],
  };
  if (typeof input.query === "string" && input.query.length > 0) {
    body.query = input.query;
  }
  return hubspotRequest<ObjectsSearchByQueryResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath(`objects/${encodeURIComponent(input.objectType)}/search`),
    body,
    resourceForNotFound: `${input.objectType} (search)`,
  });
}
