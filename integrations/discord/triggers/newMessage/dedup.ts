import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper for the Discord `new_message` trigger —
 * Slice 3.DISCORD-7.
 *
 * Mirrors `integrations/gmail/triggers/newEmail/dedup.ts` shape. Why
 * the same pattern:
 *
 *   - **Snowflake dedup key.** Discord message ids are globally-unique
 *     snowflakes (no collisions across channels or guilds — Discord
 *     mints them from a global counter). They are the natural dedup
 *     key: same message id = same event, every time.
 *
 *   - **`webhook_event_dedup` is the right store.** Cron tick processes
 *     are short-lived (serverless), so a per-process Map cache like
 *     V1's gateway used is useless here. The existing dedup table is
 *     keyed on `(provider, eventId)` and is the same store the V2
 *     webhook dispatcher uses — behavioral parity across event sources
 *     without two competing dedup stores.
 *
 *   - **Fail-CLOSED outage policy.** If `markSeen` throws, we skip the
 *     enqueue and rely on the next poll tick to retry. Rationale: a
 *     transient dedup failure that causes a duplicate run could fire
 *     user-facing downstream actions twice (Slack message, Stripe
 *     refund, etc.); failing closed delays-but-doesn't-double on
 *     retry. The webhook dispatcher fails-OPEN by design (Q4 session-
 *     side-effects idempotency catches downstream double-fires), but
 *     polling has no Q4 backstop yet so we err on the safe side.
 */

export interface DedupOutcome {
  /** True iff this is the first time we've seen this Discord message id. */
  fresh: boolean;
  /** True iff dedup itself errored — caller skips this message. */
  outage: boolean;
}

export async function checkAndMarkSeen(
  discordMessageId: string,
): Promise<DedupOutcome> {
  try {
    const { fresh } = await dedupRepo.markSeen("discord", discordMessageId);
    return { fresh, outage: false };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "discord.poll.dedup.outage",
        messageId: discordMessageId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
