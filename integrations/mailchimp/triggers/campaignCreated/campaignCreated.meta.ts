import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `mailchimp:campaign_created` — Slice 3.MAILCHIMP-4.
 *
 * Polling trigger. Fires when a NEW campaign appears in the Mailchimp
 * account that wasn't in the activation-time baseline. Optional
 * filters: `audienceId` (only fire on campaigns scoped to that
 * audience) + `status` (only fire on campaigns in the matching state).
 *
 * Activation registered in `index.ts` via
 * `registerActivation("mailchimp", "campaign_created", activate)` —
 * seeds the snapshot of known campaign ids so the first poll doesn't
 * historical-fire (first-poll-miss protection per CLAUDE.md). The
 * activation-registry invariant test is satisfied.
 *
 * Internal polling state (`pollingEnabled`, `snapshot`, `polling`) is
 * NOT surfaced as a meta field — those are server-managed and live on
 * `trigger_resources.config`.
 *
 * `payloadShape` mirrors `poll.ts:event.payload` — campaign metadata
 * (`campaignId`, `type`, `status`, `sendTime`, `createTime`) +
 * author/recipient content (`title`, `subjectLine`, `fromName`,
 * `replyTo`) + audience identifiers (`audienceId`, `audienceName`).
 *
 * Sensitive markings — author + recipient-facing content
 * (`title`/`subjectLine`/`fromName`/`replyTo`) and the audience name
 * are sensitive per the accepted MAILCHIMP-1 plan.
 */
export const mailchimpCampaignCreatedTriggerMeta: TriggerMeta = {
  key: "mailchimp:campaign_created",
  provider: "mailchimp",
  type: "campaign_created",
  displayName: "Campaign Created",
  description:
    "Fires when a new Mailchimp campaign is created in the account. Optional `audienceId` + `status` filters narrow the trigger. Polled by the V2 polling cron — first-poll baseline is seeded at activation time so already-existing campaigns do NOT fire historically.",
  category: "marketing",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "audienceId",
      label: "Audience filter",
      description:
        "Optional. When set, only fires for campaigns scoped to the chosen audience. Leave empty to fire for any audience.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: false,
      placeholder: "Any audience",
    },
    {
      name: "status",
      label: "Status filter",
      description:
        "Optional. When set, only fires for campaigns in the matching state. Leave empty to fire on any newly-created campaign regardless of state.",
      type: "select",
      required: false,
      options: [
        { value: "save", label: "Draft (`save`)" },
        { value: "paused", label: "Paused" },
        { value: "schedule", label: "Scheduled" },
        { value: "sending", label: "Sending" },
        { value: "sent", label: "Sent" },
      ],
    },
  ],
  payloadShape: [
    { name: "campaignId", type: "string", description: "Mailchimp campaign id." },
    { name: "type", type: "string", description: "Campaign type (`regular` / `plaintext` / `absplit` / `rss` / `variate`). `null` when omitted." },
    { name: "status", type: "string", description: "Campaign status at fire time. `null` when omitted." },
    {
      name: "title",
      type: "string",
      description: "Authored campaign title. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "subjectLine",
      type: "string",
      description: "Recipient-facing subject line. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "fromName",
      type: "string",
      description: "Sender display name. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "replyTo",
      type: "string",
      description: "Reply-to address. `null` when omitted. Marked sensitive — author-supplied content.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Targeted audience id (echoes `recipients.list_id`). `null` when omitted.",
    },
    {
      name: "audienceName",
      type: "string",
      description:
        "Targeted audience name. `null` when omitted. Marked sensitive — workflow authors may name audiences with customer-identifying business data.",
      sensitive: true,
    },
    { name: "sendTime", type: "string", description: "Send timestamp (ISO-8601). `null` for unsent campaigns." },
    { name: "createTime", type: "string", description: "Create timestamp (ISO-8601). `null` when omitted." },
  ],
  displayOrder: 20,
};
