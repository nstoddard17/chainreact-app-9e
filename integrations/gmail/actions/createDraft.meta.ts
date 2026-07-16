import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:create_draft`.
 *
 * Mirrors `createDraft.schema.ts`. Same recipient + body shape as
 * `send_email` minus `labels` (V1 createGmailDraft never applied
 * labels — workflow authors who want to tag a draft chain
 * `create_draft → add_label` against the resulting messageId).
 *
 * Schema-level "at least one of textBody/htmlBody" is documented in
 * the description.
 *
 * Required scope: `gmail.compose`.
 *
 * Outputs match `createDraft.ts:79-88` exactly.
 */
export const createDraftMeta: ActionMeta = {
  key: "gmail:create_draft",
  provider: "gmail",
  type: "create_draft",
  displayName: "Create Draft",
  description:
    "Create a Gmail draft email (does not send). At least one of Text Body or HTML Body must be provided. Use Add Label downstream to tag the draft. Requires the gmail.compose scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "to",
      sensitivity: "recipient",
      label: "To",
      description: "Draft recipients. Press Enter or click Add to append each address.",
      type: "string-array",
      required: true,
      placeholder: "alice@example.com",
    },
    {
      name: "cc",
      sensitivity: "recipient",
      label: "Cc",
      description: "Optional Cc recipients.",
      type: "string-array",
      required: false,
      placeholder: "carbon-copy@example.com",
    },
    {
      name: "bcc",
      sensitivity: "recipient",
      label: "Bcc",
      description: "Optional Bcc recipients (not visible to other recipients).",
      type: "string-array",
      required: false,
      placeholder: "blind-copy@example.com",
    },
    {
      name: "subject",
      label: "Subject",
      description: "Draft subject line. May be empty.",
      type: "text",
      required: false,
      // Schema requires `subject` present (may be empty). Seed "" so the
      // builder writes the key — see sendEmail.meta.ts for the rationale.
      defaultValue: "",
      placeholder: "Re: project update",
    },
    {
      name: "textBody",
      label: "Text body",
      description:
        "Plain-text draft body. At least one of Text Body or HTML Body must be provided.",
      type: "textarea",
      required: false,
    },
    {
      name: "htmlBody",
      label: "HTML body",
      description:
        "HTML draft body. Sent as multipart/alternative alongside the text body when both are provided.",
      type: "textarea",
      required: false,
    },
    {
      name: "replyTo",
      sensitivity: "recipient",
      label: "Reply-To",
      description:
        "Optional Reply-To header. Accepts bare email or display-name form.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "reply-to-this@example.com",
    },
    {
      name: "signature",
      label: "Signature",
      description: "Optional signature added after the body.",
      type: "textarea",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    { name: "draftId", type: "string", description: "Gmail draft id." },
    { name: "messageId", type: "string", description: "Gmail message id wrapped by the draft." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "to", type: "array", description: "Echoes the resolved To recipients." },
    { name: "subject", type: "string", description: "Echoes the Subject." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
