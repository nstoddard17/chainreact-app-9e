import { z } from "zod";

/**
 * Resolved-config schema for the Trello `move_card` action.
 *
 * Required:
 *   - `cardId` — the card being moved.
 *   - `idList` — the target list. Q11 — no silent default to "first
 *     list in board"; workflow authors must pick the destination.
 *
 * Optional:
 *   - `pos` — "top", "bottom", or numeric position within the target
 *     list. When omitted, Trello places the card at its current
 *     position; V2 does NOT inject a default — preserving Trello's
 *     server-side behavior keeps the action a pure move.
 */
export const MoveCardConfigSchema = z
  .object({
    cardId: z.string().min(1),
    idList: z.string().min(1),
    pos: z
      .union([z.literal("top"), z.literal("bottom"), z.number().positive()])
      .optional(),
  })
  .strict();

export type MoveCardConfig = z.infer<typeof MoveCardConfigSchema>;
