import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { addListMembershipByEmail } from "../../_shared/hubspot/api/lists";
import { AddContactToListConfigSchema } from "./addContactToList.schema";

/**
 * HubSpot `add_contact_to_list` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/lists/{listId}/memberships/add` with
 * `recordIdOrEmails: [email]`. HubSpot resolves email->contactId
 * server-side — the V1 two-step search-then-add flow is collapsed to
 * a single call.
 *
 * Output:
 *   { listId, email, contactIdsAdded, contactIdsDiscarded }
 *
 *   `contactIdsAdded` is empty when HubSpot couldn't resolve the
 *   email to any contact (no error — just an empty add result). The
 *   workflow author can branch on `contactIdsAdded.length === 0` to
 *   detect missing-contact situations.
 *
 * Dynamic-list errors (HubSpot validation: cannot add to dynamic
 * lists) surface as the standard HubSpot error message via
 * `surfaceHubSpotError`.
 */
export const addContactToList: ActionHandler = async (input) => {
  const config = AddContactToListConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const response = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      addListMembershipByEmail({
        accessToken,
        listId: config.listId,
        email: config.email,
      }),
  });

  return {
    output: {
      listId: config.listId,
      email: config.email,
      contactIdsAdded: response.recordIdsAdded ?? [],
      contactIdsDiscarded: response.recordIdsDiscarded ?? [],
    },
  };
};
