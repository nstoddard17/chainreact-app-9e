import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `gmail:new_attachment` (Gmail 2.3 Commit
 * 4 runtime, Slice 3.12 builder surface).
 *
 * Polling-activated trigger. The activation hook at
 * `integrations/gmail/triggers/newAttachment/activate.ts` registers
 * via `registerActivation("gmail", "new_attachment", ...)` and seeds
 * the polling baseline historyId — same first-poll-miss protection
 * as the other Gmail triggers. The activation-registry invariant
 * test is satisfied by this registration; no exemption is needed.
 *
 * `fields[]` is empty — `GmailNewAttachmentConfigSchema` declares no
 * user-set filter fields in its first-version surface (Gmail 2.3 plan
 * §13.5 deferred V1's `fileType` / `from` / `minSize` filters to a
 * follow-up slice). Internal `pollingEnabled` / `snapshot` /
 * `polling` are server-managed and intentionally NOT surfaced.
 *
 * Workflows that need attachment-shape refinement (mime type, file
 * extension, minimum size) compose downstream filter / condition
 * actions on `payload.attachments[]`.
 *
 * `payloadShape` mirrors
 * `messageHydration.ts:buildAttachmentTriggerEvent` — the new_email
 * metadata fields plus `attachments[]` (per-attachment metadata
 * objects, NO bytes, NO FileRef) and `attachmentCount`. Per the
 * Gmail 2.3 plan §13.2 decision the trigger boundary is metadata
 * only; workflows that need attachment bytes chain
 * `gmail/get_attachment(messageId, attachmentId)` downstream.
 *
 * Required scope: `gmail.readonly` (manifest required set).
 */
export const newAttachmentTriggerMeta: TriggerMeta = {
  key: "gmail:new_attachment",
  provider: "gmail",
  type: "new_attachment",
  displayName: "New Email Attachment",
  description:
    "Fires when a new email with at least one attachment arrives in the connected Gmail inbox. The payload includes per-attachment metadata (filename, mimeType, size, attachmentId) — NO bytes. To download attachment content, chain the gmail/get_attachment action downstream. Polls every 5 minutes by default. Requires the gmail.readonly scope.",
  category: "email",
  activation: "polling",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    { name: "id", type: "string", description: "Gmail message id." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Gmail label ids currently applied to the message." },
    { name: "snippet", type: "string", description: "Short message snippet (Gmail-provided)." },
    { name: "sizeEstimate", type: "number", description: "Gmail's estimated message size in bytes." },
    { name: "mimeType", type: "string", description: "Top-level mimeType of the message payload." },
    { name: "hasAttachments", type: "boolean", description: "True when the top-level mimeType is multipart/mixed." },
    { name: "from", type: "string", description: "From header value." },
    { name: "to", type: "string", description: "To header value." },
    { name: "cc", type: "string", description: "Cc header value." },
    { name: "bcc", type: "string", description: "Bcc header value." },
    { name: "subject", type: "string", description: "Subject header value." },
    { name: "date", type: "string", description: "Date header value." },
    { name: "messageId", type: "string", description: "Message-ID header value (RFC 5322 message identifier)." },
    { name: "deliveredTo", type: "string", description: "Delivered-To header value." },
    { name: "receivedAt", type: "string", description: "ISO 8601 timestamp derived from Gmail's internalDate." },
    {
      name: "attachments",
      type: "array",
      description: "Per-attachment metadata array — each entry is { attachmentId, filename, mimeType, sizeBytes }. NO bytes / NO FileRef; chain gmail/get_attachment downstream to fetch content.",
    },
    { name: "attachmentCount", type: "number", description: "Convenience length of attachments[] for downstream branching." },
  ],
  displayOrder: 30,
};
