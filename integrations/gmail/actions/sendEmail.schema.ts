import { z } from "zod";

/**
 * Resolved-config schema for the Gmail send_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string or array.
 *
 * Body fields (Slice 2d Decision 2d-1, Option C):
 *   - `textBody` only → handler sends `text/plain`.
 *   - `htmlBody` only → handler sends `text/html`.
 *   - both         → handler sends `multipart/alternative` with
 *                    text/plain first and text/html second.
 *   - At least one MUST be present and non-empty (refine guard below).
 *   - **No body auto-detect.** V1's `sendEmail.ts:101-103` peeked into
 *     the body string for `<div>` / `<p>` / `<br>` / `<span>` / `<table>`
 *     and flipped content-type to HTML when found (G-R6). V2 keeps
 *     textBody / htmlBody as separate fields — workflow authors pick
 *     explicitly. Schema rejects unknown fields via `.strict()`, so a
 *     V1-era `body` field is a clean validation error.
 *
 * Recipients (Gmail 2.1 / P-G2 — Q7 multi-recipient parser, decision 7):
 *   - `to` / `cc` / `bcc` accept either a CSV string ("a@x.com, b@x.com")
 *     OR a string array. The handler routes all three through
 *     `parseRecipients` from `core/integrations/parseRecipients.ts`,
 *     which splits CSVs, flattens arrays, trims, and drops empties.
 *   - `to` must produce at least one non-empty entry after parsing —
 *     the schema enforces "at least one input character" (string min 1
 *     or array min 1), and the handler re-checks post-parse to catch
 *     all-whitespace edge cases ("   ,  ,").
 *   - Mirrors Outlook's sendEmail.schema.ts policy (slice 6).
 *
 * Gmail 2.1 Commit 2 expansion (parity-gmail.md §7 — sendEmail expand,
 * Q11-clean field set):
 *   - `replyTo` (optional string) — populates the RFC 5322 `Reply-To:`
 *     header. Bare email or display-name form ("Name <a@b.com>") both
 *     accepted; no provider-side parsing. Empty string treated as
 *     omitted (handler-side check).
 *   - `signature` (optional string) — appended to whichever body
 *     fields are present. textBody gets "\n\n<sig>"; htmlBody gets
 *     "<br><br><sig>". The signature string is used verbatim — workflow
 *     authors supplying an HTML signature for an html-only message
 *     should pre-format it as HTML. Same convention as V1
 *     `sendEmail.ts:161-165`.
 *   - `labels` (optional string array, Gmail label IDs only) — applied
 *     to the sent message via `users.messages.modify` after a
 *     successful send. **Label IDs only — no name-to-id lookup.** V1's
 *     `applyGmailLabels` accepted names AND did `users.labels.list`
 *     lookups + optional `createIfNotExists`; that's fragile cross-call
 *     behavior we deliberately omit. Label creation lives in the
 *     future `createLabel` action.
 *
 * Q11 — fields dropped at port time (parity-gmail.md decisions 5 +
 * G-R5; do not reintroduce):
 *   - `scheduleSend` — V1 silently no-op'd; Gmail API has no native
 *     scheduling. Use a future "publish draft on schedule" workflow.
 *   - `trackOpens` / `trackClicks` — V1 silently no-op'd; tracking
 *     pixel endpoint was never built.
 *   - V1's `priority` / `readReceipt` / `from` overrides also dropped
 *     for this commit (Q11-low-risk but unused workflow surface;
 *     can be restored later if real demand surfaces).
 *
 * Attachments — DEFERRED to Gmail 2.3 (per parity-gmail.md §11).
 *   - Gated on the P-S3 file output contract slice landing.
 *   - No placeholder field in the schema today: `.strict()` rejects
 *     unknown keys, so a workflow trying `attachments: ...` gets a
 *     clean Zod error rather than silently dropping the field. When
 *     P-S3 lands, the attachment field type will derive from the
 *     accepted `FileRef` contract — no point staging a placeholder
 *     shape that will likely change.
 */
export const SendEmailConfigSchema = z
  .object({
    to: z.union([
      z.string().min(1, "Recipient is required (CSV or array)."),
      z.array(z.string()).min(1, "Recipient is required (CSV or array)."),
    ]),
    subject: z.string(), // may be empty per Slice 2d additional decision
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    /** Optional. Gmail 2.1 Commit 2. Goes into the `Reply-To:` header. */
    replyTo: z.string().min(1).optional(),
    /** Optional. Gmail 2.1 Commit 2. Appended to textBody / htmlBody verbatim. */
    signature: z.string().min(1).optional(),
    /** Optional. Gmail 2.1 Commit 2. Gmail label IDs to apply post-send via users.messages.modify. */
    labels: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine(
    (val) => Boolean(val.textBody) || Boolean(val.htmlBody),
    { message: "At least one of textBody or htmlBody must be provided." },
  );

export type SendEmailConfig = z.infer<typeof SendEmailConfigSchema>;
