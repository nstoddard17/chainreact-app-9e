import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { accountSummariesList } from "@/integrations/_shared/google/api/analytics/accountSummariesList";
import { classifyGoogleAnalyticsResolverError } from "./_errors";

/**
 * `google-analytics:properties_flat` options resolver — Slice
 * ANALYTICS-SOURCES-GA-1.
 *
 * A FLAT, account-independent GA4 property picker for the Analytics dashboard
 * widget. Unlike the cascade `google-analytics:properties` (which needs an
 * `accountId` dep and backs the workflow action `propertyId` field), this lists
 * EVERY property the connected user can see across ALL their GA accounts in one
 * `accountSummaries.list` call — so the widget needs a SINGLE required picker, not
 * an account → property cascade.
 *
 * Mapping: `value` = bare GA4 property id (`properties/{id}` stripped), `label` =
 * property displayName (id fallback), `description` = the parent account's
 * displayName (helps disambiguate same-named properties across accounts). Sort:
 * by account label, then property label. `q`: client-side case-insensitive
 * substring over both. Only ids + display labels are surfaced — never report data,
 * data streams, the Measurement Protocol api_secret, or a token. Errors sanitized
 * via the shared `classifyGoogleAnalyticsResolverError` (no GA body passthrough).
 */
export const googleAnalyticsPropertiesFlatResolver: OptionsResolver = {
  source: "google-analytics:properties_flat",
  provider: "google-analytics",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Analytics integration. Connect Google Analytics first.",
      );
    }

    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-analytics",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => accountSummariesList({ accessToken }),
      });
    } catch (err) {
      throw classifyGoogleAnalyticsResolverError(err, "properties");
    }

    const mapped: Array<{ value: string; label: string; description?: string; accountLabel: string }> = [];
    for (const summary of result.accountSummaries ?? []) {
      const accountLabel =
        typeof summary.displayName === "string" && summary.displayName.length > 0
          ? summary.displayName
          : typeof summary.account === "string"
            ? summary.account.replace(/^accounts\//, "")
            : "";
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
        mapped.push(
          accountLabel.length > 0
            ? { value: id, label, description: accountLabel, accountLabel }
            : { value: id, label, accountLabel },
        );
      }
    }

    mapped.sort((a, b) => {
      const byAccount = a.accountLabel.toLowerCase().localeCompare(b.accountLabel.toLowerCase());
      if (byAccount !== 0) return byAccount;
      return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    });

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter(
            (i) =>
              i.label.toLowerCase().includes(lowerQ) ||
              i.accountLabel.toLowerCase().includes(lowerQ),
          )
        : mapped;

    // Drop the internal `accountLabel` sort key from the wire shape.
    const items = filtered.map((i) =>
      i.description !== undefined
        ? { value: i.value, label: i.label, description: i.description }
        : { value: i.value, label: i.label },
    );

    return { items, hasMore: false };
  },
};
