import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:new_audience` — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Fires when a NEW audience (list) appears in the
 * Mailchimp account that wasn't in the activation-time baseline.
 * No author-configurable fields — the trigger watches the whole
 * account.
 *
 * Mailchimp doesn't expose a list-created webhook; polling
 * `GET /lists` is the only path. Activation registered via
 * `registerActivation("mailchimp", "new_audience", activate)` —
 * snapshot of known list ids seeds the first poll.
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — `listId`, `name`,
 * `company` (from `contact.company`), `memberCount`, `dateCreated`.
 *
 * Sensitive markings: `name` (audience name — may carry customer-
 * identifying business data) + `company` (the audience's listed
 * company — also business data, leaks the targeted org).
 */
export const mailchimpNewAudienceTriggerMeta: TriggerMeta = {
  key: "mailchimp:new_audience",
  provider: "mailchimp",
  type: "new_audience",
  displayName: "New Audience",
  description:
    "Fires when a new audience (list) is created in the Mailchimp account. No author-configurable fields — watches the whole account. Polled via `GET /lists` because Mailchimp doesn't expose an audience-created webhook.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    { name: "listId", type: "string", description: "Mailchimp audience (list) id of the new audience." },
    {
      name: "name",
      type: "string",
      description: "Audience name. `null` when omitted. Marked sensitive — workflow authors may name audiences with customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "company",
      type: "string",
      description:
        "Audience's listed company (from Mailchimp's contact block). `null` when omitted. Marked sensitive — reveals the targeted organization.",
      sensitive: true,
    },
    {
      name: "memberCount",
      type: "number",
      description: "Member count at observation time. `0` for a freshly-created audience.",
    },
    {
      name: "dateCreated",
      type: "string",
      description: "Audience creation timestamp (ISO-8601). `null` when omitted.",
    },
  ],
  displayOrder: 50,
};
