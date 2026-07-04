import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { findContactByEmail } from "../../_shared/hubspot/api/contacts";
import { listMembershipsRemove } from "../../_shared/hubspot/api/lists";
import { RemoveFromListConfigSchema } from "./removeFromList.schema";

/**
 * HubSpot `remove_from_list` action handler — HubSpot 2.1, REWORKED
 * 2026-07-04 (production bug found by live action smoke).
 *
 * The original wrapper POSTed `recordIdOrEmails` — the LEGACY v1 lists
 * body; HubSpot's v3 memberships endpoint answers HTTP 405 to POST and
 * takes PUT + a raw record-id array with NO email variant. Symmetric
 * with `add_contact_to_list`'s rework:
 *   1. `findContactByEmail` resolves email -> contactId.
 *   2. `listMembershipsRemove` PUTs `[contactId]` (204; removing a
 *      non-member is a no-op on HubSpot's side).
 *
 * Output (shape unchanged):
 *   { listId, email, contactIdsRemoved, contactIdsDiscarded }
 *
 *   `contactIdsRemoved` is empty when NO contact exists with the email
 *   (no error — the documented empty-remove result; branch on
 *   `contactIdsRemoved.length === 0` to detect missing contacts).
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

  const contact = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      findContactByEmail({ accessToken, email: config.email }),
  });

  if (!contact) {
    // Documented no-error path: no contact with that email -> empty remove.
    return {
      output: {
        listId: config.listId,
        email: config.email,
        contactIdsRemoved: [],
        contactIdsDiscarded: [],
      },
    };
  }

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      listMembershipsRemove({
        accessToken,
        listId: config.listId,
        recordIds: [contact.id],
      }),
  });

  return {
    output: {
      listId: config.listId,
      email: config.email,
      contactIdsRemoved: [contact.id],
      contactIdsDiscarded: [],
    },
  };
};
