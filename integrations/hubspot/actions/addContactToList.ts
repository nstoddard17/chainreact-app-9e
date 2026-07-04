import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { findContactByEmail } from "../../_shared/hubspot/api/contacts";
import { listMembershipsAdd } from "../../_shared/hubspot/api/lists";
import { AddContactToListConfigSchema } from "./addContactToList.schema";

/**
 * HubSpot `add_contact_to_list` action handler — Slice 13 Batch 1,
 * REWORKED 2026-07-04 (production bug found by live action smoke).
 *
 * The original single-call collapse POSTed `recordIdOrEmails` — the
 * LEGACY v1 lists body; HubSpot's v3 memberships endpoint answers
 * HTTP 405 to POST and takes PUT + a raw record-id array with NO
 * email variant. The handler therefore does V1's two-step flow with
 * V2's deterministic wrappers:
 *   1. `findContactByEmail` (the same lookup create_contact's 409
 *      recovery uses) resolves email -> contactId.
 *   2. `listMembershipsAdd` PUTs `[contactId]` (204; idempotent).
 *
 * Output (shape unchanged):
 *   { listId, email, contactIdsAdded, contactIdsDiscarded }
 *
 *   `contactIdsAdded` is empty when NO contact exists with the email
 *   (no error — the documented empty-add result; branch on
 *   `contactIdsAdded.length === 0` to detect missing contacts).
 *
 * Dynamic-list errors (HubSpot 400 VALIDATION_ERROR: cannot manually
 * add to dynamic lists) surface verbatim via the shared wrapper.
 */
export const addContactToList: ActionHandler = async (input) => {
  const config = AddContactToListConfigSchema.parse(input.config);

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
    // Documented no-error path: no contact with that email -> empty add.
    return {
      output: {
        listId: config.listId,
        email: config.email,
        contactIdsAdded: [],
        contactIdsDiscarded: [],
      },
    };
  }

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      listMembershipsAdd({
        accessToken,
        listId: config.listId,
        recordIds: [contact.id],
      }),
  });

  return {
    output: {
      listId: config.listId,
      email: config.email,
      contactIdsAdded: [contact.id],
      contactIdsDiscarded: [],
    },
  };
};
