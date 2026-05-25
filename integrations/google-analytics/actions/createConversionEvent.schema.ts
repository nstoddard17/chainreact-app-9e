import { z } from "zod";

/**
 * Resolved-config schema for `google-analytics:create_conversion_event` —
 * Slice 3.GOOGLE-ANALYTICS-2.
 *
 * Admin API write — marks an event as a conversion on a property. `accountId`
 * is optional UI-scope (D-GA4); `propertyId` + `eventName` runtime-required.
 * `countingMethod` / `customEvent` field names preserved from V1.
 */
export const CreateConversionEventConfigSchema = z
  .object({
    accountId: z.string().optional(),
    propertyId: z.string().min(1, "propertyId is required."),
    eventName: z.string().min(1, "eventName is required."),
    countingMethod: z
      .enum(["ONCE_PER_EVENT", "ONCE_PER_SESSION"])
      .optional(),
    customEvent: z.boolean().optional(),
  })
  .strict();

export type CreateConversionEventConfig = z.infer<
  typeof CreateConversionEventConfigSchema
>;
