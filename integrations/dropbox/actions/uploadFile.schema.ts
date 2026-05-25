import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for `dropbox:upload_file` — Slice 3.DROPBOX-2.
 *
 * FileRef consumer (replaces V1's 4-source `sourceType`/`fileFromNode`
 * antipattern). `path` is the destination FOLDER (root = `""`);
 * `filename` defaults to the FileRef's own name. `mode` defaults to
 * `"add"` (NEVER overwrites silently — no hidden high-risk default).
 */
export const UploadFileConfigSchema = z
  .object({
    file: FileRefSchema,
    /** Destination folder path; root is the empty string. */
    path: z.string().default(""),
    /** Overrides the uploaded file name; defaults to the FileRef name. */
    filename: z.string().min(1).optional(),
    mode: z.enum(["add", "overwrite"]).default("add"),
    autorename: z.boolean().default(false),
  })
  .strict();

export type UploadFileConfig = z.infer<typeof UploadFileConfigSchema>;
