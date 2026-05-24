import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper around `webhook_event_dedup` — Slice
 * 3.ONENOTE-5.
 *
 * Mirrors the Gmail / Discord polling-trigger pattern. Cross-tick
 * dedup keyed on (provider, eventId) so a snapshot regression or a
 * Graph response delivering the same page twice doesn't fire the
 * workflow twice.
 *
 * Outage policy: V2's polling dedup fails-CLOSED — if `markSeen`
 * throws (DB connection error, etc.), skip enqueue for this page and
 * rely on the next poll tick to retry. Rationale per
 * gmail/triggers/newEmail/dedup.ts: a transient dedup failure that
 * causes a duplicate run could fire user-facing actions twice;
 * failing closed delays-but-doesn't-double on retry.
 *
 * Event-id namespace: `${pageId}:created` — page-id dedup is
 * sufficient since a page can only be "created" once. Distinct from
 * `updated_note`'s `${pageId}:${lastModifiedDateTime}` so the two
 * triggers don't suppress each other.
 */

export interface DedupOutcome {
  fresh: boolean;
  outage: boolean;
}

export function buildEventId(pageId: string): string {
  return `${pageId}:created`;
}

export async function checkAndMarkSeen(
  pageId: string,
): Promise<DedupOutcome> {
  const eventId = buildEventId(pageId);
  try {
    const { fresh } = await dedupRepo.markSeen("microsoft-onenote", eventId);
    return { fresh, outage: false };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "microsoft-onenote.new_note.dedup.outage",
        eventId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
