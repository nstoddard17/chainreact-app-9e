import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:email_sent`.
 *
 * Webhook-activated subscription-watch trigger. Same activation /
 * renew / deactivate plumbing as `new_email` but scoped to the
 * SentItems folder. Activation registered; activation-registry
 * invariant satisfied without exemption.
 *
 * `to` is OPTIONAL despite V1 marking it required — V1's dispatch
 * only actually filters when `triggerConfig.to` is set, so V2's
 * schema matches the real V1 behavior (subscribe to ALL sent mail
 * is the default). D-OM3 documents this.
 *
 * Required scope: `Mail.Read`.
 *
 * Payload mirrors `emailSent/normalize.ts` exactly.
 */
export const outlookEmailSentTriggerMeta: TriggerMeta = {
  key: "microsoft-outlook:email_sent",
  provider: "microsoft-outlook",
  type: "email_sent",
  displayName: "Email Sent",
  description:
    "Fires when an email is sent from the connected Outlook mailbox (scoped to SentItems). Backed by a Microsoft Graph subscription watch. Optionally narrow by recipient and subject. Requires the Mail.Read scope.",
  category: "email",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "to",
      label: "To recipients (optional)",
      description:
        "Optional recipient filter — fires only when at least one address in the sent message's ToRecipients[] matches at least one address in this list. When empty, every sent message matches.",
      type: "string-array",
      required: false,
      placeholder: "alice@example.com",
    },
    {
      name: "subject",
      label: "Subject (optional)",
      description:
        "Optional subject text to match. Matching mode is controlled by 'Subject exact match' below — substring when off, equality when on. Leave blank to fire regardless of subject.",
      type: "text",
      required: false,
      placeholder: "Re: project update",
    },
    {
      name: "subjectExactMatch",
      label: "Subject exact match",
      description:
        "When on (V1 default), the email's subject must equal the configured text (case-insensitive). When off, substring match is used. Has no effect when Subject is blank.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  payloadShape: [
    { name: "messageId", type: "string", description: "Graph message id." },
    { name: "conversationId", type: "string", description: "Outlook conversation id. null when Graph omits it." },
    { name: "subject", type: "string", description: "Subject. Empty string when Graph omits it.", sensitive: true  },
    { name: "bodyPreview", type: "string", description: "Graph-provided short body preview. Empty string when omitted." },
    {
      name: "body",
      type: "object",
      description: "Full body — { contentType: 'text' | 'html', content: string }.",
      sensitive: true,
    },
    {
      name: "from",
      type: "object",
      description: "Sender — { name?, address } when present. Falls back to `sender` if `from` is missing.",
      sensitive: true,
    },
    { name: "to", type: "array", description: "ToRecipients as { name?, address, sensitive: true  } objects." },
    { name: "cc", type: "array", description: "CcRecipients as { name?, address, sensitive: true  } objects." },
    { name: "bcc", type: "array", description: "BccRecipients as { name?, address, sensitive: true  } objects." },
    { name: "sentDateTime", type: "string", description: "ISO timestamp when the message was sent. null when Graph omits it." },
    { name: "hasAttachments", type: "boolean", description: "Echoes Graph's hasAttachments flag." },
    { name: "importance", type: "string", description: "Graph importance — 'low' | 'normal' | 'high'." },
    { name: "webLink", type: "string", description: "Direct OWA URL to the message. null when Graph omits it." },
  ],
  displayOrder: 20,
};
