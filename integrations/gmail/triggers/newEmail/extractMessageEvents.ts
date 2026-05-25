import type { GmailHistoryRecord } from "../../api/usersHistoryList";

/**
 * Tagged Gmail history event.
 *
 * Gmail 2.3 Commit 2: replaces the previous private `extractMessageIds`
 * helper that returned a flat `string[]`. The tagged shape lets each
 * trigger's poll handler pick the event sources it cares about
 * without re-walking the raw history pages:
 *
 *   - `new_email` (Slice 2e — current behavior): all three sources are
 *     mapped back to ids and collapsed via `Array.from(new Set(...))`.
 *     V1 historyTypes spec includes `labelAdded` so a labelsAdded
 *     entry whose configured label is "INBOX" counts as a new arrival
 *     from the user's perspective (filter rules apply labels post-
 *     receipt). See `usersHistoryList.ts:10-17`.
 *   - `new_labeled_email` (Gmail 2.3 Commit 3): filter `source ===
 *     "labelsAdded" AND addedLabelIds.includes(configuredLabelId)`.
 *   - `new_attachment` (Gmail 2.3 Commit 4): filter `source ===
 *     "messagesAdded"`, then hydrate to inspect attachments.
 *
 * The function is PURE and standalone (no side effects, no DB, no
 * mocks needed for tests). The two-step `extract → filter` pattern
 * keeps the history walk single-pass at the orchestrator layer while
 * leaving per-trigger semantics to per-trigger handlers.
 */
export interface MessageEvent {
  /** Gmail message id. */
  id: string;
  /** Which history-record field this event was extracted from. */
  source: "messagesAdded" | "labelsAdded" | "messages";
  /**
   * For `source === "labelsAdded"`: the labels that were just added
   * in this history entry. Preserved so per-trigger filters (e.g.
   * `new_labeled_email`) can match on configured label ids without
   * a separate fetch.
   *
   * Undefined for `messagesAdded` / `messages` events.
   */
  addedLabelIds?: readonly string[];
}

/**
 * Walks `users.history.list` results and yields one `MessageEvent`
 * per source occurrence.
 *
 * Note: a single Gmail message id can produce MULTIPLE events across
 * sources within one history walk (e.g. a message that was added AND
 * had a label applied in the same window). The caller is responsible
 * for any cross-source de-duplication semantics it wants — for
 * `new_email`'s current behavior the caller collapses by id; for
 * per-source triggers the caller filters first then collapses.
 */
export function extractMessageEvents(
  history: readonly GmailHistoryRecord[],
): MessageEvent[] {
  const events: MessageEvent[] = [];
  for (const entry of history) {
    if (entry.messagesAdded) {
      for (const m of entry.messagesAdded) {
        events.push({ id: m.message.id, source: "messagesAdded" });
      }
    }
    if (entry.labelsAdded) {
      for (const m of entry.labelsAdded) {
        events.push({
          id: m.message.id,
          source: "labelsAdded",
          addedLabelIds: m.labelIds,
        });
      }
    }
    // V1 also flattened entry.messages as a defensive fallback (V1
    // gmail-processor.ts:885) — preserve that.
    if (entry.messages) {
      for (const m of entry.messages) {
        events.push({ id: m.id, source: "messages" });
      }
    }
  }
  return events;
}
