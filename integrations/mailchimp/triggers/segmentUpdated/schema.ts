import { z } from "zod";

/**
 * Zod schema for the Mailchimp `segment_updated` polling trigger
 * config — Mailchimp 2.1 Commit 3.
 *
 * Detects when a configured segment's observable state changes.
 * Mailchimp has no webhook for segment lifecycle; polling
 * `GET /lists/{audienceId}/segments/{segmentId}` is the only path.
 *
 * **Both `listId` and `segmentId` are required.** V1's
 * `pollSegmentUpdated` watched ALL segments in an audience and fired
 * on any change. V2 narrows to a single configured segment — workflow
 * authors who want to react to changes across multiple segments wire
 * N copies, one per segmentId. Reasons:
 *   - Bounded snapshot size (V1's `{segmentId → {name, memberCount,
 *     updatedAt, type}}` map grew with segment count).
 *   - Per-tick API budget stays constant (one GET, not N).
 *   - Audit §12 R3: avoid unbounded snapshots in polling triggers.
 *
 * Observable state for the change-detection hash:
 *   - `name` — Mailchimp segment display name.
 *   - `memberCount` — segment population (changes when members
 *     are added/removed).
 *   - `updatedAt` — Mailchimp's own change timestamp; primary
 *     observation signal.
 *   - `type` — `static` / `saved` / `fuzzy`. Rarely changes but
 *     captured for completeness.
 *
 * The snapshot stores the most-recently-observed values. The poll
 * fires only when ANY of those four observable fields differs from
 * the snapshot.
 */
export const SegmentUpdatedConfigSchema = z.object({
  listId: z.string().min(1, "listId is required"),
  segmentId: z.string().min(1, "segmentId is required"),
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      name: z.string().nullable(),
      memberCount: z.number().nullable(),
      updatedAt: z.string().nullable(),
      type: z.string().nullable(),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});

export type SegmentUpdatedConfig = z.infer<typeof SegmentUpdatedConfigSchema>;
