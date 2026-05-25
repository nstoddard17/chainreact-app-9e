import { z } from "zod";

/**
 * Zod schema for the Mailchimp `subscriber_added_to_segment` polling
 * trigger config — Mailchimp 2.1 Commit 3.
 *
 * Detects when a member is added to a configured segment. Mailchimp
 * has no webhook for segment/tag membership changes; polling
 * `/lists/{audienceId}/segments/{segmentId}/members` is the only path.
 *
 * **Both `listId` and `segmentId` are required.** V1 supported an
 * "all tags" mode that polled every static segment in the audience
 * (capped at 20); V2 intentionally does NOT reproduce that. Reason:
 *
 *   - "All tags" mode multiplies the per-tick request budget by the
 *     tag count and the per-segment payload size — V1 cap was 20 tags
 *     × up to 1000 members each = ~20k member objects to diff every
 *     5 minutes per workflow.
 *   - The bounded snapshot becomes a `{segmentId → memberEmails[]}`
 *     map that grows with both tag count and member count.
 *   - Workflow authors who want to react to ANY tag change can wire
 *     N copies of the single-segment trigger, one per segmentId.
 *
 * Snapshot shape: `knownSubscriberHashes` is the set of Mailchimp
 * `member.id` values (md5(lowercase(email))) present in the segment
 * at the most-recent poll. New ids on subsequent polls fire the
 * trigger. Stored as a sorted array for stable JSONB equality.
 *
 * Dedup key uses the (segmentId, subscriberHash) pair so the same
 * subscriber being added to two different segments fires both
 * triggers correctly.
 */
export const SubscriberAddedToSegmentConfigSchema = z.object({
  listId: z.string().min(1, "listId is required"),
  /**
   * Mailchimp's segment id is numeric on the wire but accepted as a
   * string in the URL path. We accept string input from the config
   * editor and forward verbatim.
   */
  segmentId: z.string().min(1, "segmentId is required"),
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      /**
       * Set of Mailchimp member ids (md5(lowercase(email))) present
       * in the segment at activation / last poll time. Sorted for
       * stable JSONB equality.
       */
      knownSubscriberHashes: z.array(z.string().min(1)),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});

export type SubscriberAddedToSegmentConfig = z.infer<
  typeof SubscriberAddedToSegmentConfigSchema
>;
