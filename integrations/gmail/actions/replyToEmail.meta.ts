import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:reply_to_email`.
 *
 * Mirrors `replyToEmail.schema.ts`. The handler derives `To`, `Subject`
 * (with auto-prefixed `Re:` when subject is omitted), `In-Reply-To`,
 * `References`, and `threadId` from `originalMessageId`'s metadata
 * lookup — so the meta exposes only the optional override and
 * additional-recipient surface.
 *
 * Body fields follow the send_email convention. Schema-level "at least
 * one of textBody/htmlBody" is documented in the description; per-field
 * renderers can't gate cross-field requirements.
 *
 * Required scopes: `gmail.send` + `gmail.readonly`.
 *
 * Outputs match `replyToEmail.ts:100-109` exactly.
 */
export const replyToEmailMeta: ActionMeta = {
  key: "gmail:reply_to_email",
  provider: "gmail",
  type: "reply_to_email",
  displayName: "Reply to Email",
  description:
    "Send a reply to an existing Gmail message. The To recipient, threadId, In-Reply-To, and References headers are derived from the original message's metadata. Subject defaults to 'Re: <original>'. Requires gmail.send + gmail.readonly.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "originalMessageId",
      label: "Original message id",
      description:
        "Gmail message id of the email being replied to. Source from the new_email / new_labeled_email trigger payload or a search_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "subject",
      label: "Subject override (optional)",
      description:
        "When non-empty, OVERRIDES the auto-generated 'Re: <original-subject>'. Leave blank to use the auto prefix.",
      type: "text",
      required: false,
    },
    {
      name: "textBody",
      label: "Text body",
      description:
        "Plain-text reply body. At least one of Text Body or HTML Body must be provided.",
      type: "textarea",
      required: false,
    },
    {
      name: "htmlBody",
      label: "HTML body",
      description:
        "HTML reply body. Sent as multipart/alternative alongside the text body when both are provided.",
      type: "textarea",
      required: false,
    },
    {
      name: "cc",
      label: "Cc (additional)",
      description:
        "Additional Cc recipients ON TOP OF the derived reply-to-sender. Press Enter or click Add to append.",
      type: "string-array",
      required: false,
      placeholder: "alice@example.com",
    },
    {
      name: "bcc",
      label: "Bcc (additional)",
      description: "Additional Bcc recipients.",
      type: "string-array",
      required: false,
      placeholder: "blind-copy@example.com",
    },
    {
      name: "replyTo",
      label: "Reply-To",
      description:
        "Optional Reply-To header on the sent reply. Bare email or display-name form.",
      type: "text",
      required: false,
      placeholder: "reply-to-this@example.com",
    },
    {
      name: "signature",
      label: "Signature",
      description:
        "Optional signature appended with V1-faithful separators (text: blank line; HTML: two <br>).",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Gmail message id of the sent reply." },
    { name: "threadId", type: "string", description: "Gmail thread id (matches the original)." },
    { name: "labelIds", type: "array", description: "Label ids on the sent message." },
    { name: "replyingTo", type: "string", description: "Echoes the input originalMessageId." },
    { name: "subject", type: "string", description: "Final Subject used (override or auto-prefixed)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Sends external email reply — delivery is observable and cannot be recalled.",
};
