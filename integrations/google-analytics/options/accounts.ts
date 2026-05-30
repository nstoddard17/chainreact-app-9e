import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { accountSummariesList } from "@/integrations/_shared/google/api/analytics/accountSummariesList";
import { classifyGoogleAnalyticsResolverError } from "./_errors";

/**
 * `google-analytics:accounts` options resolver — Slice 3.GOOGLE-ANALYTICS-3.
 *
 * Account-scoped top-level picker (no deps). The cascade root that
 * `google-analytics:properties` depends on. Lists the user's GA accounts via
 * Admin API `accountSummaries.list` (the same call `:properties` uses).
 *
 * Architecture mirrors `monday:boards` / `facebook:pages`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps`.
 *   - `refreshAndRetry({ provider: "google-analytics", accountId })` — the
 *     accountId here is the integration's providerAccountId (the connected
 *     Google email), NOT a GA account id.
 *
 * Mapping: `value` = bare GA account id (the `accounts/{id}` resource name
 * stripped), `label` = account displayName (id fallback). Sort: alphabetical
 * by label. `q`: client-side case-insensitive substring on the label. Errors
 * sanitized via `classifyGoogleAnalyticsResolverError`.
 */
export const googleAnalyticsAccountsResolver: OptionsResolver = {
  source: "google-analytics:accounts",
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

    const providerAccountId = integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-analytics",
        providerAccountId,
        apiCall: (accessToken) => accountSummariesList({ accessToken }),
      });
    } catch (err) {
      throw classifyGoogleAnalyticsResolverError(err, "accounts");
    }

    const mapped: Array<{ value: string; label: string }> = [];
    for (const summary of result.accountSummaries ?? []) {
      const id =
        typeof summary.account === "string"
          ? summary.account.replace(/^accounts\//, "")
          : null;
      if (!id) continue;
      const label =
        typeof summary.displayName === "string" && summary.displayName.length > 0
          ? summary.displayName
          : id;
      mapped.push({ value: id, label });
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

    return {
      items: filtered,
      hasMore:
        typeof result.nextPageToken === "string" &&
        result.nextPageToken.length > 0,
    };
  },
};
