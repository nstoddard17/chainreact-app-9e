import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:send_email`.
 *
 * Mirrors `sendEmail.schema.ts`. Recipient fields (`to`/`cc`/`bcc`) and
 * `labels` use the Slice 3.13 `string-array` field type — the runtime
 * schema accepts `string | string[]` and the handler routes through
 * `parseRecipients`; chip-input semantics mean the form always writes
 * `string[]` natively (no CSV-in-text-field UX).
 *
 * Body fields (`textBody`, `htmlBody`) are both surfaced as optional
 * textareas. The schema's cross-field refine ("at least one of textBody
 * or htmlBody must be present") cannot be enforced by a per-field
 * renderer — the resolved-config Zod schema is authoritative and
 * rejects empty-both at save time. The description documents the rule
 * so the workflow author isn't surprised.
 *
 * `signature` and `replyTo` are optional single-string fields
 * (RFC 5322 `Reply-To:` header verbatim; signature appended per
 * `sendEmail.ts:148-156`).
 *
 * Required scope: `gmail.send` (with `gmail.modify` covering the
 * post-send labels application).
 *
 * Outputs match `sendEmail.ts:159-167` exactly.
 */
export const sendEmailMeta: ActionMeta = {
  key: "gmail:send_email",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  description:
    "Send a new email from the connected Gmail account. At least one of Text Body or HTML Body must be provided. Optionally apply Gmail labels to the sent message via labels (label ids only — use Create Label upstream if you need to generate one). Requires the gmail.send scope (and gmail.modify when labels are applied).",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "to",
      label: "To",
      description:
        "Recipient email addresses. Press Enter or click Add to append each address.",
      type: "string-array",
      required: true,
      sensitivity: "recipient",
      placeholder: "alice@example.com",
    },
    {
      name: "cc",
      label: "Cc",
      description: "Optional Cc recipients.",
      type: "string-array",
      required: false,
      sensitivity: "recipient",
      placeholder: "carbon-copy@example.com",
    },
    {
      name: "bcc",
      label: "Bcc",
      description: "Optional Bcc recipients (not visible to other recipients).",
      type: "string-array",
      required: false,
      sensitivity: "recipient",
      placeholder: "blind-copy@example.com",
    },
    {
      name: "subject",
      label: "Subject",
      description: "Email subject line. May be empty.",
      type: "text",
      required: false,
      // The schema requires `subject` to be PRESENT (may be empty, Slice 2d).
      // Seed "" so the builder's deriveDefaultConfig writes the key — otherwise
      // an untouched optional field is omitted and the node fails at runtime.
      defaultValue: "",
      placeholder: "Re: project update",
    },
    {
      name: "textBody",
      label: "Text body",
      description:
        "Plain-text email body. At least one of Text Body or HTML Body must be provided (the schema rejects sending an email with neither).",
      type: "textarea",
      required: false,
    },
    {
      name: "htmlBody",
      label: "HTML body",
      description:
        "HTML email body. Sent as multipart/alternative alongside the text body when both are provided.",
      type: "textarea",
      required: false,
    },
    {
      name: "replyTo",
      label: "Reply-To",
      description:
        "Optional Reply-To header. Accepts bare email or display-name form (e.g. 'Name <a@b.com>'). Used verbatim with no provider-side parsing.",
      type: "text",
      required: false,
      sensitivity: "recipient",
      placeholder: "reply-to-this@example.com",
    },
    {
      name: "signature",
      label: "Signature",
      description:
        "Optional signature appended to the body. Text body gets a blank-line separator; HTML body gets two <br> tags. Workflow authors providing HTML signatures for HTML-only sends should pre-format as HTML.",
      type: "textarea",
      required: false,
    },
    {
      name: "labels",
      label: "Labels (apply after send)",
      description:
        "Gmail label ids to apply to the sent message via users.messages.modify. Label IDs only — no name-to-id lookup. Use Create Label upstream to generate one.",
      type: "string-array",
      required: false,
      placeholder: "Label_12345",
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Gmail message id of the sent message." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "to", type: "array", description: "Echoes the resolved To recipients (post-parseRecipients)." },
    { name: "subject", type: "string", description: "Echoes the Subject." },
    {
      name: "labelIds",
      type: "array",
      description:
        "Label ids successfully applied. Empty when no labels were requested.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Sends external email — delivery is observable and cannot be recalled.",
};
