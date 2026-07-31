import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:create_draft_reply`.
 *
 * Mirrors `createDraftReply.schema.ts`. Identical shape to
 * `reply_to_email` — the only behavioral difference at the handler
 * level is the terminal API call (`users.drafts.create` instead of
 * `users.messages.send`).
 *
 * Required scopes: `gmail.compose` + `gmail.readonly`.
 *
 * Outputs match `createDraftReply.ts:105-114` exactly.
 */
export const createDraftReplyMeta: ActionMeta = {
  key: "gmail:create_draft_reply",
  provider: "gmail",
  type: "create_draft_reply",
  displayName: "Create Draft Reply",
  description:
    "Create a Gmail draft reply to an existing message (does not send). The To recipient, threadId, In-Reply-To, and References headers are derived from the original message's metadata. Subject defaults to 'Re: <original>'. Requires gmail.compose + gmail.readonly.",
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
      sensitivity: "recipient",
      label: "Cc (additional)",
      description:
        "Additional Cc recipients ON TOP OF the derived reply-to-sender.",
      type: "string-array",
      required: false,
      placeholder: "alice@example.com",
    },
    {
      name: "bcc",
      sensitivity: "recipient",
      label: "Bcc (additional)",
      description: "Additional Bcc recipients.",
      type: "string-array",
      required: false,
      placeholder: "blind-copy@example.com",
    },
    {
      name: "replyTo",
      sensitivity: "recipient",
      label: "Reply-To",
      description: "Optional Reply-To header on the draft.",
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
    { name: "threadId", type: "string", description: "Gmail thread id (matches the original)." },
    { name: "replyingTo", type: "string", description: "Echoes the input originalMessageId." },
    { name: "subject", type: "string", description: "Final Subject used (override or auto-prefixed)." },
  ],
  // WORKFLOW-LIVE-TEST-2 — mirrors CreateDraftReplyConfigSchema's cross-field
  // refine ("At least one of textBody or htmlBody must be provided."), which the
  // per-field `required` model cannot express. One readiness issue, both fields named.
  requiredAnyOf: [
    { fields: ["textBody", "htmlBody"], message: "Add a text body or HTML body." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
