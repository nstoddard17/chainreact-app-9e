import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:update_subscriber`.
 *
 * Mirrors `updateSubscriber.schema.ts` (12 fields). Required:
 * `audience_id`, `email`. `email` derives the subscriber hash for the
 * URL path — Mailchimp PATCH semantics mean any field omitted from
 * config is left untouched on the Mailchimp side. `status` is
 * intentionally OPTIONAL here (unlike `add_subscriber` where it's the
 * Q11 consent gate) — updating profile fields without changing status
 * is the common case; when supplied, it ships verbatim.
 *
 * `new_email` triggers Mailchimp's email-change workflow and fires
 * `upemail` webhooks; documented in the field description so workflow
 * authors know the side effect.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 *
 * Outputs mirror `updateSubscriber.ts:return` exactly — same projection
 * as `get_subscriber` minus `mergeFields`/`tags` (PATCH response
 * carries only the changed surface). `email` + `subscriberId` are
 * marked sensitive for the same reasons as `add_subscriber`.
 *
 * Risk: medium — modifies subscriber state on a marketing list. Not
 * destructive (reversible — re-run with old values).
 */
export const mailchimpUpdateSubscriberMeta: ActionMeta = {
  key: "mailchimp:update_subscriber",
  provider: "mailchimp",
  type: "update_subscriber",
  displayName: "Update Subscriber",
  description:
    "Update a Mailchimp subscriber's profile / status via `PATCH /lists/{id}/members/{hash}`. PATCH semantics — only fields you set are written; everything else is left untouched. Use `email` to identify the subscriber and `new_email` to change their address (triggers Mailchimp's `upemail` webhook).",
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
      description: "Current subscriber email. Required — used to derive the per-list subscriber hash for the API path.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
    {
      name: "new_email",
      label: "New email",
      description:
        "Optional. Change the subscriber's email address. Triggers Mailchimp's `upemail` webhook downstream.",
      type: "text",
      required: false,
    },
    {
      name: "status",
      label: "Status",
      description:
        "Optional. Change the subscriber's status. Leave empty to keep the current status. Same enum as `add_subscriber` — no default; setting it deliberately changes consent state.",
      type: "select",
      required: false,
      options: [
        { value: "subscribed", label: "Subscribed" },
        { value: "pending", label: "Pending (double opt-in)" },
        { value: "unsubscribed", label: "Unsubscribed" },
        { value: "cleaned", label: "Cleaned (bounced / invalid)" },
        { value: "transactional", label: "Transactional" },
      ],
    },
    {
      name: "first_name",
      label: "First name",
      description: "Optional. Maps to Mailchimp's `FNAME` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "last_name",
      label: "Last name",
      description: "Optional. Maps to Mailchimp's `LNAME` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      label: "Phone",
      description: "Optional. Maps to Mailchimp's `PHONE` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "address",
      label: "Address",
      description: "Optional. Maps to Mailchimp's `ADDRESS` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "city",
      label: "City",
      description: "Optional. Maps to Mailchimp's `CITY` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "state",
      label: "State / region",
      description: "Optional. Maps to Mailchimp's `STATE` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "zip",
      label: "ZIP / postal code",
      description: "Optional. Maps to Mailchimp's `ZIP` merge tag.",
      type: "text",
      required: false,
    },
    {
      name: "country",
      label: "Country",
      description: "Optional. Maps to Mailchimp's `COUNTRY` merge tag.",
      type: "text",
      required: false,
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
      description: "Subscriber email after the update (reflects `new_email` if set). Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Mailchimp status after the update.",
    },
    {
      name: "listId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "lastChanged",
      type: "string",
      description: "Mailchimp `last_changed` timestamp (ISO-8601). `null` when Mailchimp omits it.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a Mailchimp subscriber's profile or status. Reversible by re-running with the previous values.",
};
