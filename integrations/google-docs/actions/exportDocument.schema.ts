import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `export_document` action —
 * Slice 3.GDOCS-2.
 *
 * V1 → V2 deltas per GDOCS-1 §3.1 + §8.2:
 *   - `exportFormat` enum preserved verbatim (7 values).
 *   - `destination` REJECTED — V2 v1 returns a FileRef-shaped output,
 *     so the workflow author chains downstream actions to email /
 *     webhook / save. V1's `destination: "drive" | "email" |
 *     "webhook" | "workflow"` field is dropped from the schema; any
 *     value supplied surfaces as a strict-mode unknown-field error.
 *   - `fileName` optional — defaults to the document's title at the
 *     handler layer when omitted.
 *
 * The handler stages exported bytes to V2 storage via
 * `stageFileToStorage` and emits a `FileRef(kind=v2_storage)` —
 * downstream actions consume the FileRef.
 */

export const ExportDocumentFormatSchema = z.enum([
  "pdf",
  "docx",
  "txt",
  "html",
  "rtf",
  "epub",
  "odt",
]);
export type ExportDocumentFormat = z.infer<typeof ExportDocumentFormatSchema>;

export const ExportDocumentConfigSchema = z
  .object({
    documentId: z
      .string({ required_error: "documentId is required." })
      .min(1, "documentId is required."),
    exportFormat: ExportDocumentFormatSchema,
    fileName: z.string().min(1).optional(),
  })
  .strict();

export type ExportDocumentConfig = z.infer<typeof ExportDocumentConfigSchema>;
