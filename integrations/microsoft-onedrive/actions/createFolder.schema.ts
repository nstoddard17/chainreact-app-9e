import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive create_folder action.
 *
 * `name` is required. `parentItemId` optional — when omitted / "root",
 * folder is created at the drive root.
 *
 * Slice 8 sets `@microsoft.graph.conflictBehavior: "fail"` at the
 * wrapper layer per Q11 — if a folder of the same name already exists,
 * the action fails with a clear Graph "nameAlreadyExists" error
 * instead of silently renaming or overwriting. V1 defaulted to
 * "rename"; V2 makes the contract explicit.
 */
export const CreateFolderConfigSchema = z
  .object({
    name: z.string().min(1, "name is required."),
    parentItemId: z.string().optional(),
  })
  .strict();

export type CreateFolderConfig = z.infer<typeof CreateFolderConfigSchema>;
