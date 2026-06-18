import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:remove_tag`.
 *
 * Mirrors `removeTag.schema.ts` (3 required fields). `tags` is a
 * non-empty STRING ARRAY — same shape as `add_tag`. Mailchimp accepts
 * the same `/tags` endpoint with `status: inactive` to detach.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 *
 * Risk: medium — removes tags from an existing subscriber (subtractive
 * mutation). Reversible via `add_tag`. NOT destructive — the subscriber
 * record is unchanged; only the tag association is detached.
 */
export const mailchimpRemoveTagMeta: ActionMeta = {
  key: "mailchimp:remove_tag",
  provider: "mailchimp",
  type: "remove_tag",
  displayName: "Remove Tag",
  description:
    "Detach one or more tags from a Mailchimp subscriber via `POST /lists/{id}/members/{hash}/tags` with `status: inactive`. The tag itself is not deleted from the audience; only the per-subscriber association is removed.",
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
      description: "Subscriber email. Required.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
    {
      name: "tags",
      label: "Tags",
      description:
        "One or more tag names to remove. **Array input** — chip-style entry, NOT comma-separated.",
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
      name: "removedTags",
      type: "array",
      description: "Tag names submitted to Mailchimp (echoed from input). Marked sensitive — categorical labels.",
      sensitive: true,
    },
    {
      name: "removedAt",
      type: "string",
      description: "Timestamp of the remove (ISO-8601). ChainReact-generated since Mailchimp returns 204 No Content.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Detaches tags from a Mailchimp subscriber. Reversible via `add_tag`. The subscriber record itself is unchanged.",
};
