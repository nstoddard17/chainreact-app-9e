import { z } from "zod";

/**
 * `add_contact_to_list` action schema — Slice 13 Batch 1.
 *
 * Adds an existing contact (by email) to a manual HubSpot list.
 * V1 uses a two-step search-then-add flow; V2 collapses to a single
 * POST using HubSpot's `recordIdOrEmails` parameter (HubSpot resolves
 * email->contactId server-side).
 *
 * Required: `listId` + `email`.
 *
 * Dynamic-list constraint: HubSpot's CRM v3 lists API returns a 400
 * VALIDATION_ERROR on manual-add attempts against dynamic lists.
 * The wrapper surfaces the error verbatim; workflow authors see the
 * HubSpot validation message.
 */
export const AddContactToListConfigSchema = z
  .object({
    listId: z.string().min(1),
    email: z.string().email(),
  })
  .strict();

export type AddContactToListConfig = z.infer<
  typeof AddContactToListConfigSchema
>;
