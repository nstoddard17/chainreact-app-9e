import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `mark_as_read` action.
 *
 * Single-message lifecycle: clears the `UNREAD` system label on the
 * message via `users.messages.modify`'s `removeLabelIds: ["UNREAD"]`.
 *
 * Inputs:
 *   - `messageId` (required, single string) — Gmail message id.
 *
 * V1 fields intentionally dropped (`.strict()` rejects):
 *   - `searchQuery` — V1's bulk-read-by-search compound action.
 *   - Array shape `messageId` — single string only (workflow authors
 *     loop upstream if batching is needed).
 *
 * Scope requirement: `gmail.modify` (Gmail 2.1 Commit 1).
 */
export const MarkAsReadConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
  })
  .strict();

export type MarkAsReadConfig = z.infer<typeof MarkAsReadConfigSchema>;
