import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `remove_label` action.
 *
 * Mirrors `addLabel.schema.ts` exactly — same inputs, same strict
 * shape, same V1-conflation rejections. The only behavioral
 * difference is at the handler level, where `labelIds` is routed
 * into `users.messages.modify`'s `removeLabelIds` field instead of
 * `addLabelIds`.
 *
 * Inputs:
 *   - `messageId` (required, single string).
 *   - `labelIds` (required, non-empty array) — label IDs to REMOVE
 *     from the message.
 *
 * Scope requirement: `gmail.modify` (shipped in Gmail 2.1 Commit 1).
 */
export const RemoveLabelConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
    labelIds: z
      .array(z.string().min(1))
      .min(1, "labelIds must include at least one label id."),
  })
  .strict();

export type RemoveLabelConfig = z.infer<typeof RemoveLabelConfigSchema>;
