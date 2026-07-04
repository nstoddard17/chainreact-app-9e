import { z } from "zod";

/**
 * Resolved-config schema for `asana:add_comment_to_task` — Slice 5.ASANA-1.
 *
 * `POST /tasks/{gid}/stories` with `{ text }` (scope `stories:write`).
 * Plain-text comments only in this slice (html_text deferred).
 * `workspaceId` / `projectId` are UI-scope only for the task-picker
 * cascade.
 */
export const AddCommentToTaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    taskGid: z
      .string({ required_error: "taskGid is required." })
      .min(1, "taskGid is required."),
    text: z
      .string({ required_error: "text is required." })
      .min(1, "text is required."),
  })
  .strict();

export type AddCommentToTaskConfig = z.infer<
  typeof AddCommentToTaskConfigSchema
>;
