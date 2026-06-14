import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:create_draft_email`.
 *
 * Mirrors `createDraftEmail.schema.ts` — identical shape to send_email
 * minus the attachments field, with the same required-no-default
 * decisions on `isHtml` and `importance`. The handler creates a draft
 * via POST /me/messages instead of POST /me/sendMail.
 *
 * Required scope: `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Outputs match `createDraftEmail.ts:79-89` exactly.
 */
export const outlookCreateDraftEmailMeta: ActionMeta = {
  key: "microsoft-outlook:create_draft_email",
  provider: "microsoft-outlook",
  type: "create_draft_email",
  displayName: "Create Draft Email",
  description:
    "Create an Outlook draft email (does not send) via Microsoft Graph. isHtml and importance are required with no default — V2 forces explicit choice for both because each has user-visible behavior on the draft surface. Requires the Mail.ReadWrite scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "to",
      label: "To",
      description: "Draft recipients. Press Enter or click Add to append each address.",
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
        "Draft subject line. Graph accepts empty subjects; the field is required by key but may be left blank.",
      type: "text",
      required: false,
      // Schema requires the key present (may be empty) — seed "" so the builder
      // writes the key (see sendEmail.meta.ts rationale).
      defaultValue: "",
      placeholder: "Re: project update",
    },
    {
      name: "body",
      label: "Body",
      description:
        "Draft body. Rendering controlled by 'Is HTML' below. Graph accepts empty bodies; the field is required by key but may be left blank.",
      type: "textarea",
      required: false,
      // Schema requires the key present (may be empty) — seed "" (see subject).
      defaultValue: "",
    },
    {
      name: "isHtml",
      label: "Is HTML",
      description:
        "Required. When on, the body is stored as HTML; when off, plain text. NO default per Outlook Phase 2 Q11 — V2 forces explicit choice.",
      type: "boolean",
      required: true,
    },
    {
      name: "importance",
      label: "Importance",
      description:
        "Required. Microsoft Graph importance flag. NO default per Outlook Phase 2 Q11 — V2 forces explicit choice.",
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
    { name: "draftId", type: "string", description: "Graph id of the created draft." },
    { name: "subject", type: "string", description: "Echoes the Subject (or Graph-normalized form)." },
    { name: "webLink", type: "string", description: "Direct OWA URL to the draft. null when Graph omits it." },
    { name: "createdAt", type: "string", description: "ISO timestamp of draft creation. null when Graph omits it." },
    { name: "to", type: "array", description: "Resolved To recipients post-parseRecipients." },
    { name: "cc", type: "array", description: "Resolved Cc recipients post-parseRecipients." },
    { name: "bcc", type: "array", description: "Resolved Bcc recipients post-parseRecipients." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
