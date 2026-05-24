import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for the Monday `add_file` action —
 * Slice 3.MONDAY-4 (FileRef consumer).
 *
 * V2-native FileRef shape replaces V1's source-type mux (url / node /
 * uploaded-file). The workflow author hands a `FileRef` (produced by a
 * download/staging action — slack:download_file, gmail:get_attachment,
 * monday:download_file, …) and the handler resolves it to bytes for
 * Monday's multipart `add_file_to_column` upload.
 *
 * Field names:
 *   - `itemId` (required) — Monday item to attach the file to.
 *   - `columnId` (required) — a FILE-typed column id. Monday's
 *     `add_file_to_column` requires a real file column; the
 *     `__item_files__` sentinel (download-only) is NOT valid here.
 *   - `file` (required) — `FileRef` (the V2 file-input convention;
 *     matches airtable:add_attachment, slack:upload_file).
 *   - `filename` (optional) — override for Monday's stored display name;
 *     defaults to the FileRef's own name.
 */
export const AddFileConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    columnId: z
      .string({ required_error: "columnId is required." })
      .min(1, "columnId is required."),
    file: FileRefSchema,
    filename: z.string().min(1).optional(),
  })
  .strict();

export type AddFileConfig = z.infer<typeof AddFileConfigSchema>;
