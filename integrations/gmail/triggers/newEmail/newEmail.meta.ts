import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `gmail:new_email` (Slice 2e runtime,
 * Slice 3.12 builder surface).
 *
 * Polling-activated trigger. The activation hook at
 * `integrations/gmail/triggers/newEmail/activate.ts` registers via
 * `registerActivation("gmail", "new_email", ...)` and fetches the
 * mailbox's current `historyId` to seed `snapshot.historyId` BEFORE the
 * `trigger_resources` row is upserted. This is V2's implementation of
 * the V1 CLAUDE.md "first poll miss" rule — without the activation
 * baseline the first poll would establish its own baseline and silently
 * drop messages that arrived between activate and the first tick. The
 * activation-registry invariant test
 * (`tests/structure/trigger-meta-activation-invariant.test.ts`) is
 * satisfied by this registration; no exemption is needed (and adding
 * one would mask a real correctness invariant).
 *
 * `fields[]` mirrors only the SINGLE-VALUE user-set fields of
 * `GmailNewEmailConfigSchema`. The array-valued filters `from` and
 * `labelIds` are intentionally deferred — V2's multi-select / multi-
 * value field renderer is not yet implemented (see the explicit
 * not-supported guards in
 * `features/workflow-builder/config-modal/fields/SelectField.tsx` and
 * `ComboboxField.tsx`). The runtime defaults still apply:
 *   - `from` defaults to `[]` (every sender matches).
 *   - `labelIds` defaults to `["INBOX"]` (fires on inbox arrivals).
 * Both filters land in a follow-up slice once the multi-select
 * renderer is in place — likely paired with async option sources for
 * `from` autocomplete and Gmail labels lookup.
 *
 * Internal server-managed state — `pollingEnabled`, `snapshot`,
 * `polling` — is intentionally NOT surfaced (mirrors the
 * `scheduledTrigger` convention of hiding activation-managed state).
 * Polling cadence (5 minutes default via
 * `services/cron/pollingIntervals`) is NOT exposed per Slice 3.12's
 * "no polling interval slider" constraint.
 *
 * `payloadShape` mirrors `messageHydration.ts:buildTriggerEvent`'s
 * payload — Gmail message metadata (no body, no attachment bytes).
 *
 * Required scope: `gmail.readonly` (manifest required set).
 */
export const newEmailTriggerMeta: TriggerMeta = {
  key: "gmail:new_email",
  provider: "gmail",
  type: "new_email",
  displayName: "New Email",
  description:
    "Fires when a new email arrives in the connected Gmail inbox. Optionally narrow by subject text and attachment presence. Polls every 5 minutes by default. Sender-list and label-list filters are deferred until V2's multi-select field renderer ships — the runtime defaults fire on every sender and the INBOX label. Requires the gmail.readonly scope.",
  category: "email",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "subject",
      label: "Subject (optional)",
      description:
        "Subject text to match. Matching mode is controlled by 'Subject exact match' below — substring match when off, equality when on. Leave blank to fire regardless of subject.",
      type: "text",
      required: false,
      placeholder: "Invoice",
    },
    {
      name: "subjectExactMatch",
      label: "Subject exact match",
      description:
        "When on, the email's subject must equal the configured text. When off, substring match is used. Has no effect when Subject is blank.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
    {
      name: "hasAttachment",
      label: "Has attachment",
      description:
        "Filter by attachment presence using a top-level mimeType heuristic. 'Any' fires regardless; 'Has attachment' fires only when the message looks attached; 'No attachment' fires only when it doesn't.",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Any" },
        { value: "yes", label: "Has attachment" },
        { value: "no", label: "No attachment" },
      ],
    },
  ],
  payloadShape: [
    { name: "id", type: "string", description: "Gmail message id. Stable across history walks; usable as a dedup key." },
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
  ],
  displayOrder: 10,
};
