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
 *   2. POST `/crm/v3/lists/{listId}/memberships/add` with `[contactId]`.
 *
 * V2 collapses to a single call using HubSpot's
 * `POST /crm/v3/lists/{listId}/memberships/add` which accepts either
 * `vidOrIds` (contact ids) OR `recordIdOrEmails` (mixed array). Slice
 * 13 uses the `recordIdOrEmails` variant with the email directly — no
 * separate contact-search round trip required (HubSpot resolves
 * email->contactId server-side).
 *
 * Returns the `recordIdsAdded` array so the action handler can include
 * the resolved contact id in its output.
 */

export interface ListMembershipAddResponse {
  recordIdsAdded?: string[];
  recordIdsDiscarded?: string[];
}

export interface AddListMembershipByEmailInput {
  accessToken: string;
  listId: string;
  email: string;
}

/**
 * Add a contact to a manual list by email.
 *
 * HubSpot returns 200 with `recordIdsAdded` on success. For DYNAMIC
 * lists (membership controlled by HubSpot's rule engine), the API
 * returns a 400 with `category: "VALIDATION_ERROR"` — the shared
 * `hubspotRequest` surfaces the `message` field which V1 special-cases
 * for `"DYNAMIC"`. V2 surfaces the error verbatim; workflow authors
 * see the original HubSpot validation message.
 */
export async function addListMembershipByEmail(
  input: AddListMembershipByEmailInput,
): Promise<ListMembershipAddResponse> {
  return hubspotRequest<ListMembershipAddResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath(`lists/${encodeURIComponent(input.listId)}/memberships/add`),
    body: { recordIdOrEmails: [input.email] },
    resourceForNotFound: `list ${input.listId}`,
  });
}

// ─── removeListMembershipByEmail (HubSpot 2.1) ─────────────────────────────

export interface RemoveListMembershipByEmailInput {
  accessToken: string;
  listId: string;
  email: string;
}

export interface ListMembershipRemoveResponse {
  recordIdsRemoved?: string[];
  /** HubSpot returns this when the email is not on the list (silent skip,
   *  no error). Workflow authors that want strict-presence semantics
   *  branch on `recordIdsRemoved.length === 0`. */
  recordIdsDiscarded?: string[];
}

/**
 * Remove a contact from a manual list by email — HubSpot 2.1.
 *
 * Symmetric with `addListMembershipByEmail` — uses the same v3
 * lists API (`POST /crm/v3/lists/{listId}/memberships/remove`). V1's
 * legacy `/contacts/v1/lists/{listId}/remove` endpoint is NOT used;
 * the v3 path keeps the wrapper consistent with the add path V2
 * already ships and avoids reintroducing the V1 two-step
 * contact-search-then-remove flow.
 *
 * DYNAMIC-list constraint: HubSpot rejects manual-remove attempts
 * against dynamic lists with a 400 `VALIDATION_ERROR`. The wrapper
 * surfaces the error verbatim via `hubspotRequest`.
 */
export async function removeListMembershipByEmail(
  input: RemoveListMembershipByEmailInput,
): Promise<ListMembershipRemoveResponse> {
  return hubspotRequest<ListMembershipRemoveResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath(
      `lists/${encodeURIComponent(input.listId)}/memberships/remove`,
    ),
    body: { recordIdOrEmails: [input.email] },
    resourceForNotFound: `list ${input.listId}`,
  });
}
