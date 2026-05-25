import { z } from "zod";

/**
 * Resolved-config schema for the Trello `archive_card` action.
 *
 * Required:
 *   - `cardId` — the card to archive (or unarchive).
 *
 * Optional:
 *   - `closed` — boolean. Defaults to `true` (archive). Pass `false`
 *     to explicitly unarchive. V1 accepted string `"true"` / `"false"`;
 *     V2 requires a real boolean (strict shape — workflow authors who
 *     pass strings fail at config validation).
 *
 * Default to `true` is acceptable here because the action's NAME is
 * "archive_card" — defaulting to the action that matches the name is
 * not a hidden default in the Q11 sense (no surprise behavior).
 */
export const ArchiveCardConfigSchema = z
  .object({
    cardId: z.string().min(1),
    closed: z.boolean().default(true),
  })
  .strict();

export type ArchiveCardConfig = z.infer<typeof ArchiveCardConfigSchema>;
