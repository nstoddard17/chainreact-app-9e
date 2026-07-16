import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:add_subscriber`.
 *
 * Mirrors `addSubscriber.schema.ts` (12 fields). Required:
 * `audience_id`, `email`, `status`. `status` is the Q11 consent gate —
 * NO default; workflow authors must pick based on their opt-in process
 * (CAN-SPAM / GDPR implications). The remaining 9 fields (first_name,
 * last_name, phone, address, city, state, zip, country, tags) are
 * optional standard merge-field projections. `tags` is a CSV STRING
 * (not array) in V2 — V1 ships CSV input and V2 mirrors that shape
 * verbatim; switching to `string[]` is a future UI slice.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 * The picker carries no `requiredDeps`, so `audience_id` (snake_case
 * runtime field name preserved per the action schema) consumes it
 * directly.
 *
 * Outputs mirror `addSubscriber.ts:return` exactly. `email`,
 * `subscriberId`, and `tags` are marked sensitive — `email` IS PII (and
 * triggers the suspicious-name structural guard); `subscriberId` is
 * a Mailchimp-internal identifier that doubles as the per-list
 * dedup key for downstream actions; `tags` carry workflow-author
 * categorical labels that may encode business logic.
 *
 * Risk: medium — adds a subscriber to a list. Not destructive (additive),
 * but observable in the audience. The consent gate at the schema layer
 * (Q11) already forces an explicit `status` choice — no separate
 * `requiresConfirmation` because the schema is the gate.
 */
export const mailchimpAddSubscriberMeta: ActionMeta = {
  key: "mailchimp:add_subscriber",
  provider: "mailchimp",
  type: "add_subscriber",
  displayName: "Add Subscriber",
  description:
    "Add (or upsert) a subscriber to a Mailchimp audience via `PUT /lists/{id}/members/{hash}`. **`status` is REQUIRED with no default** — `subscribed` implies prior explicit consent (CAN-SPAM); `pending` triggers Mailchimp's double-opt-in confirmation email (GDPR-strict). `tags` is a COMMA-SEPARATED string (e.g. `vip,beta`) — V2 mirrors V1's CSV input shape.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "audience_id",
      label: "Audience",
      description:
        "Mailchimp audience (list) to add the subscriber to. Required. Picker sourced from `mailchimp:audiences`.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description: "Subscriber's email address. Required. Used to derive the per-list subscriber hash for the API path.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
    {
      name: "status",
      label: "Status",
      description:
        "**Q11 consent gate — REQUIRED with NO default.** `subscribed` implies prior explicit consent (CAN-SPAM violation if sent without). `pending` triggers Mailchimp's double-opt-in confirmation email (recommended for GDPR-strict use cases). Pick based on how this subscriber opted in.",
      type: "select",
      required: true,
      options: [
        { value: "subscribed", label: "Subscribed (explicit consent already obtained)" },
        { value: "pending", label: "Pending (double opt-in — Mailchimp emails the subscriber to confirm)" },
        { value: "unsubscribed", label: "Unsubscribed" },
        { value: "cleaned", label: "Cleaned (bounced / invalid)" },
        { value: "transactional", label: "Transactional (one-off; not promotional)" },
      ],
    },
    {
      name: "first_name",
      label: "First name",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "last_name",
      label: "Last name",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      sensitivity: "recipient",
      label: "Phone",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "address",
      sensitivity: "recipient",
      label: "Address",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "city",
      label: "City",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "state",
      label: "State / region",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "zip",
      label: "ZIP / postal code",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "country",
      label: "Country",
      description: "Optional. Saved to the subscriber's profile.",
      type: "text",
      required: false,
    },
    {
      name: "tags",
      label: "Tags",
      description:
        "Optional. **Comma-separated** tag names (e.g. `vip,beta,trial`). Mailchimp auto-creates tags that don't already exist. V2 mirrors V1's CSV input shape — string-array is a future UI slice.",
      type: "text",
      required: false,
      placeholder: "vip,beta,trial",
    },
  ],
  outputs: [
    {
      name: "subscriberId",
      type: "string",
      description: "Mailchimp member id — stable per-list identifier. Marked sensitive — doubles as the dedup key for downstream actions.",
      sensitive: true,
    },
    {
      name: "email",
      type: "string",
      description: "Echoed subscriber email from Mailchimp's response. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Final Mailchimp status after the upsert (e.g. `subscribed`, `pending`).",
    },
    {
      name: "listId",
      type: "string",
      description: "Mailchimp audience id the subscriber landed in (echoed).",
    },
    {
      name: "timestamp",
      type: "string",
      description: "Subscriber's opt-in timestamp (ISO-8601). Falls back to `now()` when Mailchimp omits it.",
    },
    {
      name: "tags",
      type: "array",
      description: "Mailchimp-resolved tag names attached to this subscriber. Marked sensitive — categorical labels that may encode business logic.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Adds a subscriber to a Mailchimp audience. Schema gates explicit `status` choice (Q11) so CAN-SPAM / GDPR consent state is intentional.",
};
