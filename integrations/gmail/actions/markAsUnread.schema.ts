import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `mark_as_unread` action.
 *
 * Inverse of `mark_as_read`: adds the `UNREAD` system label via
 * `users.messages.modify`'s `addLabelIds: ["UNREAD"]`.
 *
 * Inputs:
 *   - `messageId` (required, single string).
 *
 * Same V1 conflations dropped as `mark_as_read` — no searchQuery,
 * no array shape.
 *
 * Scope requirement: `gmail.modify` (Gmail 2.1 Commit 1).
 */
export const MarkAsUnreadConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
  })
  .strict();

export type MarkAsUnreadConfig = z.infer<typeof MarkAsUnreadConfigSchema>;
