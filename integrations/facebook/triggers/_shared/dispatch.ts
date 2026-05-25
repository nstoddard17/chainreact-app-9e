import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import {
  classifyFeedChange,
  normalizeNewComment,
  normalizeNewPost,
  type FacebookWebhookBody,
} from "./normalize";

/**
 * Facebook Page webhook fan-out — Slice 3.FACEBOOK-5.
 *
 * Takes a VERIFIED page webhook body and dispatches one canonical
 * `TriggerEvent` per qualifying `feed` change through the provider-agnostic
 * dispatcher (`services/triggers/dispatch.ts`), which handles:
 *   - global `(provider, eventId)` dedup (repeated webhook retries collapse);
 *   - `(facebook, new_post|new_comment)` trigger-row lookup;
 *   - the registered per-trigger filter (pageId / optional postId match);
 *   - workflow-state gating + enqueue.
 *
 * One change → one `dispatchTriggerEvent` call → fan-out to ALL matching
 * active workflows for that Page in a single call (so two workflows watching
 * the same Page each fire, without cross-suppression — the dedup is per
 * EVENT, not per workflow).
 *
 * Non-`page` objects (e.g. Messenger `object: "user"`) are ignored — Slice
 * 3.FACEBOOK-5 ships Page feed triggers only.
 */

export interface FacebookDispatchSummary {
  /** True iff the payload's object was not "page" (ignored, quiet ack). */
  ignored: boolean;
  /** Page entries seen. */
  entries: number;
  /** Qualifying feed changes (post/comment adds) dispatched. */
  changes: number;
  /** Runs enqueued across all changes (after dedup + filter + state gate). */
  enqueued: number;
}

export async function dispatchFacebookPagePayload(
  body: FacebookWebhookBody,
): Promise<FacebookDispatchSummary> {
  if (!body || body.object !== "page" || !Array.isArray(body.entry)) {
    return { ignored: true, entries: 0, changes: 0, enqueued: 0 };
  }

  let changes = 0;
  let enqueued = 0;

  for (const entry of body.entry) {
    const pageId = entry?.id;
    if (typeof pageId !== "string" || pageId.length === 0) continue;
    const entryTime = entry.time;
    const list = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of list) {
      const kind = classifyFeedChange(change);
      if (kind === null) continue;
      const value = change.value!;
      const event =
        kind === "new_post"
          ? normalizeNewPost({ pageId, value, entryTime })
          : normalizeNewComment({ pageId, value, entryTime });
      changes += 1;
      const result = await dispatchTriggerEvent(event);
      enqueued += result.enqueued;
    }
  }

  return { ignored: false, entries: body.entry.length, changes, enqueued };
}
