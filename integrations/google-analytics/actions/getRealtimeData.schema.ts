import { z } from "zod";

/**
 * Resolved-config schema for `google-analytics:get_realtime_data` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Promotes the V1 orphan handler. Realtime has no date range. `accountId` is
 * optional UI-scope (D-GA4); `propertyId` is runtime-required. Field names
 * preserved from V1.
 */
export const GetRealtimeDataConfigSchema = z
  .object({
    accountId: z.string().optional(),
    propertyId: z.string().min(1, "propertyId is required."),
    metrics: z.array(z.string().min(1)).min(1, "At least one metric is required."),
    dimensions: z.array(z.string().min(1)).optional(),
    limit: z.number().int().positive().optional(),
  })
  .strict();

export type GetRealtimeDataConfig = z.infer<typeof GetRealtimeDataConfigSchema>;
