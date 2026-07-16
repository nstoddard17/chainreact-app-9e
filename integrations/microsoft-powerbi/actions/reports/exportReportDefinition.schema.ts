import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:export_report_definition` — the synchronous .pbix
 * definition download (`GET …/reports/{id}/Export`). Two ids only; the
 * endpoint takes no body.
 */
export const ExportReportDefinitionConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    reportId: z.string().min(1),
  })
  .strict();

export type ExportReportDefinitionConfig = z.infer<
  typeof ExportReportDefinitionConfigSchema
>;
