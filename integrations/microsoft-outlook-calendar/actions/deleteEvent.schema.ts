import { z } from "zod";

/**
 * Resolved-config schema for the Outlook Calendar delete_event action.
 *
 * Strict mode rejects unknown fields. The handler treats 404 as
 * idempotent success — the action returns
 * `{deleted: true, alreadyMissing: true}` rather than failing the
 * workflow. Matches Slice 4 deleteFile convention.
 */
export const DeleteEventConfigSchema = z
  .object({
    eventId: z.string().min(1, "eventId is required."),
  })
  .strict();

export type DeleteEventConfig = z.infer<typeof DeleteEventConfigSchema>;
