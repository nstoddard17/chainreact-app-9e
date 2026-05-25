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
    cardId: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export type AddCommentConfig = z.infer<typeof AddCommentConfigSchema>;
