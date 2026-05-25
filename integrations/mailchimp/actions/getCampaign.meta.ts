import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:get_campaign`.
 *
 * Mirrors `getCampaign.schema.ts` (1 required field). Read-only; pure
 * GET /campaigns/{campaignId}. Picker uses the MAILCHIMP-2
 * `mailchimp:campaigns` resolver — workflow authors pick by
 * authored title rather than typing the opaque id.
 *
 * Outputs mirror `getCampaign.ts:return` exactly, including the
 * nested `settings` + `recipients` sub-objects (declared via
 * `OutputMeta.fields`).
 *
 * Sensitive markings — every campaign-content field surfaces here.
 * Mailchimp doesn't return raw HTML on the campaign GET (that's a
 * separate endpoint not exposed in V2 Batch 1), but the campaign's
 * authored title / subject line / preview text / from-name / reply-to
 * + the archive URLs ARE returned and carry author / recipient-facing
 * content per the accepted MAILCHIMP-1 plan. The `recipients.listId` +
 * `listName` reveal the targeted audience — also sensitive.
 *
 * Risk: low — read-only metadata lookup. No customer-facing side
 * effect.
 */
export const mailchimpGetCampaignMeta: ActionMeta = {
  key: "mailchimp:get_campaign",
  provider: "mailchimp",
  type: "get_campaign",
  displayName: "Get Campaign",
  description:
    "Look up a single Mailchimp campaign via `GET /campaigns/{campaignId}`. Returns the campaign's settings (title, subject, sender), recipients (audience id + name + count), status, archive URLs, and send-time metadata. Use this to inspect a campaign authored in Mailchimp before branching on its state or wiring its metadata into a downstream action.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "campaignId",
      label: "Campaign",
      description:
        "Mailchimp campaign to read. Required. Picker sourced from `mailchimp:campaigns` — sorted newest-first by `create_time`.",
      type: "combobox",
      optionsSource: "mailchimp:campaigns",
      required: true,
      placeholder: "Search campaigns…",
    },
  ],
  outputs: [
    {
      name: "campaignId",
      type: "string",
      description: "Mailchimp campaign id (echoed).",
    },
    {
      name: "webId",
      type: "number",
      description: "Mailchimp web id (dashboard URL component). `null` when omitted.",
    },
    {
      name: "type",
      type: "string",
      description: "Mailchimp campaign type (`regular`, `plaintext`, `absplit`, `rss`, `variate`).",
    },
    {
      name: "status",
      type: "string",
      description: "Campaign status (`save` / `paused` / `schedule` / `sending` / `sent`).",
    },
    {
      name: "createTime",
      type: "string",
      description: "Campaign creation timestamp (ISO-8601). `null` when omitted.",
    },
    {
      name: "sendTime",
      type: "string",
      description: "Campaign send timestamp (ISO-8601). `null` when the campaign has not been sent.",
    },
    {
      name: "archiveUrl",
      type: "string",
      description:
        "Public-facing archive URL for the campaign. Marked sensitive — leaks the campaign content to anyone with the URL.",
      sensitive: true,
    },
    {
      name: "longArchiveUrl",
      type: "string",
      description: "Longer-form public archive URL. Marked sensitive for the same reason.",
      sensitive: true,
    },
    {
      name: "emailsSent",
      type: "number",
      description: "Number of emails Mailchimp sent for this campaign. `0` for unsent campaigns.",
    },
    {
      name: "contentType",
      type: "string",
      description: "Content type (typically `template`). `null` when omitted.",
    },
    {
      name: "settings",
      type: "object",
      description: "Authored campaign settings — title (internal label), subject line + preview text (recipient-facing), sender name + reply-to. Marked sensitive — carries author + recipient-facing content.",
      sensitive: true,
      fields: [
        { name: "title", type: "string", description: "Author's internal title. `null` when omitted." },
        { name: "subjectLine", type: "string", description: "Recipient-facing subject line. `null` when omitted." },
        { name: "previewText", type: "string", description: "Recipient-facing preview text. `null` when omitted." },
        { name: "fromName", type: "string", description: "Sender display name. `null` when omitted." },
        { name: "replyTo", type: "string", description: "Reply-to address. `null` when omitted." },
      ],
    },
    {
      name: "recipients",
      type: "object",
      description:
        "Recipients block — the targeted audience id + name + recipient count. Marked sensitive — the audience name reveals the targeted segment.",
      sensitive: true,
      fields: [
        { name: "listId", type: "string", description: "Mailchimp audience (list) id the campaign targeted. `null` when omitted." },
        { name: "listName", type: "string", description: "Audience name. `null` when omitted." },
        { name: "recipientCount", type: "number", description: "Mailchimp's count of recipients for this campaign. `0` when omitted." },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads Mailchimp campaign metadata. No customer-facing side effect; output surfaces campaign content + audience targeting.",
};
