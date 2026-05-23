import type { TriggerMeta } from "@/contracts/triggerMeta";
import { MAILCHIMP_ALLOWED_EVENT_TYPES } from "./allowedEventTypes";

/**
 * Builder-facing metadata for `mailchimp:audience_event` — Slice 3.MAILCHIMP-4.
 *
 * Consolidated Mailchimp audience webhook. ONE trigger meta covers
 * the 6 documented event types (`subscribe` / `unsubscribe` / `profile`
 * / `upemail` / `cleaned` / `campaign`). Workflows branch on
 * `payload.type` to discriminate. Field-name variance is preserved —
 * the config uses `audienceId` (camelCase) per the activation contract,
 * matching `activate.ts`'s `node.config.audienceId` read.
 *
 * Activation is webhook-shaped. `index.ts` calls
 * `registerActivation("mailchimp", "audience_event", activate)` so the
 * trigger-meta-activation-invariant test is satisfied without an
 * exemption.
 *
 * `eventTypes` is a `string-array` chip input — V1 used a multi-select
 * with the same allowlisted set. The chip placeholder + description
 * enumerate the 6 allowed values; activation rejects anything outside
 * the allowlist.
 *
 * `payloadShape` mirrors `normalize.ts:normalizeMailchimpEvent` —
 * `type`, `audienceId`, `email`, `subscriberHash`, `campaignId`,
 * `firedAt`, `parsed`. `email` is sensitive (PII + suspicious-name
 * trigger), `subscriberHash` is sensitive (derives from PII), and
 * `parsed` is sensitive (raw inbound form body — carries every
 * Mailchimp wire field that may include future PII surfaces).
 */
export const mailchimpAudienceEventTriggerMeta: TriggerMeta = {
  key: "mailchimp:audience_event",
  provider: "mailchimp",
  type: "audience_event",
  displayName: "Audience Event",
  description:
    "Fires when Mailchimp posts a webhook event for the configured audience. ONE trigger covers 6 event types (subscribe / unsubscribe / profile / upemail / cleaned / campaign) — workflows branch on `payload.type` to discriminate. The `eventTypes` field gates which event types this trigger reacts to (activation rejects anything outside the allowlist).",
  category: "marketing",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "audienceId",
      label: "Audience",
      description:
        "Mailchimp audience (list) to subscribe to. Required. Field name is `audienceId` (camelCase) — matches `activate.ts:node.config.audienceId`.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "eventTypes",
      label: "Event types",
      description:
        `Mailchimp event types to react to. Allowed values: ${MAILCHIMP_ALLOWED_EVENT_TYPES.join(", ")}. Chip-style entry; at least one required. Activation rejects anything outside this allowlist.`,
      type: "string-array",
      required: true,
      placeholder: "Add event type (e.g. subscribe, unsubscribe)…",
    },
  ],
  payloadShape: [
    {
      name: "type",
      type: "string",
      description:
        "The Mailchimp event type that fired (`subscribe` / `unsubscribe` / `profile` / `upemail` / `cleaned` / `campaign`). Use this to branch inside a single workflow that listens for multiple event types.",
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience (list) id the event is about. `null` when Mailchimp omits it (rare).",
    },
    {
      name: "email",
      type: "string",
      description: "Subscriber email address from Mailchimp's `data[email]` field. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "subscriberHash",
      type: "string",
      description:
        "Mailchimp's per-list subscriber hash (md5(lowercase(email))). Present on subscriber-style events (subscribe / unsubscribe / profile / upemail / cleaned); `null` on `campaign` events. Marked sensitive — derives from PII.",
      sensitive: true,
    },
    {
      name: "campaignId",
      type: "string",
      description:
        "Mailchimp campaign id. Only present on `campaign` events; `null` on subscriber-style events.",
    },
    {
      name: "firedAt",
      type: "string",
      description: "Mailchimp's fired-at timestamp (ISO-8601). `null` when omitted.",
    },
    {
      name: "parsed",
      type: "object",
      description:
        "Raw parsed Mailchimp form body (the full URL-decoded payload Mailchimp posted). Marked sensitive — carries every Mailchimp wire field including any forward-compatible PII surfaces. Prefer the bounded fields above when possible.",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
