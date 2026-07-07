import { z } from "zod";

/**
 * Resolved-config schema for `asana:create_subtask` — ASANA-2.
 *
 *   - `workspaceId` / `projectId` — UI-scope only (cascade for the
 *     parent-task / assignee pickers). The API call never sends them:
 *     the subtask inherits its parent's project placement.
 *   - `parentTaskGid` (required) — the task the subtask is created under.
 *   - `name` (required) — subtask title.
 *   - `notes` / `assigneeId` / `dueOn` — optional. Empty strings are
 *     treated as "not provided" by the handler (builder-cleared optional
 *     fields arrive as "").
 *   - `dueOn` — date-only `YYYY-MM-DD` (Asana `due_on`).
 */
export const CreateSubtaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    parentTaskGid: z
      .string({ required_error: "parentTaskGid is required." })
      .min(1, "parentTaskGid is required."),
    name: z
      .string({ required_error: "name is required." })
      .min(1, "name is required."),
    notes: z.string().optional(),
    assigneeId: z.string().optional(),
    dueOn: z
      .union([
        z.literal(""),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueOn must be YYYY-MM-DD."),
      ])
      .optional(),
  })
  .strict();

export type CreateSubtaskConfig = z.infer<typeof CreateSubtaskConfigSchema>;
