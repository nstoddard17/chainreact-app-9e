import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:email_opened` — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Fires when Mailchimp records a new open for a sent
 * campaign. Optional `campaignId` filter — when set, the trigger
 * watches one specific campaign; when omitted, it watches the most
 * recent sent campaigns per Mailchimp's default ordering.
 *
 * Activation registered in `index.ts` via
 * `registerActivation("mailchimp", "email_opened", activate)` —
 * seeds the per-campaign `totalOpens` snapshot + `knownOpens` dedup
 * ledger so the first poll doesn't replay historical opens.
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — campaign identifiers
 * + author/subject content + the recipient email + Mailchimp's
 * per-subscriber open metadata. `email` + `subscriberId` are sensitive
 * (PII / identifier); `campaignTitle` + `subjectLine` are sensitive
 * (author-supplied content).
 */
export const mailchimpEmailOpenedTriggerMeta: TriggerMeta = {
  key: "mailchimp:email_opened",
  provider: "mailchimp",
  type: "email_opened",
  displayName: "Email Opened",
  description:
    "Fires when Mailchimp records a new open for a sent campaign. Optional `campaignId` filter narrows the trigger to a single campaign. Polled via Mailchimp's `/reports/{id}/open-details` endpoint with a per-(campaign, recipient) dedup ledger.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "campaignId",
      label: "Campaign filter",
      description:
        "Optional. When set, only fires for opens on this campaign. Leave empty to watch the most recent sent campaigns per Mailchimp's default ordering.",
      type: "combobox",
      optionsSource: "mailchimp:campaigns",
      required: false,
      placeholder: "Any recent sent campaign",
    },
  ],
  payloadShape: [
    { name: "campaignId", type: "string", description: "Mailchimp campaign id the open is for." },
    {
      name: "campaignTitle",
      type: "string",
      description: "Authored campaign title at fire time. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "subjectLine",
      type: "string",
      description: "Recipient-facing subject line. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "email",
      type: "string",
      description: "Recipient email that opened the campaign. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "subscriberId",
      type: "string",
      description:
        "Mailchimp's `email_id` (md5(lowercase(email))) for the recipient. `null` when omitted. Marked sensitive — derives from PII.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience (list) id the campaign targeted. `null` when omitted.",
    },
    {
      name: "openTime",
      type: "string",
      description: "Most-recent open timestamp Mailchimp returned for this recipient (ISO-8601). Mailchimp returns up to 5 timestamps DESC; this is the first.",
    },
    {
      name: "opensCount",
      type: "number",
      description: "Number of opens Mailchimp has tallied for this recipient on this campaign. `null` when omitted.",
    },
  ],
  displayOrder: 30,
};
