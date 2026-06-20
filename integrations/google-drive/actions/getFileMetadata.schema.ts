import { z } from "zod";

/**
 * Resolved-config schema for the Google Drive get_file_metadata action
 * (Slice 4.GDRIVE-READ-2).
 *
 * Metadata-only single-file read. Takes a `fileId` and returns a BOUNDED,
 * explicitly-projected set of metadata fields — NOT the raw Drive resource.
 *
 * `fileId` ships as a plain string (the `google-drive:files` options
 * resolver is deferred — a file id realistically comes from a trigger or a
 * List Files / Search Files output). Strict mode rejects unknown fields so
 * a paste-in config from a different action fails fast.
 *
 * This is metadata-only by contract: no `alt=media`, no bytes, no FileRef
 * (see docs/rules/file-output-contract.md — file content never rides an
 * action output; this read does not touch content at all).
 */
export const GetFileMetadataConfigSchema = z
  .object({
    fileId: z.string().min(1, "fileId is required."),
  })
  .strict();

export type GetFileMetadataConfig = z.infer<typeof GetFileMetadataConfigSchema>;
