import { z } from "zod";

/**
 * Zod schema for the Discord `new_message` trigger config — Slice 3.DISCORD-7.
 *
 * User-facing fields mirror the V1 `discord_trigger_new_message`
 * manifest (subset that survives the gateway → polling architecture
 * change):
 *   - `guildId` — Discord server id (required for cascading channel picker).
 *   - `channelId` — text channel to watch (required).
 *   - `contentFilter` — optional list of case-insensitive substring
 *     keywords. OR-match: a message passes if its content contains
 *     ANY of the listed strings. Empty array = no content filter.
 *   - `authorFilter` — optional single user id; if set, only messages
 *     whose `author.id` matches fire. Empty / undefined = any author.
 *
 * Server-managed fields (set by the activation hook + advanced by the
 * poll loop) live alongside the user-set fields:
 *   - `pollingEnabled` — set true by `activate.ts`.
 *   - `snapshot.lastSeenMessageId` — Discord-snowflake high-water mark.
 *     The poll uses this as the `after=` cursor; advances after each
 *     successful poll.
 *   - `snapshot.capturedAt` — ISO-8601 timestamp of when the snapshot
 *     was originally seeded (operator diagnostics only).
 *   - `polling.lastPolledAt` — set after each successful poll tick.
 *
 * Mirrors `GmailNewEmailConfigSchema` shape — same `snapshot` /
 * `polling` envelope so the structural test that asserts polling
 * trigger snapshot initialization (`tests/structure/
 * trigger-meta-activation-invariant.test.ts`) recognizes the row.
 */

export const DiscordNewMessageConfigSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  contentFilter: z.array(z.string().min(1)).default([]),
  authorFilter: z.string().min(1).optional(),

  // Server-managed polling state — populated by activation + advanced
  // by the polling loop. Polling state is `optional` so the schema
  // can also validate a pre-activate "draft" config (e.g. the
  // workflow-builder's preview path).
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      lastSeenMessageId: z.string().min(1),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});

export type DiscordNewMessageConfig = z.infer<typeof DiscordNewMessageConfigSchema>;
