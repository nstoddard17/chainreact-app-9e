import { z } from "zod";
import { DateRangePresetSchema } from "./_dateRange";

/**
 * Resolved-config schema for `google-analytics:run_pivot_report` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Like `run_report` plus `pivotDimensions` (the column dimensions). `accountId`
 * is optional UI-scope (D-GA4). Field names preserved from V1.
 */
export const RunPivotReportConfigSchema = z
  .object({
    accountId: z.string().optional(),
    propertyId: z.string().min(1, "propertyId is required."),
    dateRange: DateRangePresetSchema,
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    metrics: z.array(z.string().min(1)).min(1, "At least one metric is required."),
    /** Row dimensions. */
    dimensions: z.array(z.string().min(1)).optional(),
    /** Column (pivot) dimensions. */
    pivotDimensions: z.array(z.string().min(1)).optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.dateRange === "custom" && (!cfg.startDate || !cfg.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message:
          "startDate and endDate are required when dateRange is 'custom'.",
      });
    }
  });

export type RunPivotReportConfig = z.infer<typeof RunPivotReportConfigSchema>;
