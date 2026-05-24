import { z } from "zod";

/**
 * Resolved-config schema for the Monday `create_board` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardName` (required)
 *   - `boardKind` (required, NO default) — controls workspace-wide
 *     visibility. `public` exposes the board to the entire workspace,
 *     so per the no-hidden-high-risk-defaults principle the workflow
 *     author MUST choose explicitly. V1 enforced the same via
 *     `requireExplicitField`. Enum: public / private / share.
 *   - `description` (optional)
 */
export const CreateBoardConfigSchema = z
  .object({
    boardName: z
      .string({ required_error: "boardName is required." })
      .min(1, "boardName is required."),
    boardKind: z.enum(["public", "private", "share"], {
      required_error:
        "boardKind is required (public / private / share) — board visibility must be chosen explicitly.",
    }),
    description: z.string().min(1).optional(),
  })
  .strict();

export type CreateBoardConfig = z.infer<typeof CreateBoardConfigSchema>;
