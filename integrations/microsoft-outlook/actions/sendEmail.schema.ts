import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook send_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string / array.
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
  })
  .strict();

export type SendEmailConfig = z.infer<typeof SendEmailConfigSchema>;
