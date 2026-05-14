import { z } from "zod";

/**
 * Zod schema for the Gmail "new_attachment" trigger config.
 *
 * Gmail 2.3 Commit 4 — fire-on-any-attachment first version per Gmail
 * 2.3 plan decisions §13.2 (metadata-only payload) and §13.5 (V1's
 * optional filters `fileType` / `from` / `minSize` deferred to a
 * follow-up slice).
 *
 *   - No user-set filter fields in this commit. The trigger fires on
 *     every messagesAdded event whose hydrated message carries at
 *     least one attachment (filename + body.attachmentId per
 *     `extractAttachmentMetadata`). Workflows that need refinement
 *     compose downstream filter actions.
 *   - `pollingEnabled` / `snapshot` / `polling` mirror new_email and
 *     new_labeled_email so the cron + activation orchestrator treat
 *     all three triggers uniformly.
 *
 * V1 fields intentionally NOT ported (.strict() rejects):
 *   - `fileType` — V1 mapped a UX enum (pdf/image/document/…) to mime
 *     wildcard checks. Adds without porting the lookup table is worse
 *     than nothing; deferred.
 *   - `from` — V1's `email-autocomplete` field. Simple header check
 *     once we have a UX story for the field; deferred.
 *   - `minSize` — would inspect attachment `body.size`. Trivial to add
 *     later; not blocking the trigger.
 *   - V1 newEmail fields (`subject`, `hasAttachment`, `labelIds[]`,
 *     AI content filter, …) — not the same trigger.
 *
 * Scope requirement: `gmail.readonly` (already shipped in Slice 2;
 * format=full requires no additional scope per Gmail 2.3 plan §11).
 */
export const GmailNewAttachmentConfigSchema = z
  .object({
    // Polling-state fields (set by activation hook + advanced by poll loop)
    pollingEnabled: z.boolean().default(false),
    snapshot: z
      .object({
        historyId: z.string().min(1),
        capturedAt: z.string().min(1),
      })
      .optional(),
    polling: z
      .object({
        lastPolledAt: z.string().min(1),
      })
      .optional(),
  })
  .strict();

export type GmailNewAttachmentConfig = z.infer<
  typeof GmailNewAttachmentConfigSchema
>;
