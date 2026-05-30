import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { conversionEventsCreate } from "@/integrations/_shared/google/api/analytics/conversionEventsCreate";
import { CreateConversionEventConfigSchema } from "./createConversionEvent.schema";

/**
 * Google Analytics `create_conversion_event` action handler — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Admin API write (GA4 `conversionEvents.create`) — marks an event as a
 * conversion on the property. Medium risk (recoverable by removing the
 * conversion in the GA console). `accountId` (UI-scope) ignored.
 *
 * Output (structural; no secrets): `{ eventName, countingMethod,
 * conversionEventId, resourceName, propertyId, createdAt }`.
 */
export const createConversionEvent: ActionHandler = async (input) => {
  const config = CreateConversionEventConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-analytics"
      ? input.triggerEvent.providerAccountId
      : null;

  const created = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-analytics",
    providerAccountId,
    apiCall: (accessToken) =>
      conversionEventsCreate({
        accessToken,
        propertyId: config.propertyId,
        eventName: config.eventName,
        ...(config.countingMethod !== undefined && {
          countingMethod: config.countingMethod,
        }),
        ...(config.customEvent !== undefined && { custom: config.customEvent }),
      }),
  });

  const conversionEventId =
    typeof created.name === "string"
      ? (created.name.split("/").pop() ?? null)
      : null;

  return {
    output: {
      eventName: created.eventName ?? config.eventName,
      countingMethod: created.countingMethod ?? config.countingMethod ?? null,
      conversionEventId,
      resourceName: created.name ?? null,
      propertyId: config.propertyId,
      createdAt: created.createTime ?? new Date().toISOString(),
    },
  };
};
