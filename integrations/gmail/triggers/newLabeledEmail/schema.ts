import { z } from "zod";

/**
 * Zod schema for the Gmail "new_labeled_email" trigger config.
 *
 * Gmail 2.3 Commit 3 — minimal labelId-only filter set per
 * parity-gmail.md decision 13.3. V1's `from` filter and
 * `includeReplies` toggle are intentionally NOT ported in the first
 * version; they can land in a follow-up slice if real workflows ask
 * for them.
 *
 *   - `labelId` is the workflow's "fire when THIS label is applied"
 *     selector. Matched against the addedLabelIds list each Gmail
 *     `labelsAdded` history record carries.
 *   - `pollingEnabled` / `snapshot` / `polling` mirror the
 *     new_email trigger conventions so the cron + activation
 *     orchestrator treat both triggers uniformly.
 *
 * V1 fields intentionally dropped (.strict() rejects):
 *   - `from` — V1 had it as `email-autocomplete`. Easy to add later.
 *   - `includeReplies` — V1's toggle was implemented inconsistently;
 *     replies that carry the configured label fire by default in
 *     V2's design.
 *   - V1 newEmail filter fields (`subject`, `hasAttachment`,
 *     `labelIds[]`) — not the same trigger.
 *
 * Scope requirement: `gmail.readonly` (already shipped in Slice 2).
 */
export const GmailNewLabeledEmailConfigSchema = z
  .object({
    /** The label whose application fires this trigger. Required. */
    labelId: z.string().min(1, "labelId is required."),

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

export type GmailNewLabeledEmailConfig = z.infer<
  typeof GmailNewLabeledEmailConfigSchema
>;
