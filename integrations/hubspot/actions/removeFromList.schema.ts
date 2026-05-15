import { z } from "zod";

/**
 * `remove_from_list` action schema — HubSpot 2.1.
 *
 * Removes a contact (by email) from a manual HubSpot list via
 * `POST /crm/v3/lists/{listId}/memberships/remove` — symmetric with
 * `add_contact_to_list` shipped in Slice 13. V1's legacy
 * `/contacts/v1/lists/{listId}/remove` endpoint is NOT used.
 *
 * Required: `listId` + `email`.
 *
 * Dynamic-list constraint: HubSpot rejects manual-remove attempts
 * against dynamic lists with a 400 `VALIDATION_ERROR`. The wrapper
 * surfaces the message verbatim; workflow authors see the HubSpot
 * validation message.
 *
 * `.strict()` rejects V1 chrome (`contactId`, `removeFromAll`,
 * etc.) at parse time. Workflow authors with a contact id resolve to
 * email via `get_contacts` first.
 */
export const RemoveFromListConfigSchema = z
  .object({
    listId: z.string().min(1, "listId is required."),
    email: z.string().email("email must be a valid email address."),
  })
  .strict();

export type RemoveFromListConfig = z.infer<typeof RemoveFromListConfigSchema>;
