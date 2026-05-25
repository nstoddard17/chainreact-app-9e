import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook `email_sent` trigger
 * filter fields.
 *
 * Outlook Mail 2.3 Commit 3 — D-OM3 V1-parity. V1 declared 3 filter
 * fields (`to`, `subject`, `subjectExactMatch`); V1 marked `to` REQUIRED
 * but its mega-route only filters when `triggerConfig.to` is set, so V2
 * makes `to` OPTIONAL to match the actual V1 dispatch behavior — keeps
 * the workflow author free to subscribe to "all sent mail" if desired.
 *
 * Field semantics:
 *   - `to`: CSV-or-array recipient filter. Receive-time match — message
 *     fires only when at least one address in `email.toRecipients[]`
 *     matches at least one address in the parsed CSV/array list.
 *   - `subject` + `subjectExactMatch`: same shape as new_email's filter
 *     (exact when subjectExactMatch=true, substring otherwise).
 *
 * V1 defaults preserved per D-OM3:
 *   - `subjectExactMatch: true` (exact-match by default).
 *
 * Strict mode rejects unknown fields — keeps drift visible.
 */
export const EmailSentTriggerFilterSchema = z
  .object({
    /** Optional. CSV string OR array of email addresses. */
    to: z.union([z.string().min(1), z.array(z.string()).min(1)]).optional(),
    /** Optional. Subject filter (exact or substring per subjectExactMatch). */
    subject: z.string().optional(),
    /** Default true — V1-parity exact-match. */
    subjectExactMatch: z.boolean().default(true),
  })
  .strict();

export type EmailSentTriggerFilter = z.infer<
  typeof EmailSentTriggerFilterSchema
>;

export const EMAIL_SENT_FILTER_FIELDS = [
  "to",
  "subject",
  "subjectExactMatch",
] as const;

export function extractEmailSentFilterFields(
  config: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EMAIL_SENT_FILTER_FIELDS) {
    const v = config[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
