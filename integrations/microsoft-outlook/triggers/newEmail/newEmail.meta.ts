import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:new_email`.
 *
 * Webhook-activated subscription-watch trigger. Activation registers a
 * Microsoft Graph subscription on /me/messages (or
 * /me/mailFolders/{folder}/messages when `folder` is set) with a 32-byte
 * hex clientState; persists subscriptionId/clientState/expiresAt in
 * trigger_resources.config. Subscription is renewed by the existing
 * runRenewals cron before its ~70.5h expiry. Deactivation deletes the
 * subscription with best-effort 404/403 swallow. The activation-registry
 * invariant test is satisfied by this registration; no exemption needed.
 *
 * `fields[]` mirrors `NewEmailTriggerFilterSchema` (5 V1-parity filter
 * fields per D-OM3 + the folder routing field). All filters apply
 * receive-side after Graph delivers the notification — no pre-filtering
 * via subscription resource path (other than the folder routing).
 *
 * Internal subscription state (`subscriptionId`, `clientState`,
 * `resource`, `expiresAt`, `type`) is server-managed and intentionally
 * NOT surfaced.
 *
 * Required scope: `Mail.Read` (P-O1 manifest).
 *
 * Payload mirrors `messageHydration` in `newEmail/normalize.ts` exactly.
 */
export const outlookNewEmailTriggerMeta: TriggerMeta = {
  key: "microsoft-outlook:new_email",
  provider: "microsoft-outlook",
  type: "new_email",
  displayName: "New Email",
  description:
    "Fires when a new email arrives in the connected Outlook mailbox. Backed by a Microsoft Graph subscription watch on /me/messages. Optionally narrow by folder, sender, subject (exact or substring), attachment presence, and importance. Requires the Mail.Read scope.",
  category: "email",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "folder",
      label: "Folder (optional)",
      description:
        "Optional. Pick the folder to watch, or paste a folder ID or well-known name ('inbox', 'sentitems', 'drafts', etc.). Leave blank to watch all folders.",
      type: "combobox",
      optionsSource: "microsoft-outlook:folders",
      allowManualEntry: true,
      required: false,
      placeholder: "Search folders or paste a folder ID",
    },
    {
      name: "from",
      label: "From (optional)",
      description:
        "Optional sender address for exact-match filtering at receive time (case-insensitive match against `email.from.emailAddress.address`).",
      type: "text",
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
      placeholder: "Invoice",
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
    {
      name: "hasAttachment",
      label: "Has attachment",
      description:
        "Filter by attachment presence. 'Any' fires regardless; 'Yes' requires hasAttachments=true; 'No' requires hasAttachments=false.",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Any" },
        { value: "yes", label: "Has attachment" },
        { value: "no", label: "No attachment" },
      ],
    },
    {
      name: "importance",
      label: "Importance",
      description:
        "Filter by Microsoft Graph importance flag. 'Any' fires regardless; otherwise require matching importance level.",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Any" },
        { value: "high", label: "High" },
        { value: "normal", label: "Normal" },
        { value: "low", label: "Low" },
      ],
    },
  ],
  payloadShape: [
    { name: "messageId", type: "string", description: "Graph message id." },
    { name: "conversationId", type: "string", description: "Outlook conversation id. null when Graph omits it." },
    { name: "subject", type: "string", description: "Subject. Empty string when Graph omits it.", sensitive: true  },
    {
      name: "bodyPreview",
      type: "string",
      description: "Graph-provided short body preview. Empty string when omitted. Marked sensitive — mirrors a slice of the body (which is also sensitive); redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
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
    {
      name: "to",
      type: "array",
      description: "ToRecipients as { name?, address } objects. Marked sensitive — recipient addresses redact from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    {
      name: "cc",
      type: "array",
      description: "CcRecipients as { name?, address } objects. Marked sensitive — recipient addresses redact from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    { name: "receivedAt", type: "string", description: "ISO timestamp of message receipt. null when Graph omits it." },
    { name: "hasAttachments", type: "boolean", description: "Echoes Graph's hasAttachments flag." },
    { name: "importance", type: "string", description: "Graph importance — 'low' | 'normal' | 'high'." },
    { name: "webLink", type: "string", description: "Direct OWA URL to the message. null when Graph omits it." },
  ],
  displayOrder: 10,
};
