import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:email_flagged`.
 *
 * Webhook-activated subscription-watch trigger backed by a Microsoft
 * Graph /me/messages subscription with a receive-time
 * `flag.flagStatus === "flagged"` check. Same activation / renew /
 * deactivate plumbing as `new_email`. Activation registered;
 * activation-registry invariant satisfied without exemption.
 *
 * **D-OM4 — V1-parity over-fire behavior**: the trigger has no prior-
 * state cache; any modification that leaves the message in a flagged
 * state re-fires. Subject edits / body updates / any update on an
 * already-flagged message will trigger the workflow. Documented
 * prominently in the description so workflow authors aren't surprised.
 *
 * Required scope: `Mail.Read`.
 *
 * Payload mirrors `emailFlagged/normalize.ts` exactly — same email
 * metadata as new_email/email_sent plus a `flag` object carrying
 * Graph's flag status + due/start/completed timestamps.
 */
export const outlookEmailFlaggedTriggerMeta: TriggerMeta = {
  key: "microsoft-outlook:email_flagged",
  provider: "microsoft-outlook",
  type: "email_flagged",
  displayName: "Email Flagged",
  description:
    "Fires when an Outlook message is flagged for follow-up. NOTE: V1-parity over-fire behavior — any update that leaves the message in a flagged state re-fires the workflow (subject edits, body updates, etc. on an already-flagged message). There is no prior-state cache and no unflagged-to-flagged transition detection. Add a downstream dedupe step if needed. Requires the Mail.Read scope.",
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
    { name: "receivedDateTime", type: "string", description: "ISO timestamp of message receipt. null when Graph omits it." },
    { name: "hasAttachments", type: "boolean", description: "Echoes Graph's hasAttachments flag." },
    { name: "importance", type: "string", description: "Graph importance — 'low' | 'normal' | 'high'." },
    { name: "webLink", type: "string", description: "Direct OWA URL to the message. null when Graph omits it." },
    {
      name: "flag",
      type: "object",
      description:
        "Outlook flag object — { flagStatus: 'flagged', completedDateTime?, dueDateTime?, startDateTime? }. flagStatus is always 'flagged' on this trigger (the receive-time filter gates).",
    },
  ],
  displayOrder: 30,
};
