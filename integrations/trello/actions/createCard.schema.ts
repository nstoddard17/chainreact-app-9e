import { z } from "zod";

/**
 * Resolved-config schema for the Trello `create_card` action.
 *
 * Required fields per the Commit 4 prompt:
 *   - `listId` — Trello cards must belong to a list.
 *   - `name`   — card title.
 *
 * Optional fields — only those V1 supports cleanly (no attachment
 * branch, no location coordinates, no source-card copy):
 *   - `desc`        — Markdown description.
 *   - `pos`         — "top", "bottom", or a positive numeric position.
 *   - `due`         — ISO-8601 timestamp.
 *   - `dueComplete` — boolean.
 *   - `start`       — ISO-8601 timestamp.
 *   - `idMembers`   — array of Trello member ids.
 *   - `idLabels`    — array of Trello label ids.
 *
 * `.strict()` rejects unknown fields so misspelled config surfaces at
 * design-time validation rather than as a silent no-op at runtime.
 */
export const CreateCardConfigSchema = z
  .object({
    // UI-scope `boardId` (TRELLO-META-3) — NOT used by the handler.
    // Present so the persisted Builder config validates: the `listId` /
    // `idMembers` / `idLabels` pickers cascade off this board field
    // (trello:boards → trello:lists / trello:members / trello:labels).
    // Mirrors the Dropbox `folderPath` / OneNote `notebookId` / Monday
    // `boardId` UI-scope pattern. `.strict()` still rejects genuinely-
    // unknown fields.
    boardId: z.string().optional(),
    listId: z.string().min(1),
    name: z.string().min(1),
    desc: z.string().optional(),
    pos: z
      .union([z.literal("top"), z.literal("bottom"), z.number().positive()])
      .optional(),
    due: z.string().min(1).optional(),
    dueComplete: z.boolean().optional(),
    start: z.string().min(1).optional(),
    idMembers: z.array(z.string().min(1)).optional(),
    idLabels: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type CreateCardConfig = z.infer<typeof CreateCardConfigSchema>;
