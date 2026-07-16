import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:export_power_bi_report_to_file`.
 *
 * Q11: `format` is REQUIRED with no silent default — it switches the
 * produced artifact type. `pageName` optional: set → only that page is
 * exported (wire `powerBIReportConfiguration.pages`); omitted → the
 * whole report. PNG / PDF / PPTX is the documented Power BI-report
 * format set (paginated-only formats live on the paginated action).
 */
export const ExportPowerBiReportToFileConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    reportId: z.string().min(1),
    format: z.enum(["PDF", "PPTX", "PNG"]),
    pageName: z.string().min(1).optional(),
  })
  .strict();

export type ExportPowerBiReportToFileConfig = z.infer<
  typeof ExportPowerBiReportToFileConfigSchema
>;
