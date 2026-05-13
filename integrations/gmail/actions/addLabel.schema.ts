import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `add_label` action.
 *
 * Message-level only for this commit (parity-gmail.md §7 +
 * Gmail 2.2 Commit 1 brief — "If thread support requires extra
 * wrapper complexity, keep Gmail 2.2 Commit 1 message-level only").
 * Thread-level labeling lands in a future slice with an explicit
 * `targetType: "message" | "thread"` discriminator.
 *
 * Inputs:
 *   - `messageId` (required, single string) — Gmail message id.
 *     Batch operation is OUT OF SCOPE for V2 — workflow authors who
 *     want to label multiple messages compose a loop step upstream.
 *     V1's "accepts array or single string" was source-of-shape
 *     ambiguity that complicated error-path handling.
 *   - `labelIds` (required, non-empty array) — Gmail label IDs to
 *     ADD to the message. No name-to-id lookup — workflow authors
 *     pass IDs directly. Label creation lives in `create_label`.
 *
 * V1 fields intentionally dropped (`.strict()` rejects):
 *   - `labels`, `addLabels` — V1 conflated name lists with id lists.
 *     V2 only accepts `labelIds`.
 *   - `removeLabels` — V1 combined add+remove in one handler. V2
 *     splits — use `remove_label` for the inverse.
 *   - `createIfNotExists` — V1's "auto-create label if missing"
 *     was a Q11-adjacent surprise. Label creation belongs to
 *     `create_label`.
 *   - `applyToThread` — silent message-vs-thread switching is a
 *     bug surface. Thread support requires explicit targeting in a
 *     future slice.
 *   - `searchQuery` — V1's "find messages by search then label them
 *     all" was a compound action. V2 splits — use `search_emails`
 *     upstream (when it lands) + iterate `add_label` downstream.
 *
 * Scope requirement: `gmail.modify` (shipped in Gmail 2.1 Commit 1).
 */
export const AddLabelConfigSchema = z
  .object({
    messageId: z.string().min(1, "messageId is required."),
    labelIds: z
      .array(z.string().min(1))
      .min(1, "labelIds must include at least one label id."),
  })
  .strict();

export type AddLabelConfig = z.infer<typeof AddLabelConfigSchema>;
