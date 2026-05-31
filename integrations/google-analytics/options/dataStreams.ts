import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { dataStreamsList } from "@/integrations/_shared/google/api/analytics/dataStreamsList";
import {
  classifyGoogleAnalyticsResolverError,
  AnalyticsNotFoundError,
} from "./_errors";

/**
 * `google-analytics:data_streams` options resolver — Slice
 * 3.GOOGLE-ANALYTICS-3.
 *
 * Property-scoped data-stream picker. Backs the `measurementId` field on
 * `send_event` — so the option **value is the measurement id** (`G-XXXX`),
 * not the stream resource id. Only WEB streams carry a measurement id (app
 * streams use a Firebase app id and have no Measurement Protocol
 * measurement_id), so app streams are filtered out.
 *
 * **Dependency: `propertyId` (verbatim).** `requiredDeps: ["propertyId"]`. A
 * property the user can't access → `AnalyticsNotFoundError` → empty `items`
 * (cascade fallback).
 *
 * Mapping: `value` = measurementId, `label` = stream displayName
 * (measurementId fallback), `description` = the measurement id (handy
 * disambiguation). Sort: alphabetical by label. `q`: client-side substring.
 *
 * **Security:** the response carries NO Measurement Protocol api_secret — the
 * resolver never reads the `measurementProtocolSecrets` sub-resource. Only
 * the public `measurementId` is surfaced.
 */
export const googleAnalyticsDataStreamsResolver: OptionsResolver = {
  source: "google-analytics:data_streams",
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

    const integration = ctx.integration;

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
        accountId: integration.accountId,
        provider: "google-analytics",
        providerAccountId: ctx.integration.providerAccountId,
        apiCall: (accessToken) => dataStreamsList({ accessToken, propertyId }),
      });
    } catch (err) {
      if (err instanceof AnalyticsNotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyGoogleAnalyticsResolverError(err, "data streams");
    }

    const mapped: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const stream of result.dataStreams ?? []) {
      const measurementId = stream.webStreamData?.measurementId;
      // Only WEB streams have a measurement id (the send_event consumer).
      if (typeof measurementId !== "string" || measurementId.length === 0) {
        continue;
      }
      const label =
        typeof stream.displayName === "string" && stream.displayName.length > 0
          ? stream.displayName
          : measurementId;
      mapped.push({ value: measurementId, label, description: measurementId });
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
