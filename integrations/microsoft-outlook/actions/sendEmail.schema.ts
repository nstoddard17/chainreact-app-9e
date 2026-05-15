import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for the Microsoft Outlook send_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string / array / FileRef.
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `isHtml`: V1 silently defaults to `false`. V2 forces explicit choice;
 *     workflow authors decide between plaintext and HTML rendering.
 *   - `importance`: V1 silently defaults to `"normal"`. V2 forces explicit;
 *     "high" sets the Outlook flag/exclamation visible in the recipient's
 *     inbox, which has user-visible behavior.
 *   - `subject` and `body` are required to be PRESENT (the field key must
 *     appear in config) but may be empty strings. Empty strings are
 *     intentional — Microsoft Graph accepts them — so this matches Gmail's
 *     `subject: z.string()` policy.
 *
 * Recipients (Q7 multi-recipient parser applies in the handler):
 *   - `to` is the only required recipient field — at least one address
 *     in `to` must produce a non-empty parsed list. This matches Gmail's
 *     `to: z.string().min(1)` policy. Cross-field "at least one of
 *     to/cc/bcc" validation isn't in the schema; the handler enforces
 *     after parseRecipients yields the post-CSV-split list.
 *   - `to`, `cc`, `bcc` accept either a CSV string OR an array of
 *     strings. parseRecipients flattens both shapes into a flat list.
 *
 * Attachments (Outlook Mail 2.1 Commit 4, P-O2):
 *   - `attachments` is optional; absent or empty array preserves the
 *     pre-2.1 no-attachment shape.
 *   - Each entry MUST conform to `FileRefSchema`. Inline-bytes shapes
 *     (`content`, `bytes`, `base64`, `data`) are rejected at parse time
 *     by FileRefSchema's strict-arms — the schema layer guarantees no
 *     raw bytes reach the handler. The handler resolves FileRefs to
 *     bytes via `fetchFileBytes`, applies the 3 MB-per / 25 MB-total
 *     hard caps, base64-encodes, and constructs the Graph
 *     `fileAttachment` envelope. `provider_url` kind is rejected at the
 *     handler layer with a clean error (P-S3 plan §10 #1).
 *
 * Strict mode rejects unknown fields.
 */
export const SendEmailConfigSchema = z
  .object({
    /** Required. CSV ("a@b.com, c@d.com") or array. Empty after parsing → handler rejects. */
    to: z.union([z.string().min(1), z.array(z.string()).min(1)]),
    /** Optional. CSV or array. */
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    /** Optional. CSV or array. */
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    /** Required, may be empty. */
    subject: z.string(),
    /** Required, may be empty. */
    body: z.string(),
    /** Q11 required: no hidden default for plaintext-vs-HTML. */
    isHtml: z.boolean(),
    /** Q11 required: no hidden default for importance. */
    importance: z.enum(["low", "normal", "high"]),
    /**
     * Optional file attachments. Strict FileRefSchema arms reject any
     * inline-bytes shape (`content`, `bytes`, `base64`, `data`, …) at
     * parse time. Handler enforces 3 MB per / 25 MB total caps + rejects
     * `provider_url` kind with a clean error.
     */
    attachments: z.array(FileRefSchema).optional(),
  })
  .strict();

export type SendEmailConfig = z.infer<typeof SendEmailConfigSchema>;
