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
