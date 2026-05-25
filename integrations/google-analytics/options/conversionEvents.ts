import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { conversionEventsList } from "@/integrations/_shared/google/api/analytics/conversionEventsList";
import {
  classifyGoogleAnalyticsResolverError,
  AnalyticsNotFoundError,
} from "./_errors";

/**
 * `google-analytics:conversion_events` options resolver — Slice
 * 3.GOOGLE-ANALYTICS-3.
 *
 * Property-scoped conversion-event picker. Backs the `conversionEventName`
 * field on `find_conversion` (a UX upgrade over the GA-2 free-text input).
 * Reuses the GOOGLE-ANALYTICS-2 `conversionEventsList` Admin API wrapper.
 *
 * **Dependency: `propertyId` (verbatim).** `requiredDeps: ["propertyId"]`. A
 * property the user can't access → `AnalyticsNotFoundError` → empty `items`
 * (cascade fallback).
 *
 * Mapping: `value` = eventName, `label` = eventName, `description` = counting
 * method (+ "custom" marker) when present. Sort: alphabetical by label. `q`:
 * client-side substring.
 */
export const googleAnalyticsConversionEventsResolver: OptionsResolver = {
  source: "google-analytics:conversion_events",
  provider: "google-analytics",
  requiresIntegration: true,
  requiredDeps: ["propertyId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Analytics integration. Connect Google Analytics first.",
      );
    }

    const propertyId = ctx.deps.propertyId;
    if (typeof propertyId !== "string" || propertyId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a property first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "google-analytics",
        accountId: ctx.integration.providerAccountId,
        apiCall: (accessToken) =>
          conversionEventsList({ accessToken, propertyId }),
      });
    } catch (err) {
      if (err instanceof AnalyticsNotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyGoogleAnalyticsResolverError(err, "conversion events");
    }

    const mapped: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const event of result.conversionEvents ?? []) {
      const eventName = event.eventName;
      if (typeof eventName !== "string" || eventName.length === 0) continue;
      const parts: string[] = [];
      if (typeof event.countingMethod === "string" && event.countingMethod.length > 0) {
        parts.push(event.countingMethod);
      }
      if (event.custom === true) parts.push("custom");
      const description = parts.length > 0 ? parts.join(" · ") : undefined;
      mapped.push(
        description !== undefined
          ? { value: eventName, label: eventName, description }
          : { value: eventName, label: eventName },
      );
    }

    mapped.sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((i) => i.label.toLowerCase().includes(lowerQ))
        : mapped;

    return { items: filtered, hasMore: false };
  },
};
