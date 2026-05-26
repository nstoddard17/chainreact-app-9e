import { z } from "zod";

/**
 * Resolved-config schema for the Trello `add_label_to_card` action.
 *
 * Required:
 *   - `cardId`  — the card to label.
 *   - `labelId` — Trello label id. V2 deliberately does NOT accept a
 *     label NAME — name-based lookup would require a fragile
 *     /1/boards/{id}/labels round-trip and produces ambiguous results
 *     when multiple labels share the same name. Workflow authors who
 *     have only a label name can chain a future `find_label` action
 *     in a later slice.
 */
export const AddLabelToCardConfigSchema = z
  .object({
    // UI-scope `boardId` (TRELLO-META-3) — NOT used by the handler.
    // Present so the `cardId` / `labelId` pickers cascade off this board
    // field. Handler-ignored; mirrors the Monday `boardId` UI-scope pattern.
    boardId: z.string().optional(),
    cardId: z.string().min(1),
    labelId: z.string().min(1),
  })
  .strict();

export type AddLabelToCardConfig = z.infer<typeof AddLabelToCardConfigSchema>;
