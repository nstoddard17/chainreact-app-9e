import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `gmail:new_labeled_email` (Gmail 2.3
 * Commit 3 runtime, Slice 3.12 builder surface).
 *
 * Polling-activated trigger. The activation hook at
 * `integrations/gmail/triggers/newLabeledEmail/activate.ts` registers
 * via `registerActivation("gmail", "new_labeled_email", ...)` and
 * seeds the polling baseline historyId — same first-poll-miss
 * protection as `gmail:new_email`. The activation-registry invariant
 * test is satisfied by this registration; no exemption is needed.
 *
 * `fields[]` mirrors the user-set fields of
 * `GmailNewLabeledEmailConfigSchema`. The single required field is
 * `labelId` — the workflow's "fire when THIS label is applied"
 * selector. A `combobox` backed by the `gmail:labels` option source
 * (CONFIG-UX sweep); `allowManualEntry` keeps the raw-id paste path
 * for ids the resolver can't list. The committed value is still a
 * single label-id string.
 *
 * Internal server-managed state — `pollingEnabled`, `snapshot`,
 * `polling` — is intentionally NOT surfaced. Polling cadence is set
 * by `services/cron/pollingIntervals` and is also NOT a meta field
 * per Slice 3.12's constraints.
 *
 * `payloadShape` mirrors `messageHydration.ts:buildLabeledTriggerEvent`
 * — Gmail message metadata plus the two label-specific fields
 * (`labelAppliedId`, `labelsAdded`).
 *
 * Required scope: `gmail.readonly` (manifest required set).
 */
export const newLabeledEmailTriggerMeta: TriggerMeta = {
  key: "gmail:new_labeled_email",
  provider: "gmail",
  type: "new_labeled_email",
  displayName: "New Labeled Email",
  description:
    "Fires when a Gmail label is applied to an email in the connected inbox. Use this to react to filter-driven label automation or manual labeling. Polls every 5 minutes by default. Requires the gmail.readonly scope.",
  category: "email",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "labelId",
      label: "Label",
      description:
        "Pick the Gmail label that starts this workflow when it's applied to an email. System labels are also accepted by ID (e.g. 'STARRED').",
      type: "combobox",
      optionsSource: "gmail:labels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search labels or paste a label ID",
    },
  ],
  payloadShape: [
    { name: "id", type: "string", description: "Gmail message id." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Gmail label ids currently applied to the message (full set, not just the newly added one)." },
    { name: "snippet", type: "string", description: "Short message snippet (Gmail-provided).", sensitive: true  },
    { name: "sizeEstimate", type: "number", description: "Gmail's estimated message size in bytes." },
    { name: "mimeType", type: "string", description: "Top-level mimeType of the message payload." },
    { name: "hasAttachments", type: "boolean", description: "True when the top-level mimeType is multipart/mixed." },
    { name: "from", type: "string", description: "From header value.", sensitive: true  },
    { name: "to", type: "string", description: "To header value.", sensitive: true  },
    { name: "cc", type: "string", description: "Cc header value.", sensitive: true  },
    { name: "bcc", type: "string", description: "Bcc header value.", sensitive: true  },
    { name: "subject", type: "string", description: "Subject header value.", sensitive: true  },
    { name: "date", type: "string", description: "Date header value." },
    { name: "messageId", type: "string", description: "Message-ID header value (RFC 5322 message identifier)." },
    { name: "deliveredTo", type: "string", description: "Delivered-To header value." },
    { name: "receivedAt", type: "string", description: "ISO 8601 timestamp derived from Gmail's internalDate." },
    { name: "labelAppliedId", type: "string", description: "The label id whose application fired this trigger — echoes the workflow's configured labelId." },
    { name: "labelsAdded", type: "array", description: "Full list of labels added in the originating Gmail history entry. Useful when Gmail applies multiple labels at once." },
  ],
  displayOrder: 20,
};
