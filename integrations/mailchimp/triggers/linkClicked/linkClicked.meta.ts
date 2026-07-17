import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:link_clicked` — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Fires when Mailchimp records a new click on a
 * tracked link in a sent campaign. Optional filters: `campaignId`
 * (watch one campaign) + `url` (only fire on clicks on this exact
 * URL — Mailchimp returns the URL string verbatim in
 * `urls_clicked[]`).
 *
 * Activation registered in `index.ts` via
 * `registerActivation("mailchimp", "link_clicked", activate)` —
 * seeds the per-campaign `totalClicks` snapshot + `knownClicks` dedup
 * ledger.
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — campaign +
 * recipient identifiers + the URL that was clicked. `email` +
 * `subscriberId` are sensitive (PII / identifier); `campaignTitle` +
 * `subjectLine` are sensitive (author content); the clicked `url` is
 * sensitive (per-recipient click URLs can carry tracking tokens or
 * sensitive query params).
 */
export const mailchimpLinkClickedTriggerMeta: TriggerMeta = {
  key: "mailchimp:link_clicked",
  provider: "mailchimp",
  type: "link_clicked",
  displayName: "Link Clicked",
  description:
    "Fires when Mailchimp records a new click on a tracked link in a sent campaign. Optional `campaignId` + `url` filters narrow the trigger. Polled via Mailchimp's `/reports/{id}/click-details/{urlId}/members` endpoint with a per-(campaign, URL, recipient) dedup ledger.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "campaignId",
      label: "Campaign filter",
      description:
        "Optional. When set, only fires for clicks on this campaign. Leave empty to watch the most recent sent campaigns.",
      type: "combobox",
      optionsSource: "mailchimp:campaigns",
      required: false,
      placeholder: "Any recent sent campaign",
    },
    {
      name: "url",
      label: "Link filter",
      description:
        "Optional. Pick one of the campaign's tracked links to fire only for clicks on it, or leave empty to fire on any link. Choose the campaign above first — Mailchimp lists clicked links per campaign. The match is exact, so picking beats typing: a URL that differs by a trailing slash or a utm_ parameter never matches.",
      type: "combobox",
      optionsSource: "mailchimp:links",
      dependsOn: "campaignId",
      allowManualEntry: true,
      required: false,
      placeholder: "Any link",
    },
  ],
  payloadShape: [
    { name: "campaignId", type: "string", description: "Mailchimp campaign id the click is for." },
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
      description: "Recipient email that clicked. Marked sensitive — PII.",
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
      name: "url",
      type: "string",
      description:
        "The exact URL that was clicked. Marked sensitive — per-recipient click URLs can carry tracking tokens, session ids, or sensitive query params.",
      sensitive: true,
    },
    {
      name: "urlId",
      type: "string",
      description: "Mailchimp's internal id for the clicked URL (used to fetch click details).",
    },
    {
      name: "clicks",
      type: "number",
      description: "Number of clicks Mailchimp has tallied for this recipient on this URL. `null` when omitted.",
    },
  ],
  displayOrder: 40,
};
