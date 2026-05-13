import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `archive_email` action.
 *
 * Archiving in Gmail is the removal of the `INBOX` system label via
 * `users.messages.modify`'s `removeLabelIds: ["INBOX"]`. The message
 * still exists; it just no longer surfaces in the inbox view.
 *
 * Inputs:
 *   - `messageId` (required, single string).
 *
 * V1 conflations dropped: same as `mark_as_read` / `mark_as_unread`.
 *
 * Scope requirement: `gmail.modify` (Gmail 2.1 Commit 1).
 */
export const ArchiveEmailConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
  })
  .strict();

export type ArchiveEmailConfig = z.infer<typeof ArchiveEmailConfigSchema>;
