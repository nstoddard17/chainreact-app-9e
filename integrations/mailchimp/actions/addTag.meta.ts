import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:add_tag`.
 *
 * Mirrors `addTag.schema.ts` (3 required fields). `tags` is a non-empty
 * STRING ARRAY (z.array(z.string().min(1)).min(1)) — NOT a CSV string.
 * V2 schema landed it as `string[]` from day one; only
 * `add_subscriber.tags` carries the legacy CSV shape. The meta exposes
 * `tags` as a `string-array` field so the builder UI renders the
 * chip-input the array type provides.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver;
 * the subscriber picker uses `mailchimp:members` (dependsOn
 * `audience_id`, whose resolver value IS the member email string the
 * schema stores) with `allowManualEntry` so an unlisted / upstream-wired
 * email still commits.
 *
 * Sensitive outputs: `email` (PII), `addedTags` (categorical labels —
 * symmetric with `add_subscriber.tags`).
 *
 * Risk: medium — modifies tag set on an existing subscriber (additive
 * mutation). Reversible via `remove_tag`.
 */
export const mailchimpAddTagMeta: ActionMeta = {
  key: "mailchimp:add_tag",
  provider: "mailchimp",
  type: "add_tag",
  displayName: "Add Tag",
  description:
    "Attach one or more tags to a Mailchimp subscriber via `POST /lists/{id}/members/{hash}/tags` with `status: active`. Mailchimp auto-creates tags that don't already exist.",
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
      sensitivity: "recipient",
      label: "Email",
      description:
        "Subscriber to tag — pick a member of the selected audience, or type/wire an email. Required.",
      type: "combobox",
      optionsSource: "mailchimp:members",
      dependsOn: "audience_id",
      allowManualEntry: true,
      required: true,
      placeholder: "Select or type a subscriber email",
    },
    {
      name: "tags",
      label: "Tags",
      description:
        "One or more tag names to add. Mailchimp auto-creates tags that don't exist. **Array input** — chip-style entry, NOT comma-separated.",
      type: "string-array",
      required: true,
      placeholder: "Add tag…",
    },
  ],
  outputs: [
    {
      name: "email",
      type: "string",
      description: "Echoed subscriber email. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "addedTags",
      type: "array",
      description: "Tag names submitted to Mailchimp (echoed from input). Marked sensitive — categorical labels.",
      sensitive: true,
    },
    {
      name: "addedAt",
      type: "string",
      description: "Timestamp of the add (ISO-8601). ChainReact-generated since Mailchimp returns 204 No Content.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Attaches tags to a Mailchimp subscriber. Reversible via `remove_tag`.",
};
