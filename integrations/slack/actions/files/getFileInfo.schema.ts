import { z } from "zod";

/**
 * Resolved-config schema for the Slack `get_file_info` action (Slack 2.4 Commit 4).
 *
 * Per Slack 2.4 plan §4.3 + §7 V1 rot fixes:
 *   - `fileId` is required. Strict Slack file-id regex.
 *   - `includeComments` is an optional boolean. When true the handler
 *     asks Slack for the first 100 comments. (Slack supports
 *     pagination beyond that; the action exposes only the first page,
 *     same as V1.)
 *   - No `workspace` selector, no `asUser` toggle, no `fileIdManual`
 *     / `fileSource` discriminator. V1 carried all three; V2 drops
 *     them per plan §7 rot #5–#7.
 *   - The schema is `.strict()` — unknown keys are rejected.
 */
export const SlackGetFileInfoConfigSchema = z
  .object({
    fileId: z
      .string()
      .regex(
        /^F[A-Z0-9]+$/,
        "Slack file id must match ^F[A-Z0-9]+$.",
      ),
    includeComments: z.boolean().optional(),
  })
  .strict();

export type SlackGetFileInfoConfig = z.infer<typeof SlackGetFileInfoConfigSchema>;
