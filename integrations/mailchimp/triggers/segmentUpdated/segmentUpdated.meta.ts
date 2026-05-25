import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:segment_updated` — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Watches a SINGLE configured segment for observable
 * state changes (name / member count / type / Mailchimp's
 * `updated_at`). Workflow authors who want to watch multiple segments
 * wire N copies, one per `segmentId` — V1's "watch all segments" mode
 * is intentionally not reproduced (unbounded snapshot risk; see the
 * schema's header comment).
 *
 * Activation registered via
 * `registerActivation("mailchimp", "segment_updated", activate)` —
 * seeds the observable-state snapshot (name / memberCount / updatedAt
 * / type) at activation time. First-poll-miss protection.
 *
 * **Audience → segment cascade.** Both fields are required:
 *   - `listId` (combobox, no deps) — picks the audience.
 *   - `segmentId` (combobox, dependsOn `listId`) — picks the segment
 *     inside that audience. Backed by the MAILCHIMP-2
 *     `mailchimp:segments` resolver which declares
 *     `requiredDeps: ["listId"]`.
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — `listId`,
 * `segmentId`, `name`, `memberCount`, `type`, `updatedAt`. The segment
 * name is sensitive (per the accepted MAILCHIMP-1 plan); identifiers,
 * counts, and type stay structural.
 */
export const mailchimpSegmentUpdatedTriggerMeta: TriggerMeta = {
  key: "mailchimp:segment_updated",
  provider: "mailchimp",
  type: "segment_updated",
  displayName: "Segment Updated",
  description:
    "Fires when a configured Mailchimp segment's observable state (name / member count / type / `updated_at`) changes between polls. Watches ONE segment — wire N copies for N segments. Polled via `GET /lists/{audienceId}/segments/{segmentId}`.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "listId",
      label: "Audience",
      description:
        "Mailchimp audience holding the segment. Required. Field name is `listId` — preserved from the trigger's runtime schema. Gates the segment picker below.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "segmentId",
      label: "Segment",
      description:
        "Segment to watch. Required. Gated on Audience — pick an audience first, then this picker fetches its segments. Backed by the `mailchimp:segments` resolver (`requiredDeps: [listId]`).",
      type: "combobox",
      optionsSource: "mailchimp:segments",
      dependsOn: "listId",
      required: true,
      placeholder: "Select Audience first",
    },
  ],
  payloadShape: [
    { name: "listId", type: "string", description: "Mailchimp audience id (echoed from config)." },
    { name: "segmentId", type: "string", description: "Mailchimp segment id (echoed from config)." },
    {
      name: "name",
      type: "string",
      description: "Segment name at observation time. `null` when omitted. Marked sensitive — may carry customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "memberCount",
      type: "number",
      description: "Segment member count at observation time. `null` when omitted.",
    },
    {
      name: "type",
      type: "string",
      description: "Segment type (`static` / `saved` / `fuzzy`). `null` when omitted.",
    },
    {
      name: "updatedAt",
      type: "string",
      description: "Mailchimp's `updated_at` timestamp at observation time (ISO-8601). `null` when omitted.",
    },
  ],
  displayOrder: 60,
};
