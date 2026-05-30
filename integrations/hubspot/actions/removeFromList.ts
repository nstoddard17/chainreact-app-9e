import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { removeListMembershipByEmail } from "../../_shared/hubspot/api/lists";
import { RemoveFromListConfigSchema } from "./removeFromList.schema";

/**
 * HubSpot `remove_from_list` action handler — HubSpot 2.1.
 *
 * POSTs `/crm/v3/lists/{listId}/memberships/remove` with
 * `recordIdOrEmails: [email]`. Symmetric with `add_contact_to_list`
 * (Slice 13).
 *
 * Output is bounded:
 *   { listId, email, contactIdsRemoved, contactIdsDiscarded }
 *
 *   `contactIdsRemoved` is empty when HubSpot couldn't resolve the
 *   email to any list member (no error — just an empty remove result).
 *   The workflow author can branch on
 *   `contactIdsRemoved.length === 0` to detect missing-membership
 *   situations.
 *
 * DYNAMIC-list errors surface as the standard HubSpot validation
 * message via the wrapper.
 */
export const removeFromList: ActionHandler = async (input) => {
  const config = RemoveFromListConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const response = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      removeListMembershipByEmail({
        accessToken,
        listId: config.listId,
        email: config.email,
      }),
  });

  return {
    output: {
      listId: config.listId,
      email: config.email,
      contactIdsRemoved: response.recordIdsRemoved ?? [],
      contactIdsDiscarded: response.recordIdsDiscarded ?? [],
    },
  };
};
