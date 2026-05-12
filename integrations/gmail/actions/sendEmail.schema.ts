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
  })
  .strict()
  .refine(
    (val) => Boolean(val.textBody) || Boolean(val.htmlBody),
    { message: "At least one of textBody or htmlBody must be provided." },
  );

export type SendEmailConfig = z.infer<typeof SendEmailConfigSchema>;
