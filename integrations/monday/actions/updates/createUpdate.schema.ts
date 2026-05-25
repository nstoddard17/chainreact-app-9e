import { z } from "zod";

/**
 * Resolved-config schema for the Monday `create_update` action —
 * Slice 3.MONDAY-2.
 *
 * V1 field names preserved exactly:
 *   - `itemId` (required)
 *   - `body` (required) — note V1 also accepts `text` as a legacy
 *     alias but V2 standardizes on `body` since the GraphQL arg is
 *     `body`. Authors migrating from V1's `text` field rename it to
 *     `body` per CLAUDE.md's "no backwards-compat shims" rule.
 *   - `boardId` (optional, UI-scope — MONDAY-6) — NOT used by the
 *     GraphQL call; the handler ignores it. Present so the builder's
 *     `itemId` picker (`monday:items`) can cascade from a board.
 *     Mirrors the OneNote `notebookId` scope pattern. Strict mode
 *     would reject the persisted Builder config without this allowance.
 */
export const CreateUpdateConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    body: z
      .string({ required_error: "body is required." })
      .min(1, "body is required."),
    boardId: z.string().min(1).optional(),
  })
  .strict();

export type CreateUpdateConfig = z.infer<typeof CreateUpdateConfigSchema>;
