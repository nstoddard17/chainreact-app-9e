import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { conversionEventsList } from "@/integrations/_shared/google/api/analytics/conversionEventsList";
import { FindConversionConfigSchema } from "./findConversion.schema";

/**
 * Google Analytics `find_conversion` action handler — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Read (GA4 Admin API `conversionEvents.list`). Lists the property's
 * conversion events and matches by `eventName`. `accountId` (UI-scope)
 * ignored.
 *
 * Output: `{ found, eventName, countingMethod, conversionEventId,
 *            resourceName }`. `found:false` + nulls when no match.
 */
export const findConversion: ActionHandler = async (input) => {
  const config = FindConversionConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-analytics"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-analytics",
    providerAccountId,
    apiCall: (accessToken) =>
      conversionEventsList({ accessToken, propertyId: config.propertyId }),
  });

  const match = (result.conversionEvents ?? []).find(
    (e) => e.eventName === config.conversionEventName,
  );

  if (!match) {
    return {
      output: {
        found: false,
        eventName: config.conversionEventName,
        countingMethod: null,
        conversionEventId: null,
        resourceName: null,
      },
    };
  }

  // Resource name shape: properties/{property}/conversionEvents/{id}.
  const conversionEventId =
    typeof match.name === "string" ? (match.name.split("/").pop() ?? null) : null;

  return {
    output: {
      found: true,
      eventName: match.eventName ?? config.conversionEventName,
      countingMethod: match.countingMethod ?? null,
      conversionEventId,
      resourceName: match.name ?? null,
    },
  };
};
