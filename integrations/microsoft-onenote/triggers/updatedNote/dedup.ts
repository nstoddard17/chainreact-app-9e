import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper around `webhook_event_dedup` for OneNote
 * `updated_note` — Slice 3.ONENOTE-5.
 *
 * **Event-id namespace: `${pageId}:${lastModifiedDateTime}`** —
 * page + mtime composite key. Distinct updates of the same page (page
 * edited at T1, then again at T2) produce distinct eventIds so the
 * trigger fires once per real update. Mirrors V1's "dedup by page-id
 * AND mtime, not just page-id" rule from the slice spec.
 *
 * Outage policy: fail-CLOSED (matches Gmail / Discord / new_note).
 * Transient dedup failures skip enqueue and rely on the next tick to
 * retry; a duplicate run firing user-facing actions twice is worse
 * than a delayed run firing them once.
 *
 * Distinct from `new_note`'s `${pageId}:created` namespace so the two
 * triggers don't suppress each other when a brand-new page is also
 * an update (new_note fires; updated_note correctly skips new pages
 * via the createdDateTime === lastModifiedDateTime guard in poll.ts).
 */

export interface DedupOutcome {
  fresh: boolean;
  outage: boolean;
}

export function buildEventId(
  pageId: string,
  lastModifiedDateTime: string,
): string {
  return `${pageId}:${lastModifiedDateTime}`;
}

export async function checkAndMarkSeen(
  pageId: string,
  lastModifiedDateTime: string,
): Promise<DedupOutcome> {
  const eventId = buildEventId(pageId, lastModifiedDateTime);
  try {
    const { fresh } = await dedupRepo.markSeen("microsoft-onenote", eventId);
    return { fresh, outage: false };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "microsoft-onenote.updated_note.dedup.outage",
        eventId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
