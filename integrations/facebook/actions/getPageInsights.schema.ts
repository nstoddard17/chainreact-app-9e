import { z } from "zod";

/**
 * Resolved-config schema for `facebook:get_page_insights` — Slice
 * 3.FACEBOOK-2. Pure read. `metric` is a comma-separated Graph metric
 * list; `period` is the Graph aggregation window. Optional ISO `since` /
 * `until` bound the range. Field names preserved from V1.
 */
export const GetPageInsightsConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    metric: z.string().min(1, "metric is required."),
    period: z.enum(["day", "week", "days_28"]).default("day"),
    since: z.string().datetime({ offset: true }).optional(),
    until: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type GetPageInsightsConfig = z.infer<typeof GetPageInsightsConfigSchema>;
