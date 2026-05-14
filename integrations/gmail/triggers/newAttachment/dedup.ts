import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper for the Gmail new_attachment trigger.
 *
 * Gmail 2.3 Commit 4 — per-trigger dedup-key prefix `attachment:` so
 * the same Gmail message id can be processed independently by all
 * three Gmail polling triggers (`new_email`, `new_labeled_email`,
 * `new_attachment`) without colliding in `webhook_event_dedup`.
 *
 * Background (same rationale as `new_labeled_email/dedup.ts`):
 *   - `webhook_event_dedup` is keyed on `(provider, eventId)`.
 *   - `new_email`'s wrapper uses the bare Gmail message id as eventId.
 *   - `new_labeled_email`'s wrapper prefixes `labeled:`.
 *   - `new_attachment`'s wrapper prefixes `attachment:` so workflows on
 *     all three triggers can fire independently on the same message.
 *
 * Outage policy: fail-CLOSED on dedup errors so a transient dedup
 * failure delays-but-doesn't-double on retry. Matches the
 * other Gmail polling triggers exactly.
 */

export interface DedupOutcome {
  /** True iff this is the first time we've seen this Gmail message id for this trigger type. */
  fresh: boolean;
  /** True iff dedup itself errored — caller skips this message. */
  outage: boolean;
}

const DEDUP_PREFIX = "attachment:";

export async function checkAndMarkSeenAttachment(
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
        trigger: "new_attachment",
        messageId: gmailMessageId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
