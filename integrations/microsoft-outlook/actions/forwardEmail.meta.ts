import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:forward_email`.
 *
 * Mirrors `forwardEmail.schema.ts`. The handler routes `to` + `cc`
 * through parseRecipients (Q7) — closes V1 O-R3 where forwardOutlookEmail
 * passed CSV strings verbatim into Graph (producing one-address sends).
 *
 * `to` is required; `cc` is optional; `comment` is optional pre-content
 * body (absent stays absent — wrapper omits the Graph field rather than
 * sending empty string).
 *
 * Required scope: `Mail.Send`.
 *
 * Outputs match `forwardEmail.ts:79-86` exactly.
 */
export const outlookForwardEmailMeta: ActionMeta = {
  key: "microsoft-outlook:forward_email",
  provider: "microsoft-outlook",
  type: "forward_email",
  displayName: "Forward Email",
  description:
    "Forward an existing Outlook message to new recipients via Microsoft Graph's /forward endpoint. To and Cc accept multiple addresses; the handler parses both shapes into a flat list. Requires the Mail.Send scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id of the email being forwarded. Source from a trigger payload or fetch_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "to",
      sensitivity: "recipient",
      label: "To",
      description:
        "Forward recipients. Press Enter or click Add to append each address.",
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
      name: "comment",
      label: "Comment",
      description:
        "Optional pre-content body inserted above the forwarded message. When blank, no comment is sent (the wrapper omits the field from the Graph body rather than sending empty string).",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    { name: "forwarded", type: "boolean", description: "Always true on success." },
    { name: "originalEmailId", type: "string", description: "Echoes the input emailId." },
    { name: "to", type: "array", description: "Resolved To recipients post-parseRecipients." },
    { name: "cc", type: "array", description: "Resolved Cc recipients post-parseRecipients." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Forwards email to external recipients — delivery cannot be recalled.",
};
