import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:get_campaign_stats`.
 *
 * Mirrors `getCampaignStats.schema.ts` (1 required field). Read-only;
 * pure GET /reports/{campaignId}. Picker uses the MAILCHIMP-2
 * `mailchimp:campaigns` resolver (same picker as `get_campaign`).
 *
 * Outputs mirror `getCampaignStats.ts:return` exactly, including the
 * nested `opens` / `clicks` / `bounces` / `forwards` / `industryStats`
 * sub-objects. The per-campaign aggregate counts (opensTotal,
 * clicksTotal, bounces, forwards) are marked sensitive per the
 * accepted MAILCHIMP-1 plan — they reveal recipient engagement levels
 * that workflow authors may not want flowing through downstream nodes
 * in plain form. Industry benchmark rates are NOT sensitive (they're
 * Mailchimp's aggregate industry stats, not customer data).
 *
 * Unsent campaigns: Mailchimp returns 404 → the handler propagates as
 * NotFoundError. Workflow authors branch on the error rather than
 * receiving a partial / zero-filled report (parity with
 * `get_subscriber` / `get_campaign`).
 *
 * Risk: low — read-only metadata lookup. No customer-facing side
 * effect.
 */
export const mailchimpGetCampaignStatsMeta: ActionMeta = {
  key: "mailchimp:get_campaign_stats",
  provider: "mailchimp",
  type: "get_campaign_stats",
  displayName: "Get Campaign Stats",
  description:
    "Fetch Mailchimp send + engagement stats for a campaign via `GET /reports/{campaignId}`. Returns aggregate opens / clicks / bounces / forwards counts + industry-benchmark rates. Unsent campaigns return a NotFoundError — branch on the error rather than expecting zero-filled stats.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "campaignId",
      label: "Campaign",
      description:
        "Mailchimp campaign to read stats for. Required. Picker sourced from `mailchimp:campaigns`. Note: Mailchimp only returns a report for SENT campaigns — unsent ids return a `NotFoundError`.",
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
      name: "emailsSent",
      type: "number",
      description: "Total number of recipients Mailchimp sent the campaign to.",
    },
    {
      name: "abuseReports",
      type: "number",
      description: "Count of abuse / spam reports filed against this campaign.",
    },
    {
      name: "unsubscribed",
      type: "number",
      description: "Count of recipients who unsubscribed as a result of this campaign.",
    },
    {
      name: "sendTime",
      type: "string",
      description: "Send timestamp (ISO-8601). `null` when omitted.",
    },
    {
      name: "opens",
      type: "object",
      description:
        "Open-event aggregates — `opensTotal` (raw open count, multi-counting per recipient) + `uniqueOpens` (deduplicated by recipient). Marked sensitive — reveals recipient engagement levels.",
      sensitive: true,
      fields: [
        { name: "opensTotal", type: "number", description: "Total opens (multi-counting per recipient)." },
        { name: "uniqueOpens", type: "number", description: "Unique opens (deduplicated by recipient)." },
      ],
    },
    {
      name: "clicks",
      type: "object",
      description:
        "Click-event aggregates — `clicksTotal` + `uniqueClicks`. Marked sensitive — reveals recipient engagement levels.",
      sensitive: true,
      fields: [
        { name: "clicksTotal", type: "number", description: "Total clicks across all links + recipients." },
        { name: "uniqueClicks", type: "number", description: "Unique recipients who clicked at least one link." },
      ],
    },
    {
      name: "bounces",
      type: "object",
      description:
        "Bounce aggregates — `hardBounces` (permanent failure) + `softBounces` (transient failure). Marked sensitive — reveals deliverability state of the recipient list.",
      sensitive: true,
      fields: [
        { name: "hardBounces", type: "number", description: "Permanent delivery failures." },
        { name: "softBounces", type: "number", description: "Transient delivery failures." },
      ],
    },
    {
      name: "forwards",
      type: "object",
      description:
        "Forward aggregates — `forwardsCount` + `forwardsOpens`. Marked sensitive — reveals downstream sharing behavior.",
      sensitive: true,
      fields: [
        { name: "forwardsCount", type: "number", description: "Count of forward actions Mailchimp tracked." },
        { name: "forwardsOpens", type: "number", description: "Opens that resulted from forwards." },
      ],
    },
    {
      name: "industryStats",
      type: "object",
      description:
        "Industry-benchmark rates Mailchimp publishes for the audience's industry vertical. Aggregate-only — NOT customer data. `null` when Mailchimp omits the block.",
      fields: [
        { name: "type", type: "string", description: "Industry vertical Mailchimp categorized the audience under." },
        { name: "openRate", type: "number", description: "Industry-average open rate (0–1)." },
        { name: "clickRate", type: "number", description: "Industry-average click rate (0–1)." },
        { name: "bounceRate", type: "number", description: "Industry-average bounce rate (0–1)." },
        { name: "unopenRate", type: "number", description: "Industry-average unopen rate (0–1)." },
        { name: "unsubRate", type: "number", description: "Industry-average unsubscribe rate (0–1)." },
        { name: "abuseRate", type: "number", description: "Industry-average abuse-report rate (0–1)." },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads Mailchimp campaign engagement stats. No customer-facing side effect; outputs reveal recipient engagement levels.",
};
