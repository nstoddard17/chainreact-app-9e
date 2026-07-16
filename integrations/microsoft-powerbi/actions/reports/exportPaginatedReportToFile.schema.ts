import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:export_paginated_report_to_file`.
 *
 * Q11: `format` is REQUIRED with no silent default. The enum is the
 * documented paginated-report `FileFormat` set from research.md §2.2
 * (PDF + PPTX are format-set members for both report kinds; XLSX /
 * DOCX / CSV / XML / MHTML / ACCESSIBLEPDF are paginated-only; PNG is
 * documented as Power BI-reports-only and IMAGE requires device-info
 * formatSettings, so neither is offered here).
 *
 * `parameterValues` → `paginatedReportConfiguration.parameterValues`
 * (RDL report parameters); sent only when non-empty.
 */

const ParameterValueSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

export const ExportPaginatedReportToFileConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    paginatedReportId: z.string().min(1),
    format: z.enum([
      "PDF",
      "PPTX",
      "XLSX",
      "DOCX",
      "CSV",
      "XML",
      "MHTML",
      "ACCESSIBLEPDF",
    ]),
    parameterValues: z.array(ParameterValueSchema).min(1).max(50).optional(),
  })
  .strict();

export type ExportPaginatedReportToFileConfig = z.infer<
  typeof ExportPaginatedReportToFileConfigSchema
>;
