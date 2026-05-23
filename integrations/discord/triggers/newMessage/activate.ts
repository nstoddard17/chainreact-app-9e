import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { messagesList } from "@/integrations/_shared/discord/api/messages";
import { snowflakeFromTimestamp } from "./snowflake";

/**
 * Discord `new_message` activation hook — Slice 3.DISCORD-7.
 *
 * Implements the V1 CLAUDE.md "first-poll-miss" rule for polling
 * triggers: BEFORE the first poll tick can fire, we seed
 * `snapshot.lastSeenMessageId` with the channel's current newest
 * message id. Without this baseline, the first poll would establish
 * its own baseline and silently drop messages that arrived between
 * activation and the first tick.
 *
 * Validates required config:
 *   - `node.config.guildId` — Discord guild snowflake. Used for
 *     payload `guildId` echo + activation diagnostics.
 *   - `node.config.channelId` — Discord channel snowflake. The
 *     poll loop reads this verbatim — the schema validator at
 *     `schema.ts` re-checks at poll-tick time.
 *
 * Empty-channel handling: when the channel has zero existing
 * messages, `messagesList({limit: 1})` returns `[]`. The naive
 * fallback ("use `0` as lastSeenMessageId") would replay every
 * future message twice on first poll (Discord treats `after=0` as
 * "from the beginning of time"). Instead, synthesize a snowflake
 * from `Date.now()` via `snowflakeFromTimestamp` — every real
 * message Discord creates AFTER this activation has a strictly
 * larger snowflake, so the first poll polls in correctly.
 *
 * Re-activation idempotency: the orchestrator calls activate every
 * time the workflow transitions to `active`. Each call re-seeds the
 * snapshot from the channel's CURRENT newest message; any messages
 * that arrived during the "disabled" window are intentionally NOT
 * replayed (workflow re-enables are not history-replay events). This
 * matches the Gmail trigger's behavior.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ node }) => {
  const config = node.config ?? {};

  const guildId = config.guildId;
  if (typeof guildId !== "string" || guildId.length === 0) {
    throw new Error(
      "discord new_message activate: node.config.guildId is required (Discord server snowflake id).",
    );
  }

  const channelId = config.channelId;
  if (typeof channelId !== "string" || channelId.length === 0) {
    throw new Error(
      "discord new_message activate: node.config.channelId is required (Discord text channel snowflake id).",
    );
  }

  const newest = await messagesList({ channelId, limit: 1 });

  let lastSeenMessageId: string;
  if (newest.length > 0 && typeof newest[0]?.id === "string" && newest[0].id.length > 0) {
    lastSeenMessageId = newest[0].id;
  } else {
    // Empty channel — synthesize a high-water snowflake from current
    // wall-clock time so the first real message has a larger id.
    lastSeenMessageId = snowflakeFromTimestamp(Date.now());
  }

  return {
    pollingEnabled: true,
    snapshot: {
      lastSeenMessageId,
      capturedAt: new Date().toISOString(),
    },
  };
};
