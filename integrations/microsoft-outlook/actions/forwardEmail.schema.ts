import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook forward_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string / array.
 *
 * Q7 — Multi-recipient parsing:
 *   - `to` and `cc` accept either a CSV string OR an array of strings.
 *     `parseRecipients` flattens both shapes into a flat list inside
 *     the handler. Closes V1 O-R3 (V1's `forwardOutlookEmail` passed
 *     CSV strings verbatim → became one Graph address).
 *   - At-least-one parsed `to` recipient is enforced post-parse in the
 *     handler (CSVs like "  , , " parse to []; schema can't catch
 *     whitespace-only).
 *
 * Required-with-value:
 *   - `emailId` must be a non-empty string. Forwarding "" would be a
 *     Graph 400; reject earlier with a schema error.
 *   - `to` must be present and pass the same shape as send_email's
 *     `to`: non-empty string OR non-empty array. The handler does
 *     post-parse rejection for whitespace-only CSVs.
 *
 * Optional:
 *   - `cc`: when absent, the wrapper omits `ccRecipients` from the
 *     Graph body entirely (rather than sending an empty array). Matches
 *     sendMail's "omit when empty" convention.
 *   - `comment`: optional pre-content body. When absent, the wrapper
 *     omits the field from the Graph body. V1 silently defaulted to
 *     empty string; V2 lets absent stay absent. Empty string is
 *     accepted (handler still sends it through if explicitly set).
 *
 * Strict mode rejects unknown fields.
 */
export const ForwardEmailConfigSchema = z
  .object({
    /** Required. Graph message id of the message being forwarded. */
    emailId: z.string().min(1),
    /** Required. CSV ("a@b.com, c@d.com") or array. */
    to: z.union([z.string().min(1), z.array(z.string()).min(1)]),
    /** Optional. CSV or array. */
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    /** Optional pre-content body for the forward; empty string is accepted but absent stays absent. */
    comment: z.string().optional(),
  })
  .strict();

export type ForwardEmailConfig = z.infer<typeof ForwardEmailConfigSchema>;
