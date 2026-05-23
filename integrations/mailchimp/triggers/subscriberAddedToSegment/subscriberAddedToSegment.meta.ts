import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:subscriber_added_to_segment`
 * — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Watches a SINGLE configured segment for new
 * subscriber additions. Each new `member.id` (subscriber hash) on
 * subsequent polls fires the trigger. V1's "all tags" mode is
 * intentionally not reproduced (per-tick request budget + payload
 * size blow up; see the schema's header comment).
 *
 * Activation registered via
 * `registerActivation("mailchimp", "subscriber_added_to_segment", activate)`
 * — snapshot of known subscriber hashes seeds the first poll.
 * First-poll-miss protection.
 *
 * **Audience → segment cascade.** Both fields are required and share
 * the same field names as `segment_updated`: `listId` (combobox) +
 * `segmentId` (combobox, dependsOn `listId`). Backed by
 * `mailchimp:audiences` + `mailchimp:segments` (the latter with
 * `requiredDeps: ["listId"]`).
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — `listId`,
 * `segmentId`, `subscriberHash`, `emailAddress`, `status`,
 * `lastChanged`. `emailAddress` + `subscriberHash` are sensitive
 * (PII / derived-from-PII per the accepted MAILCHIMP-1 plan).
 */
export const mailchimpSubscriberAddedToSegmentTriggerMeta: TriggerMeta = {
  key: "mailchimp:subscriber_added_to_segment",
  provider: "mailchimp",
  type: "subscriber_added_to_segment",
  displayName: "Subscriber Added to Segment",
  description:
    "Fires when a new subscriber appears in the configured Mailchimp segment between polls. Watches ONE segment — wire N copies for N segments. Polled via `GET /lists/{audienceId}/segments/{segmentId}/members` with a per-(segment, subscriberHash) dedup ledger.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "listId",
      label: "Audience",
      description:
        "Mailchimp audience holding the segment. Required. Field name is `listId` — preserved from the trigger's runtime schema.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "segmentId",
      label: "Segment",
      description:
        "Segment to watch for new members. Required. Gated on Audience — backed by `mailchimp:segments` (`requiredDeps: [listId]`).",
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
      name: "subscriberHash",
      type: "string",
      description:
        "Mailchimp's per-list subscriber hash (md5(lowercase(email))) for the new member. Marked sensitive — derives from PII.",
      sensitive: true,
    },
    {
      name: "emailAddress",
      type: "string",
      description: "Subscriber email address. `null` when omitted. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Mailchimp member status at observation time (`subscribed` / `pending` / etc.). `null` when omitted.",
    },
    {
      name: "lastChanged",
      type: "string",
      description: "Mailchimp `last_changed` timestamp (ISO-8601). `null` when omitted.",
    },
  ],
  displayOrder: 70,
};
