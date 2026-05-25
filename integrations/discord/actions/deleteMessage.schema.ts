import { z } from "zod";

/**
 * Resolved-config schema for the Discord `delete_message` action.
 *
 * Destructive bulk action. V1 field names preserved verbatim per Slice
 * 3.DISCORD-1 §7.1: `guildId`, `channelId`, `messageIds`, `userIds`,
 * `keywords`, `keywordMatchType`. NO normalization.
 *
 * **Three filter modes, combinable:**
 *
 *   1. **Direct selection via `messageIds[]`** — when the caller supplies
 *      an explicit list of message IDs, the handler deletes exactly
 *      those messages and ignores the other filter fields. This is the
 *      most predictable mode and bypasses the per-channel message
 *      fetch.
 *
 *   2. **Author filter via `userIds[]`** — the handler fetches the most
 *      recent 100 messages in the channel and keeps only those whose
 *      `author.id` matches one of the supplied user IDs.
 *
 *   3. **Keyword filter via `keywords[]` + `keywordMatchType`** — the
 *      handler fetches the most recent 100 messages and keeps only
 *      those whose `content` matches at least one keyword under the
 *      chosen match semantics:
 *        - `"partial"` (default): case-insensitive substring match.
 *          `"foo"` matches `"FoOBaR"`.
 *        - `"whole"`: case-insensitive whole-word match. `"foo"` matches
 *          `"foo bar"` but NOT `"foobar"`.
 *        - `"exact"`: case-sensitive substring match. `"foo"` matches
 *          `"foo bar"` but NOT `"FOO bar"`.
 *
 *   `userIds[]` + `keywords[]` combine as AND — a message must match
 *   BOTH the author filter and at least one keyword to be deleted.
 *
 * **`keywordMatchType` default is `"partial"` per V1 runtime behavior**
 * (mirror at lib/workflows/actions/discord.ts:1034). Preserved here to
 * avoid silent behavior drift on workflows that omit the field.
 *
 * **Empty-filter safety:** if `messageIds` is empty AND `userIds` is
 * empty AND `keywords` is empty, the handler returns
 * `{ deletedCount: 0, ... }` without making any API call — refusing to
 * delete a wide-open set is the safe default for a destructive bulk
 * action.
 *
 * **Discord-enforced bulk-delete bounds:**
 *   - 2-100 message IDs per bulk-delete API call.
 *   - All messages must be < 14 days old.
 *   - Single-message lists use the per-message DELETE endpoint instead.
 *   - >100 messages or older-than-14-day messages fall back to
 *     per-message DELETE in a loop.
 *
 * No schema-level cap on `messageIds.length` — the handler routes to
 * the appropriate Discord endpoint based on count + age. A request to
 * delete 500 messages will fan out into 5 bulk-delete calls (each
 * handling 100); a 100-id bulk-delete with one >14-day message will
 * fall back to per-message DELETE.
 */

const KeywordMatchType = z.enum(["partial", "whole", "exact"]);

export const DeleteMessageConfigSchema = z
  .object({
    guildId: z.string().min(1, "Discord guildId is required."),
    channelId: z.string().min(1, "Discord channelId is required."),
    messageIds: z.array(z.string().min(1)).optional(),
    userIds: z.array(z.string().min(1)).optional(),
    keywords: z.array(z.string().min(1)).optional(),
    // V1 default = "partial" (lib/workflows/actions/discord.ts:1034).
    // Schema-level default mirrors V1 runtime behavior so omission is
    // a no-op (no silent drift).
    keywordMatchType: KeywordMatchType.default("partial"),
  })
  .strict();

export type DeleteMessageConfig = z.infer<typeof DeleteMessageConfigSchema>;
export type DeleteMessageKeywordMatchType = z.infer<typeof KeywordMatchType>;
