import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `delete_record` action.
 *
 * Convention decision: deleting a record that doesn't exist is a
 * config error — Airtable returns 404, V2's API wrapper throws
 * `NotFoundError`, the engine surfaces it. NOT idempotent. Mirrors
 * Notion / Microsoft action patterns where targeted-resource actions
 * fail loud on missing resources rather than silently succeeding.
 *
 * Workflow authors who want idempotent delete can pre-check via
 * `find_record` then conditionally call `delete_record`.
 */
export const DeleteRecordConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    recordId: z.string().min(1),
  })
  .strict();

export type DeleteRecordConfig = z.infer<typeof DeleteRecordConfigSchema>;
