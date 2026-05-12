import { z } from "zod";

/**
 * Resolved-config schema for the Slack list_channels action (Slack 2.3
 * Commit 2).
 *
 * Reads channels visible to the bot via `conversations.list` with cursor
 * pagination. The engine pre-resolves any `{{...}}` references before
 * the schema runs.
 *
 * `kind` selects which channel kinds to include:
 *   - `public`  → Slack `types=public_channel` (default; uses `channels:read`)
 *   - `private` → Slack `types=private_channel` (uses `groups:read`)
 *   - `both`    → Slack `types=public_channel,private_channel`
 *
 * `excludeArchived` defaults to true at the handler boundary (most
 * workflow callers want active channels). The schema makes the field
 * optional; the handler applies the default.
 *
 * `limit` is Slack's per-page maximum (1–1000; default 100). The
 * handler does NOT auto-loop pages — workflow authors paginate by
 * calling the action again with the previous response's `nextCursor`.
 *
 * `cursor` is opaque pagination state passed through from a previous
 * call's `output.nextCursor`. Empty / absent means start at the first
 * page.
 *
 * `.strict()` rejects unknown keys — typo / drift defense per the
 * established Slack 2.1 schema pattern.
 */
export const ListChannelsConfigSchema = z
  .object({
    kind: z.enum(["public", "private", "both"]).optional(),
    excludeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type ListChannelsConfig = z.infer<typeof ListChannelsConfigSchema>;
