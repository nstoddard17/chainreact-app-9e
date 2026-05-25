import { z } from "zod";

/**
 * Resolved-config schema for the Trello `create_board` action.
 *
 * Required:
 *   - `name`       — board title.
 *   - `visibility` — EXPLICIT high-risk default. V1 silently defaulted
 *     to `"private"`; V2 makes the choice mandatory per Q11. Workflow
 *     authors picking a Trello visibility now decide in the workflow
 *     instead of inheriting an invisible default.
 *
 * Optional:
 *   - `desc`         — Markdown description.
 *   - `defaultLists` — when true, Trello creates default "To Do /
 *     Doing / Done" lists. Defaults to `false` so workflows compose
 *     lists explicitly. V1 had hardcoded Kanban / Agile / Weekly
 *     template lists baked in — V2 ships only the primitive.
 *
 * Visibility values:
 *   - `private`   — board members only (Trello's most restrictive).
 *   - `workspace` — anyone in the linked Trello workspace.
 *   - `public`    — anyone with the URL.
 */
export const CreateBoardConfigSchema = z
  .object({
    name: z.string().min(1),
    visibility: z.enum(["private", "workspace", "public"]),
    desc: z.string().optional(),
    defaultLists: z.boolean().default(false),
  })
  .strict();

export type CreateBoardConfig = z.infer<typeof CreateBoardConfigSchema>;
