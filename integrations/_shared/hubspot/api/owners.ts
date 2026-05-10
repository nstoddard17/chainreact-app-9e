import { hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `owners` resource wrappers — Slice 13 Commit 4.
 *
 * Endpoint:
 *   - GET /crm/v3/owners
 *     - Query: `limit` (max 100), `email` (filter), `after` (cursor).
 *
 * Owners are HubSpot user accounts in the portal — used as
 * `hubspot_owner_id` foreign keys on contacts / companies / deals /
 * tickets / engagements. The list endpoint is the standard discovery
 * surface for picking an owner id at workflow design time OR for
 * resolving an email → owner_id at run time.
 *
 * Note: HubSpot's owners endpoint lives at `/crm/v3/owners` (NOT
 * `/crm/v3/objects/owners`) — separate from the CRM object surface.
 * The wrapper uses `hubspotRequest` directly with the full path rather
 * than going through `crmPath` so the difference is explicit.
 */

export interface HubSpotOwner {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  userId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface OwnersListResponse {
  results: HubSpotOwner[];
  paging?: { next?: { after?: string; link?: string } };
}

export interface OwnersListInput {
  accessToken: string;
  /** Max 100 per HubSpot's docs. Wrapper clamps. */
  limit?: number;
  /** Optional email filter — server-side exact match. */
  email?: string;
  /** Pagination cursor. */
  after?: string;
}

export async function ownersList(
  input: OwnersListInput,
): Promise<OwnersListResponse> {
  const query = new URLSearchParams({
    limit: String(Math.min(input.limit ?? 100, 100)),
  });
  if (input.email) query.set("email", input.email);
  if (input.after) query.set("after", input.after);
  return hubspotRequest<OwnersListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/crm/v3/owners",
    query,
    resourceForNotFound: "owners",
  });
}
