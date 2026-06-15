/**
 * Shared, client-safe recipient/destination key classifier (AI-REPAIR-3A).
 *
 * Single source of truth for "does this PROPERTY KEY look like a recipient /
 * destination (where a message/event is SENT)?" — used by both:
 *   - the builder chat-fill eligibility guard
 *     ([features/workflow-builder/ai/chatFillEligibility.ts](../../features/workflow-builder/ai/chatFillEligibility.ts)),
 *     which refuses to place a chat-typed value into a recipient field; and
 *   - the server apply-safety contract
 *     ([services/workflows/patch/applySafety.ts](../../services/workflows/patch/applySafety.ts)),
 *     which blocks a future auto-apply from silently changing where a workflow sends.
 *
 * Hoisted here (pure, zero-dependency, client-safe — no `services/`,
 * `repositories/`, or I/O) so the two guards can't drift, mirroring the
 * `isSecretLikeKey` extraction in [secretKeys.ts](./secretKeys.ts). Classifies KEY
 * NAMES only — never inspects or returns a value.
 *
 * Word-level matching (against camelCase/separator-split tokens) avoids false
 * positives on normal text fields: `channelId` → `channel` (match), but
 * `customMessage` → `custom`/`message` (no match on the substring "to").
 */

/** Split a key into lowercased words on camelCase + `_ - . space` boundaries. */
function tokenizeKey(key: string): readonly string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/**
 * Recipient / destination key WORDS. Kept identical to the original chat-fill list
 * (AI-CONFIG-ASSIST CS-1) so the extraction is behavior-preserving.
 */
const RECIPIENT_KEY_WORDS: ReadonlySet<string> = new Set([
  "to",
  "cc",
  "bcc",
  "recipient",
  "recipients",
  "attendee",
  "attendees",
  "channel",
  "webhook",
  "webhookurl",
  "url",
  "uri",
  "email",
  "mail",
  "phone",
  "address",
  "destination",
  "dest",
  "target",
]);

/**
 * True when a property key names a recipient / destination (where a message or
 * event is SENT). Pure + deterministic; classifies the KEY NAME only.
 */
export function isRecipientOrDestinationKey(key: string): boolean {
  return tokenizeKey(key).some((word) => RECIPIENT_KEY_WORDS.has(word));
}
