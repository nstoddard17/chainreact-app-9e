import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook reply_to_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string / boolean.
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `replyAll`: V1 silently defaults to `false`. V2 forces the workflow
 *     author to choose between reply (sender only) and replyAll
 *     (sender + everyone). The endpoint switches on this — silent
 *     defaulting would send a less-broad message than the author intended
 *     OR a much-broader one.
 *
 * Required-with-value:
 *   - `emailId` must be a non-empty string. Replying to "" would be a
 *     Graph 400; reject earlier with a schema error.
 *   - `body` must be present (the field key must appear in config) but
 *     may be empty. Empty replies are unusual but Graph accepts them; if
 *     someone wires `{{nodeId.body}}` and the upstream returns "" we
 *     shouldn't fail at the schema layer.
 *
 * Strict mode rejects unknown fields — matches send_email's policy.
 */
export const ReplyToEmailConfigSchema = z
  .object({
    /** Required. Graph message id of the message being replied to. */
    emailId: z.string().min(1),
    /** Q11 required: no hidden default for reply-vs-replyAll endpoint selection. */
    replyAll: z.boolean(),
    /** Required, may be empty. Graph wraps this as `{ comment }`. */
    body: z.string(),
  })
  .strict();

export type ReplyToEmailConfig = z.infer<typeof ReplyToEmailConfigSchema>;
