import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:create_custom_event`.
 *
 * Mirrors `createCustomEvent.schema.ts`. Records a custom event for a
 * Mailchimp subscriber — Mailchimp can later use these events to drive
 * automation triggers. **ChainReact writes the event row; downstream
 * send behavior is Mailchimp's responsibility** — we do NOT classify
 * this action high merely because Mailchimp may eventually fire a
 * journey off the event.
 *
 * `event_name` follows Mailchimp's documented regex
 * `/^[a-z][a-z0-9_]{0,29}$/` — lowercase, starts with a letter, max 30
 * chars. Description spells this out so authors don't trial-and-error
 * the constraint.
 *
 * `properties` is an OPTIONAL `Record<string, string>` — the meta
 * exposes it as `keyvalue` (V2's first-class type for string-to-string
 * maps).
 *
 * `occurred_at` is an optional ISO-8601 timestamp; when omitted, the
 * handler uses `now()`.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 *
 * Sensitive outputs: `subscriberEmail` (PII — not in the suspicious-name
 * set, but marked sensitive per the plan). `eventName`, `audienceId`,
 * `occurredAt`, `success` are structural.
 *
 * Risk: medium — writes a custom event that Mailchimp may use to fire
 * downstream automations. Workflow authors should know the event is
 * persistent on Mailchimp's side; not destructive but not silently
 * reversible either.
 */
export const mailchimpCreateCustomEventMeta: ActionMeta = {
  key: "mailchimp:create_custom_event",
  provider: "mailchimp",
  type: "create_custom_event",
  displayName: "Create Custom Event",
  description:
    "Record a custom event for a Mailchimp subscriber via `POST /lists/{id}/members/{hash}/events`. Mailchimp can use the event to fire downstream journey automations the workflow author has configured in Mailchimp. `event_name` is constrained: lowercase, starts with a letter, alphanumeric + underscores only, max 30 chars.",
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
      description: "Subscriber email. Required.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
    {
      name: "event_name",
      label: "Event name",
      description:
        "Required. Mailchimp constraints: lowercase, starts with a letter, alphanumeric + underscores only, max 30 chars. Example: `purchased_pro_plan`, `clicked_demo_cta`.",
      type: "text",
      required: true,
      placeholder: "clicked_demo_cta",
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "Optional key/value map of event metadata (e.g. `{\"plan\":\"pro\",\"amount\":\"99\"}`). All values must be strings.",
      type: "keyvalue",
      required: false,
    },
    {
      name: "occurred_at",
      label: "Occurred at",
      description: "Optional ISO-8601 timestamp for when the event happened. Defaults to `now()` when omitted.",
      type: "text",
      required: false,
      placeholder: "2026-05-23T14:00:00Z",
    },
    {
      name: "is_syncing",
      label: "Sync mode",
      description:
        "Optional. When `true`, marks this event as part of a sync — Mailchimp suppresses any downstream automation triggers for it. Use during bulk backfills.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    {
      name: "success",
      type: "boolean",
      description: "Always `true` on a successful 204 response from Mailchimp.",
    },
    {
      name: "eventName",
      type: "string",
      description: "Echoed event name (workflow-author-supplied).",
    },
    {
      name: "subscriberEmail",
      type: "string",
      description: "Subscriber email the event was recorded against. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "occurredAt",
      type: "string",
      description: "Event timestamp (echoes input or falls back to `now()`).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Records a custom event on a Mailchimp subscriber. Mailchimp may use the event to fire downstream journey automations — review Mailchimp-side automation triggers if relevant.",
};
