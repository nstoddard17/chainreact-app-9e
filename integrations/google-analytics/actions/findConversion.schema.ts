import { z } from "zod";

/**
 * Resolved-config schema for `google-analytics:find_conversion` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Read — finds a conversion event by name in a property. `accountId` is
 * optional UI-scope (D-GA4); `propertyId` runtime-required.
 * `conversionEventName` is backed by the future `:conversion_events`
 * resolver (GA-3); a free-text value is accepted at runtime. Field names
 * preserved from V1.
 */
export const FindConversionConfigSchema = z
  .object({
    accountId: z.string().optional(),
    propertyId: z.string().min(1, "propertyId is required."),
    conversionEventName: z
      .string()
      .min(1, "conversionEventName is required."),
  })
  .strict();

export type FindConversionConfig = z.infer<typeof FindConversionConfigSchema>;
