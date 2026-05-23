import { z } from "zod";

/**
 * Resolved-config schema for the Discord `fetch_messages` action.
 *
 * V1 field names preserved verbatim per Slice 3.DISCORD-1 §7.1:
 * `guildId`, `channelId`, `limit`, `sortOrder`, `filterType`,
 * `filterAuthor`, `filterContent`, `caseSensitive`. NO normalization.
 *
 * **V1 defaults preserved (no silent drift):**
 *   - `limit` = 20
 *   - `sortOrder` = `"newest"`
 *   - `filterType` = `"none"`
 *   - `caseSensitive` = false
 *
 * **`filterType` 9-value enum (V1 parity):**
 *   - `"none"` — no filter; return up to `limit` most recent messages
 *     after system-message removal.
 *   - `"author"` — keep messages whose `author.id === filterAuthor`.
 *     Requires `filterAuthor`.
 *   - `"content"` — keep messages whose `content` contains
 *     `filterContent` (case sensitivity controlled by `caseSensitive`).
 *     Requires `filterContent`.
 *   - `"has_attachments"` — keep messages with at least one attachment.
 *   - `"has_embeds"` — keep messages with at least one embed.
 *   - `"is_pinned"` — keep messages whose `pinned === true`.
 *   - `"from_bots"` — keep messages whose `author.bot === true`.
 *   - `"from_humans"` — keep messages whose `author.bot !== true`.
 *   - `"has_reactions"` — keep messages with at least one reaction.
 *
 * Discord caps `limit` at 100 per API call. V2 mirrors at the schema
 * layer; the handler additionally fetches `limit * 3` (capped at 100)
 * when an active filter is applied so the post-filter result has a
 * decent chance of hitting the requested count.
 *
 * **Conditional field requirements:**
 *   - `filterAuthor` is required when `filterType === "author"`. Other
 *     `filterType` values ignore it.
 *   - `filterContent` is required when `filterType === "content"`.
 *     Other `filterType` values ignore it.
 *
 * Enforced via `superRefine` — config that mismatches the conditional
 * shape fails at the schema layer with a clear path.
 */

const FilterType = z.enum([
  "none",
  "author",
  "content",
  "has_attachments",
  "has_embeds",
  "is_pinned",
  "from_bots",
  "from_humans",
  "has_reactions",
]);

const SortOrder = z.enum(["newest", "oldest"]);

export const FetchMessagesConfigSchema = z
  .object({
    guildId: z.string().min(1, "Discord guildId is required."),
    channelId: z.string().min(1, "Discord channelId is required."),
    limit: z.number().int().min(1).max(100).default(20),
    sortOrder: SortOrder.default("newest"),
    filterType: FilterType.default("none"),
    filterAuthor: z.string().min(1).optional(),
    filterContent: z.string().min(1).optional(),
    caseSensitive: z.boolean().default(false),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.filterType === "author" && !cfg.filterAuthor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filterAuthor"],
        message: "filterAuthor is required when filterType is 'author'.",
      });
    }
    if (cfg.filterType === "content" && !cfg.filterContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filterContent"],
        message: "filterContent is required when filterType is 'content'.",
      });
    }
  });

export type FetchMessagesConfig = z.infer<typeof FetchMessagesConfigSchema>;
export type FetchMessagesFilterType = z.infer<typeof FilterType>;
export type FetchMessagesSortOrder = z.infer<typeof SortOrder>;
