import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:send_email`.
 *
 * Mirrors `sendEmail.schema.ts`. Recipient fields (`to`/`cc`/`bcc`) use
 * the Slice 3.13 `string-array` chip renderer — the runtime accepts
 * `string | string[]` via parseRecipients, and the chip input writes
 * `string[]` natively (no CSV-in-text-field UX).
 *
 * `subject` and `body` are required-by-key but may be empty strings per
 * Outlook Phase 2's Q11 decision (Graph accepts empty subject/body).
 * Surfaced here as `required: false` because the FieldMeta `required`
 * flag means "non-empty" and the schema explicitly permits empty.
 * The handler Zod schema is authoritative on key-presence.
 *
 * **Required-no-default enums** preserved from Outlook Phase 2 Q11:
 *   - `isHtml`: no default — V1 silently picked plaintext; V2 forces
 *     explicit choice between plaintext + HTML rendering.
 *   - `importance`: no default — V1 silently picked "normal"; V2 forces
 *     explicit because "high" sets Outlook's user-visible exclamation.
 *
 * `attachments` (FileRefSchema[]) is intentionally NOT exposed in the
 * builder today: the V2 `file` FieldType is single-value (FileField is
 * a paste-FileRef-id text fallback) and the FieldMeta contract has no
 * FileRef-array type. Workflow authors who need attachments wire
 * `{{prevAction.file}}` variable references via direct workflow JSON
 * edit and the resolved-config Zod schema validates the shape. Mirrors
 * the createLabel.color decision in `gmail/actions/createLabel.meta.ts`.
 *
 * Required scope: `Mail.Send` (P-O1 manifest).
 *
 * Outputs match `sendEmail.ts:141-151` exactly.
 */
export const outlookSendEmailMeta: ActionMeta = {
  key: "microsoft-outlook:send_email",
  provider: "microsoft-outlook",
  type: "send_email",
  displayName: "Send Email",
  description:
    "Send an email from the connected Outlook mailbox via Microsoft Graph. isHtml and importance are required — V2 forces explicit choice for both because each has user-visible behavior. Attachments are an advanced option not yet exposed in the builder — set via direct workflow JSON if needed. Requires the Mail.Send scope.",
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
      placeholder: "alice@example.com",
    },
    {
      name: "cc",
      label: "Cc",
      description: "Optional Cc recipients.",
      type: "string-array",
      required: false,
      placeholder: "carbon-copy@example.com",
    },
    {
      name: "bcc",
      label: "Bcc",
      description: "Optional Bcc recipients (not visible to other recipients).",
      type: "string-array",
      required: false,
      placeholder: "blind-copy@example.com",
    },
    {
      name: "subject",
      label: "Subject",
      description:
        "Email subject line. Microsoft Graph accepts empty subjects; the field is required by key but may be left blank.",
      type: "text",
      required: false,
      placeholder: "Re: project update",
    },
    {
      name: "body",
      label: "Body",
      description:
        "Email body. Rendering controlled by 'Is HTML' below. Graph accepts empty bodies; the field is required by key but may be left blank.",
      type: "textarea",
      required: false,
    },
    {
      name: "isHtml",
      label: "Is HTML",
      description:
        "Required. When on, the body is sent as HTML; when off, plain text. NO default per Outlook Phase 2 Q11 — V2 forces explicit choice to avoid V1's silent plaintext default surprising HTML authors.",
      type: "boolean",
      required: true,
    },
    {
      name: "importance",
      label: "Importance",
      description:
        "Required. Microsoft Graph importance flag. 'High' adds the user-visible exclamation in Outlook. NO default per Outlook Phase 2 Q11 — V2 forces explicit choice.",
      type: "select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ],
    },
  ],
  outputs: [
    { name: "sent", type: "boolean", description: "Always true on success." },
    { name: "to", type: "array", description: "Resolved To recipients post-parseRecipients." },
    { name: "cc", type: "array", description: "Resolved Cc recipients post-parseRecipients." },
    { name: "bcc", type: "array", description: "Resolved Bcc recipients post-parseRecipients." },
    { name: "subject", type: "string", description: "Echoes the Subject." },
    { name: "isHtml", type: "boolean", description: "Echoes the chosen rendering mode." },
    { name: "importance", type: "string", description: "Echoes the chosen importance." },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 10,
};
