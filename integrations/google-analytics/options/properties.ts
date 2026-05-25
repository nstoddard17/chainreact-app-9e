import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { accountSummariesList } from "@/integrations/_shared/google/api/analytics/accountSummariesList";
import { classifyGoogleAnalyticsResolverError } from "./_errors";

/**
 * `google-analytics:properties` options resolver — Slice
 * 3.GOOGLE-ANALYTICS-3.
 *
 * Account-scoped GA4 property picker. Backs the `propertyId` field on every
 * GA action (run_report / run_pivot_report / get_realtime_data /
 * find_conversion / create_conversion_event).
 *
 * **Dependency: `accountId` (verbatim).** `requiredDeps: ["accountId"]` — the
 * parent is the `google-analytics:accounts` selection. Derives the property
 * summaries from the SAME `accountSummaries.list` call (V1 strategy), then
 * filters to the chosen account. An account the user can't see / that has no
 * summary → empty `items` (cascade fallback, same as Monday / Facebook).
 *
 * Mapping: `value` = bare GA4 property id (`properties/{id}` stripped),
 * `label` = property displayName (id fallback), `description` = property type
 * when present. Sort: alphabetical by label. `q`: client-side substring.
 */
export const googleAnalyticsPropertiesResolver: OptionsResolver = {
  source: "google-analytics:properties",
  provider: "google-analytics",
  requiresIntegration: true,
  requiredDeps: ["accountId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Analytics integration. Connect Google Analytics first.",
      );
    }

    const accountId = ctx.deps.accountId;
    if (typeof accountId !== "string" || accountId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select an account first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "google-analytics",
        accountId: ctx.integration.providerAccountId,
        apiCall: (accessToken) => accountSummariesList({ accessToken }),
      });
    } catch (err) {
      throw classifyGoogleAnalyticsResolverError(err, "properties");
    }

    const summary = (result.accountSummaries ?? []).find(
      (s) =>
        typeof s.account === "string" &&
        s.account.replace(/^accounts\//, "") === accountId,
    );
    // No matching account summary (no access / stale account) → cascade
    // fallback to empty.
    if (!summary) return { items: [], hasMore: false };

    const mapped: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const prop of summary.propertySummaries ?? []) {
      const id =
        typeof prop.property === "string"
          ? prop.property.replace(/^properties\//, "")
          : null;
      if (!id) continue;
      const label =
        typeof prop.displayName === "string" && prop.displayName.length > 0
          ? prop.displayName
          : id;
      const description =
        typeof prop.propertyType === "string" && prop.propertyType.length > 0
          ? prop.propertyType
          : undefined;
      mapped.push(
        description !== undefined
          ? { value: id, label, description }
          : { value: id, label },
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
