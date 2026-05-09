import { z } from "zod";

/**
 * Resolved-config schema for the Outlook Calendar add_attendees action.
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `attendees`: required, non-empty after parseRecipients (handler
 *     re-checks; an all-whitespace CSV like "  ,  " parses to an
 *     empty list and the handler rejects).
 *   - `attendeeType`: V1 hardcodes "required" for all new attendees;
 *     V2 forces explicit choice (Microsoft Graph differentiates
 *     "required" vs "optional" attendees with user-visible behavior
 *     in the calendar grid).
 *
 * Semantic note (Slice 7 plan §"`add_attendees` — append, not replace"):
 *   Graph PATCH on `attendees` REPLACES the entire list. This action
 *   reads the event first, merges new attendees with the existing list
 *   (deduping by email address case-insensitively), and PATCHes the
 *   merged list. The race window between GET and PATCH is documented
 *   as accepted for Slice 7 (single-actor assumption).
 *
 * Strict mode rejects unknown fields.
 */

const AttendeesField = z.union([
  z.string().min(1),
  z.array(z.string()).min(1),
]);

export const AddAttendeesConfigSchema = z
  .object({
    eventId: z.string().min(1, "eventId is required."),
    attendees: AttendeesField,
    /** Q11 required: no hidden default for required vs optional. */
    attendeeType: z.enum(["required", "optional"]),
  })
  .strict();

export type AddAttendeesConfig = z.infer<typeof AddAttendeesConfigSchema>;
