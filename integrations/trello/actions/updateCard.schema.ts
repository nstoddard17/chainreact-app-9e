import { z } from "zod";

/**
 * Resolved-config schema for the Trello `update_card` action.
 *
 * Required:
 *   - `cardId` — Trello card id.
 *
 * Optional (at least one MUST be provided — see superRefine below):
 *   - `name`, `desc`, `idList`, `pos`, `due`, `dueComplete`, `start`,
 *     `closed`.
 *
 * Q11 — no empty updates. Sending PUT /cards/{id} with an empty body is
 * a no-op against Trello's API; V2 rejects it at config-validation
 * time so workflow authors fail loud rather than silently no-op'ing.
 */
export const UpdateCardConfigSchema = z
  .object({
    cardId: z.string().min(1),
    name: z.string().min(1).optional(),
    desc: z.string().optional(),
    idList: z.string().min(1).optional(),
    pos: z
      .union([z.literal("top"), z.literal("bottom"), z.number().positive()])
      .optional(),
    due: z.string().min(1).optional(),
    dueComplete: z.boolean().optional(),
    start: z.string().min(1).optional(),
    closed: z.boolean().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const mutable: ReadonlyArray<keyof typeof cfg> = [
      "name",
      "desc",
      "idList",
      "pos",
      "due",
      "dueComplete",
      "start",
      "closed",
    ];
    const anyProvided = mutable.some((k) => cfg[k] !== undefined);
    if (!anyProvided) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message:
          "update_card requires at least one mutable field (name, desc, idList, pos, due, dueComplete, start, or closed).",
      });
    }
  });

export type UpdateCardConfig = z.infer<typeof UpdateCardConfigSchema>;
