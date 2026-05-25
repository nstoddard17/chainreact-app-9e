import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper for the Gmail new_labeled_email trigger.
 *
 * Gmail 2.3 Commit 3 — per-trigger dedup-key prefix `labeled:` so
 * the same Gmail message id can be processed independently by both
 * the `new_email` trigger AND the `new_labeled_email` trigger
 * without colliding in `webhook_event_dedup`.
 *
 * Background:
 *   - `webhook_event_dedup` is keyed on `(provider, eventId)`.
 *   - `new_email`'s dedup wrapper (`newEmail/dedup.ts`) uses the bare
 *     Gmail message id as `eventId`.
 *   - If `new_labeled_email` also used the bare id, the second
 *     trigger that processes the same message would be silently
 *     deduped as "already seen" — workflows on both triggers
 *     wouldn't both fire.
 *   - Solution: prefix the dedup key with `labeled:`. Same dedup
 *     table, no schema change. Documented convention.
 *
 * Outage policy matches `new_email`: fail-CLOSED on dedup errors so
 * a transient dedup failure delays-but-doesn't-double on retry.
 */

export interface DedupOutcome {
  /** True iff this is the first time we've seen this Gmail message id for this trigger type. */
  fresh: boolean;
  /** True iff dedup itself errored — caller skips this message. */
  outage: boolean;
}

const DEDUP_PREFIX = "labeled:";

export async function checkAndMarkSeenLabeled(
  gmailMessageId: string,
): Promise<DedupOutcome> {
  const key = `${DEDUP_PREFIX}${gmailMessageId}`;
  try {
    const { fresh } = await dedupRepo.markSeen("gmail", key);
    return { fresh, outage: false };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "gmail.poll.dedup.outage",
        trigger: "new_labeled_email",
        messageId: gmailMessageId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
