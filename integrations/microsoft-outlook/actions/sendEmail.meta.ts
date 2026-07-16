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
 * `attachments` (Slice 3.23) — exposed as a `file-array` FieldType so
 * workflow authors can configure attachments via the variable picker
 * (Slice 3.22 chip-append integration) without hand-editing workflow
 * JSON. The runtime contract is unchanged: `z.array(FileRefSchema).optional()`.
 * Handler-side caps stay authoritative (3 MB per / 25 MB total per
 * Microsoft Graph synchronous-sendMail limits — see `sendEmail.ts:18-29`).
 * `fileArrayMaxItems: 25` is a UI hint that nudges authors toward the
 * realistic-workflow regime; the handler enforces the real byte cap.
 * Per plan D-FRA-6, the picker is NOT type-filtered today — authors
 * can pick any output; the runtime parse rejects non-FileRef-shaped
 * resolved values at execute time.
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
    "Send an email from the connected Outlook mailbox via Microsoft Graph. isHtml and importance are required — V2 forces explicit choice for both because each has user-visible behavior. Requires the Mail.Send scope.",
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
      description:
        "Email subject line. Microsoft Graph accepts empty subjects; the field is required by key but may be left blank.",
      type: "text",
      required: false,
      // Schema requires the key present (may be empty). Seed "" so the builder
      // writes the key — otherwise an untouched optional field is omitted and
      // the node fails at runtime.
      defaultValue: "",
      placeholder: "Re: project update",
    },
    {
      name: "body",
      label: "Body",
      description:
        "Email body. Rendering controlled by 'Is HTML' below. Graph accepts empty bodies; the field is required by key but may be left blank.",
      type: "textarea",
      required: false,
      // Schema requires the key present (may be empty) — seed "" (see subject).
      defaultValue: "",
    },
    {
      name: "isHtml",
      label: "Is HTML",
      description:
        "How the body is delivered: on = formatted HTML email, off = plain text. Required — match how you wrote the body.",
      type: "boolean",
      required: true,
    },
    {
      name: "importance",
      label: "Importance",
      description:
        "Priority flag recipients see. 'High' shows Outlook's red exclamation mark. Required — pick one (Normal is typical).",
      type: "select",
      required: true,
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ],
    },
    {
      name: "attachments",
      label: "Attachments",
      description:
        "Attach files from earlier steps — use the variable picker to insert a file output (e.g. a downloaded attachment). Limits: 3 MB per file, 25 MB total.",
      type: "file-array",
      required: false,
      fileArrayMaxItems: 25,
      placeholder: "Paste a {{...}} token or FileRef JSON",
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
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Sends external email — delivery is observable and cannot be recalled.",
};
