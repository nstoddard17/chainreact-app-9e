import { z } from "zod";

/**
 * Resolved-config schema for `asana:complete_task` — Slice 5.ASANA-1.
 *
 * Completing = `PUT /tasks/{gid}` with `{ completed: true }` (research.md).
 * `workspaceId` / `projectId` are UI-scope only for the task-picker
 * cascade.
 */
export const CompleteTaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    taskGid: z
      .string({ required_error: "taskGid is required." })
      .min(1, "taskGid is required."),
  })
  .strict();

export type CompleteTaskConfig = z.infer<typeof CompleteTaskConfigSchema>;
