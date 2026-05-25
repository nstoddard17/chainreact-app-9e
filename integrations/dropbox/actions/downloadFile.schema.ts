import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:download_file` — Slice 3.DROPBOX-2.
 * FileRef producer: downloads `path` and stages the bytes
 * (kind=v2_storage). `path` is the full Dropbox file path.
 *
 * `folderPath` (optional, UI-scope — DROPBOX-4): NOT used by the handler.
 * Present so the persisted Builder config validates — the `dropbox:files`
 * file picker on `path` cascades from this folder field
 * (`dropbox:folders`). Mirrors the OneNote `notebookId` / Monday `boardId`
 * UI-scope pattern. The handler ignores it; strict mode still rejects
 * genuinely unknown fields.
 */
export const DownloadFileConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
    folderPath: z.string().optional(),
  })
  .strict();

export type DownloadFileConfig = z.infer<typeof DownloadFileConfigSchema>;
