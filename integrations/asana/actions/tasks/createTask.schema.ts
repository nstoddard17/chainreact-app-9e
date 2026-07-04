import { z } from "zod";

/**
 * Resolved-config schema for `asana:create_task` — Slice 5.ASANA-1.
 *
 * Green-field field names (no V1 compat constraints — see v1-audit.md):
 *   - `workspaceId` — UI-scope only (cascade root for the project /
 *     assignee pickers). The API call never sends it: Asana derives the
 *     workspace from `projects` (research.md "POST /tasks").
 *   - `projectId` (required) — the project the task is created in.
 *   - `name` (required) — task title.
 *   - `notes` / `assigneeId` / `dueOn` — optional. Empty strings are
 *     treated as "not provided" by the handler (builder-cleared optional
 *     fields arrive as "").
 *   - `dueOn` — date-only `YYYY-MM-DD` (Asana `due_on`).
 *
 * Sections are DEFERRED from this slice (scope ambiguity — see
 * implementation-plan.md); tasks land in the project's default section.
 */
export const CreateTaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z
      .string({ required_error: "projectId is required." })
      .min(1, "projectId is required."),
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

export type CreateTaskConfig = z.infer<typeof CreateTaskConfigSchema>;
