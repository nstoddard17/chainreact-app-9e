import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `lists` resource wrappers — Slice 13 Commit 3.
 *
 * Slice 13 Batch 1 only needs the `add-by-email` membership operation
 * for `add_contact_to_list`. Other list endpoints (create list, list
 * lists, remove membership) are deferred.
 *
 * V1 ([`hubspot.ts:566-679`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L566))
 * implements `add_contact_to_list` as a two-step flow:
 *   1. Search contact by email → resolve contactId.
 *   2. Add `[contactId]` to the list's memberships.
 *
 * V2 originally tried to collapse this to a single POST with
 * `recordIdOrEmails` — that body/method belongs to the LEGACY v1 lists
 * API and the v3 endpoint answers HTTP 405 (found live, 2026-07-04
 * action smoke). The v3 memberships contract is PUT + a raw record-id
 * array with NO email variant, so V1's two-step flow is the correct
 * shape after all: handlers resolve email -> contactId via
 * `findContactByEmail`, then call `listMembershipsAdd` /
 * `listMembershipsRemove`.
 */

export interface ListMembershipsMutateInput {
  accessToken: string;
  listId: string;
  /** CRM record ids (contact ids for contact lists). NEVER emails. */
  recordIds: readonly string[];
}

/**
 * Add records to a MANUAL list: `PUT /crm/v3/lists/{listId}/memberships/add`.
 *
 * PRODUCTION BUG FIX (found live, 2026-07-04 action smoke): the original
 * wrapper POSTed `{ recordIdOrEmails: [email] }` — that body shape belongs to
 * the LEGACY v1 lists API. HubSpot's v3 memberships endpoints are PUT (POST
 * returns a plain HTTP 405) and take a RAW JSON ARRAY of record ids; v3 has
 * no email variant at all, so callers resolve email -> contactId first (the
 * handlers use the same deterministic `findContactByEmail` lookup the
 * create_contact 409 path uses). Success returns 204 No Content — idempotent
 * (re-adding an existing member is a no-op).
 *
 * DYNAMIC-list constraint: HubSpot rejects manual membership writes on
 * dynamic lists with a 400 `VALIDATION_ERROR`; the wrapper surfaces the
 * message verbatim via `hubspotRequest`.
 */
export async function listMembershipsAdd(
  input: ListMembershipsMutateInput,
): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "PUT",
    path: crmPath(`lists/${encodeURIComponent(input.listId)}/memberships/add`),
    body: [...input.recordIds],
    resourceForNotFound: `list ${input.listId}`,
  });
}

/**
 * Remove records from a MANUAL list:
 * `PUT /crm/v3/lists/{listId}/memberships/remove`. Same v3 contract as
 * `listMembershipsAdd` (PUT + raw record-id array; 204 on success;
 * removing a non-member is a no-op). See the add wrapper for the
 * production-bug history and the dynamic-list constraint.
 */
export async function listMembershipsRemove(
  input: ListMembershipsMutateInput,
): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "PUT",
    path: crmPath(
      `lists/${encodeURIComponent(input.listId)}/memberships/remove`,
    ),
    body: [...input.recordIds],
    resourceForNotFound: `list ${input.listId}`,
  });
}

// ─── listMembershipsGet ─────────────────────────────────────────────────────

export interface ListMembershipRecord {
  recordId: string;
  membershipTimestamp?: string;
}

export interface ListMembershipsGetResponse {
  results?: ListMembershipRecord[];
  paging?: { next?: { after?: string } };
}

export interface ListMembershipsGetInput {
  accessToken: string;
  listId: string;
  /** Page size; HubSpot caps at 250 for the memberships endpoint. */
  limit?: number;
  after?: string;
}

/**
 * GET one page of a list's memberships:
 * `GET /crm/v3/lists/{listId}/memberships`. Returns the member record
 * ids (contact ids for contact lists). Read-only; a missing list 404s
 * as the canonical `NotFoundError`.
 */
export async function listMembershipsGet(
  input: ListMembershipsGetInput,
): Promise<ListMembershipsGetResponse> {
  const query = new URLSearchParams({
    limit: String(Math.min(input.limit ?? 250, 250)),
  });
  if (input.after) query.set("after", input.after);
  return hubspotRequest<ListMembershipsGetResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`lists/${encodeURIComponent(input.listId)}/memberships`),
    query,
    resourceForNotFound: `list ${input.listId}`,
  });
}

// ─── listsCreate / listsDelete ──────────────────────────────────────────────

export interface ListsCreateInput {
  accessToken: string;
  name: string;
  /** Object type the list is over — `"0-1"` = contacts. */
  objectTypeId: string;
  /** `MANUAL` (static) or `DYNAMIC`. Smoke staging always uses MANUAL. */
  processingType: "MANUAL" | "DYNAMIC";
}

export interface ListsCreateResponse {
  list?: { listId: string; name?: string | null };
}

/**
 * Create a v3 list: `POST /crm/v3/lists`. Scope: `crm.lists.write`
 * (already in the manifest). No registered workflow action exposes
 * list creation today — this backs the action-smoke staging path
 * (a throwaway MANUAL smoke list), torn down via `listsDelete`.
 */
export async function listsCreate(
  input: ListsCreateInput,
): Promise<ListsCreateResponse> {
  return hubspotRequest<ListsCreateResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("lists/"),
    body: {
      name: input.name,
      objectTypeId: input.objectTypeId,
      processingType: input.processingType,
    },
    resourceForNotFound: "list (create)",
  });
}

export interface ListsDeleteInput {
  accessToken: string;
  listId: string;
}

/**
 * Delete a v3 list: `DELETE /crm/v3/lists/{listId}` (204 No Content;
 * HubSpot keeps deleted lists restorable in-app for 90 days). Backs
 * the smoke staging teardown only.
 */
export async function listsDelete(input: ListsDeleteInput): Promise<void> {
  await hubspotRequest<void>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: crmPath(`lists/${encodeURIComponent(input.listId)}`),
    resourceForNotFound: `list ${input.listId}`,
  });
}

// ─── searchLists (Slice 3.HUBSPOT-2) ───────────────────────────────────────

export interface HubSpotListSummary {
  listId: string;
  name?: string | null;
  /**
   * `MANUAL` for static lists (membership controlled by API/UI) vs
   * `DYNAMIC` for HubSpot's rule-engine-controlled lists. Surfaced as
   * the `description` on the resolver so workflow authors don't
   * accidentally pick a dynamic list (the membership add/remove
   * actions reject those with a 400).
   */
  processingType?: string | null;
  /** Object type the list is over — typically `"0-1"` (contacts). */
  objectTypeId?: string | null;
  /** Approximate member count when HubSpot returns it. */
  additionalProperties?: { hs_list_size?: string | null } | null;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchListsResponse {
  /** HubSpot v3 lists search returns the list summaries under `lists`. */
  lists?: HubSpotListSummary[];
  /** Pagination cursor for the next page (offset-based; passed back in body). */
  offset?: number | null;
  total?: number | null;
  hasMore?: boolean | null;
}

export interface SearchListsInput {
  accessToken: string;
  /** Page size. HubSpot caps at 500 per docs; we pin a sane 200 default. */
  count?: number;
  /** Offset cursor (numeric; HubSpot v3 lists search is offset-based, not cursor-based). */
  offset?: number;
}

/**
 * List discovery for HubSpot v3 lists.
 *
 * Endpoint: POST /crm/v3/lists/search — HubSpot's v3 lists discovery
 * surface. The body is an empty filter object that returns every
 * non-archived list visible to the access token; `processingType`
 * (`MANUAL` / `DYNAMIC`) comes back inline so the resolver can echo
 * it as the option description.
 *
 * Scope: `crm.lists.read` (already in the manifest).
 *
 * Pagination uses HubSpot's `offset` (not the v3 object-search-style
 * `after` cursor). v1 of the resolver paginates over a single page
 * of 200; `hasMore` propagates so the renderer can hint that further
 * results exist.
 */
export async function searchLists(
  input: SearchListsInput,
): Promise<SearchListsResponse> {
  const body: Record<string, unknown> = {
    count: Math.min(input.count ?? 200, 500),
  };
  if (typeof input.offset === "number" && input.offset > 0) {
    body.offset = input.offset;
  }
  return hubspotRequest<SearchListsResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("lists/search"),
    body,
    resourceForNotFound: "lists",
  });
}
