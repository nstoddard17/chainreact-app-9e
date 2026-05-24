import { z } from "zod";

/**
 * Resolved-config schema for the Monday `download_file` action —
 * Slice 3.MONDAY-4 (FileRef producer).
 *
 * Field names:
 *   - `itemId` (required) — the item to read files from.
 *   - `columnId` (required) — a file-typed column id OR the
 *     `__item_files__` sentinel (the item's general files area). The
 *     MONDAY-3 `monday:file_columns` resolver always offers the sentinel
 *     as a valid option, so the field is always pickable.
 *   - `fileId` (optional) — a specific asset id to download. Defaults to
 *     the first file found.
 */
export const DownloadFileConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    columnId: z
      .string({ required_error: "columnId is required." })
      .min(1, "columnId is required."),
    fileId: z.string().min(1).optional(),
  })
  .strict();

export type DownloadFileConfig = z.infer<typeof DownloadFileConfigSchema>;

/** The download-only sentinel for the item's general files area. */
export const ITEM_FILES_SENTINEL = "__item_files__";
