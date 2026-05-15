import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook create_draft_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string / array / boolean.
 *
 * Mirrors `SendEmailConfigSchema` exactly minus the send-side semantics
 * — `create_draft_email` creates a draft via POST /me/messages instead
 * of POST /me/sendMail, but the body shape is identical. Same Q-contract
 * decisions apply:
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `isHtml`: V1 silently defaults to `false`. V2 forces explicit choice.
 *   - `importance`: V1 silently defaults to `"normal"`. V2 forces explicit
 *     — `"high"` sets the Outlook flag/exclamation visible in the
 *     recipient's inbox even on the draft surface.
 *   - `subject` and `body` are required to be PRESENT (the field key must
 *     appear in config) but may be empty strings.
 *
 * Q7 — Multi-recipient parsing in the handler:
 *   - `to`, `cc`, `bcc` accept either a CSV string OR an array of
 *     strings. parseRecipients flattens both shapes into a flat list.
 *   - `to`'s `.min(1)` matches sendEmail policy; at-least-one parsed
 *     recipient is also enforced post-parse in the handler.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Strict mode rejects unknown fields.
 */
export const CreateDraftEmailConfigSchema = z
  .object({
    /** Required. CSV or array. Empty after parsing → handler rejects. */
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

export type CreateDraftEmailConfig = z.infer<
  typeof CreateDraftEmailConfigSchema
>;
