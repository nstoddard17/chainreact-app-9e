import { z } from "zod";

/**
 * Resolved-config schema for the Trello `add_comment` action.
 *
 * Required:
 *   - `cardId` — the card to comment on.
 *   - `text`   — comment body. Trello supports Markdown.
 */
export const AddCommentConfigSchema = z
  .object({
    // UI-scope `boardId` (TRELLO-META-3) — NOT used by the handler.
    // Present so the `cardId` picker cascades off this board field.
    // Handler-ignored; mirrors the Monday `boardId` UI-scope pattern.
    boardId: z.string().optional(),
    cardId: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export type AddCommentConfig = z.infer<typeof AddCommentConfigSchema>;
