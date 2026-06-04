import { z } from "zod";

/**
 * Workflow-folder API contracts (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Request schemas for the /api/folders routes + the client-facing folder shape.
 * Trash fields are intentionally absent — they surface in WF-3.
 */

export const WorkflowFolderSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  parentFolderId: z.string().uuid().nullable(),
  name: z.string(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowFolder = z.infer<typeof WorkflowFolderSchema>;

export const CreateFolderRequestSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required.").max(120),
  parentFolderId: z.string().uuid().nullable().optional(),
});
export type CreateFolderRequest = z.infer<typeof CreateFolderRequestSchema>;

export const UpdateFolderRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Folder name is required.").max(120).optional(),
    // `undefined` = leave parent unchanged; explicit `null` = move to top level.
    parentFolderId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentFolderId !== undefined, {
    message: "At least one field must be provided.",
  });
export type UpdateFolderRequest = z.infer<typeof UpdateFolderRequestSchema>;

export const ReorderFoldersRequestSchema = z.object({
  // null = reorder the top-level sibling group.
  parentFolderId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(1, "orderedIds must not be empty."),
});
export type ReorderFoldersRequest = z.infer<typeof ReorderFoldersRequestSchema>;
