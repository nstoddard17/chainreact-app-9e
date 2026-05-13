import { z } from "zod";

/**
 * Resolved-config schema for the Slack `download_file` action (Slack 2.4 Commit 4).
 *
 * Per Slack 2.4 plan §4.2 + §7 V1 rot fixes:
 *   - `fileId` is the sole input. Strict Slack file-id regex
 *     (`^F[A-Z0-9]+$`). No `workspace` selector. No `asUser` toggle.
 *     No `fileSource` discriminator. No download URL override.
 *   - The schema is `.strict()` — any stale workflow definition that
 *     carried V1 fields fails at parse time rather than smuggling
 *     them into the handler.
 *
 * Output (handler-side) is a `FileRef(kind=v2_storage)` after the
 * handler stages bytes through `stageFileToStorage`. No bytes / base64
 * appear on the schema's request OR response side.
 */
export const SlackDownloadFileConfigSchema = z
  .object({
    /**
     * Slack file id (F-prefixed). Same strict regex
     * Slack 2.4 `upload_file` uses on its returned file id.
     */
    fileId: z
      .string()
      .regex(
        /^F[A-Z0-9]+$/,
        "Slack file id must match ^F[A-Z0-9]+$.",
      ),
  })
  .strict();

export type SlackDownloadFileConfig = z.infer<typeof SlackDownloadFileConfigSchema>;
