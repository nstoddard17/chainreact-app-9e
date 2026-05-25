import { z } from "zod";
import { DateRangePresetSchema } from "./_dateRange";

/**
 * Resolved-config schema for `google-analytics:run_report` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * `propertyId` is the only runtime-required GA4 identifier. `accountId` is an
 * optional **UI-scope** field (D-GA4) — the Builder uses it to scope the
 * future property picker (GA-3 cascade); the runtime ignores it. Declared
 * here so the strict schema ACCEPTS it without rejecting the persisted
 * Builder config. Field names preserved from V1.
 */
export const RunReportConfigSchema = z
  .object({
    /** UI-scope only — scopes the property picker; ignored at runtime. */
    accountId: z.string().optional(),
    propertyId: z.string().min(1, "propertyId is required."),
    dateRange: DateRangePresetSchema,
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    metrics: z.array(z.string().min(1)).min(1, "At least one metric is required."),
    dimensions: z.array(z.string().min(1)).optional(),
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

export type RunReportConfig = z.infer<typeof RunReportConfigSchema>;
