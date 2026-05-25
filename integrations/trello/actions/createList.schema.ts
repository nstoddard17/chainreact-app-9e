import { z } from "zod";

/**
 * Resolved-config schema for the Trello `create_list` action.
 *
 * Required:
 *   - `idBoard` — the board the list will live in.
 *   - `name`    — list title.
 *
 * Optional:
 *   - `pos` — "top", "bottom", or numeric position. Trello defaults to
 *     "bottom" server-side when omitted; V2 does NOT inject a default
 *     so the server-side default applies transparently.
 *
 * V1 had a position-resolution branch ("after_first", "before_last",
 * "middle", "custom") that GETs the existing lists and computes
 * fractional positions. V2 ships only the primitive — workflow authors
 * who need fractional positioning can compute it explicitly. Keeps the
 * action surface small and avoids V1's hidden side-effect of reading
 * board state.
 */
export const CreateListConfigSchema = z
  .object({
    idBoard: z.string().min(1),
    name: z.string().min(1),
    pos: z
      .union([z.literal("top"), z.literal("bottom"), z.number().positive()])
      .optional(),
  })
  .strict();

export type CreateListConfig = z.infer<typeof CreateListConfigSchema>;
