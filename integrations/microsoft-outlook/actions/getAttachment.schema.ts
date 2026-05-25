import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook get_attachment action.
 *
 * Outlook Mail 2.3 Commit 4 — P-O2 fileAttachment-only port. Returns
 * `FileRef[]` via P-S3 `stageFileToStorage`.
 *
 * Field semantics:
 *   - `emailId`: required Graph message id.
 *   - `downloadMode`: filter strategy. Default `"all"` (non-high-risk
 *     schema default per Q11 — bounds output, no side effect).
 *       - `"all"` — every attachment passes the mode filter.
 *       - `"by_extension"` — match against `fileExtensions` (CSV-or-
 *         array). Leading dots stripped, case-insensitive.
 *       - `"by_name"` — case-insensitive substring match against
 *         `fileNameFilter`.
 *   - `fileExtensions`: required only when `downloadMode ===
 *     "by_extension"`. Schema accepts string OR array; handler
 *     enforces presence + parses via `parseCsvList`.
 *   - `fileNameFilter`: required only when `downloadMode === "by_name"`.
 *   - `excludeInline`: default `true` (V1-parity). Skip attachments
 *     marked `isInline: true` (embedded HTML images). Non-high-risk
 *     schema default per Q11.
 *
 * P-O2 disposition per audit + 2.1 acceptance:
 *   - fileAttachment → PORT (bytes staged to workflow_files storage).
 *   - itemAttachment → SKIP (metadata-only stub with skipped:true).
 *   - referenceAttachment → SKIP (metadata-only stub).
 *
 * Strict mode rejects unknown fields.
 */
export const GetAttachmentConfigSchema = z
  .object({
    emailId: z.string().min(1),
    downloadMode: z
      .enum(["all", "by_extension", "by_name"])
      .default("all"),
    /** CSV-or-array; required by handler when downloadMode is by_extension. */
    fileExtensions: z
      .union([z.string().min(1), z.array(z.string()).min(1)])
      .optional(),
    /** Substring filter; required by handler when downloadMode is by_name. */
    fileNameFilter: z.string().min(1).optional(),
    excludeInline: z.boolean().default(true),
  })
  .strict();

export type GetAttachmentConfig = z.infer<typeof GetAttachmentConfigSchema>;
