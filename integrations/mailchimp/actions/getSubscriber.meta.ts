import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:get_subscriber`.
 *
 * Mirrors `getSubscriber.schema.ts` (2 required fields). Read-only:
 * fetches a single member projection (`subscriberId`, `email`, `status`,
 * `listId`, `mergeFields`, `tags`, `lastChanged`) so downstream nodes
 * can branch on subscriber state, route based on tags, or wire merge
 * fields into outbound templates.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 *
 * Sensitive outputs: `email` (PII + suspicious-name trigger),
 * `subscriberId` (per-list identifier), `mergeFields` (free-form member
 * profile data — name / phone / address per Mailchimp's standard merge
 * tags + any custom fields the workflow author may have wired
 * upstream), `tags` (categorical labels).
 */
export const mailchimpGetSubscriberMeta: ActionMeta = {
  key: "mailchimp:get_subscriber",
  provider: "mailchimp",
  type: "get_subscriber",
  displayName: "Get Subscriber",
  description:
    "Look up a single Mailchimp subscriber via `GET /lists/{id}/members/{hash}`. Returns the member's status, merge fields, and tags so downstream nodes can branch on subscriber state.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "audience_id",
      label: "Audience",
      description: "Mailchimp audience (list) holding the subscriber. Required.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "email",
      label: "Email",
      description: "Subscriber email. Required — used to derive the per-list subscriber hash for the API path.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
  ],
  outputs: [
    {
      name: "subscriberId",
      type: "string",
      description: "Mailchimp member id. Marked sensitive — per-list identifier.",
      sensitive: true,
    },
    {
      name: "email",
      type: "string",
      description: "Subscriber email. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Current Mailchimp status (`subscribed`, `pending`, `unsubscribed`, `cleaned`, `transactional`).",
    },
    {
      name: "listId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "mergeFields",
      type: "object",
      description:
        "Mailchimp merge-field map (e.g. `{ FNAME, LNAME, PHONE, ADDRESS, ... }`). Marked sensitive — carries member profile data including name / phone / address + any custom merge tags the audience defines.",
      sensitive: true,
    },
    {
      name: "tags",
      type: "array",
      description: "Tag names currently attached to this subscriber. Marked sensitive — categorical labels that may encode business logic.",
      sensitive: true,
    },
    {
      name: "lastChanged",
      type: "string",
      description: "Mailchimp `last_changed` timestamp (ISO-8601). `null` when omitted.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads a single Mailchimp subscriber. Returns PII (email, merge fields, tags) — surface those outputs through the workflow carefully.",
};
