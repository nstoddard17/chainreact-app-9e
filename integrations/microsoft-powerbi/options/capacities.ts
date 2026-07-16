import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { capacitiesList } from "@/integrations/microsoft-powerbi/api/capacities/capacitiesList";

/**
 * `microsoft-powerbi:capacities` options resolver.
 *
 * Backs the `capacityId` field on `assign_workspace_to_capacity`.
 * Value = capacity GUID, label = `<displayName> · <sku>` (displayName
 * alone when the sku is absent). Capacities whose
 * `capacityUserAccessRight` is explicitly `None` are excluded — the user
 * can't assign workspaces to them; rows without the flag are kept
 * (documented field, but never invent an exclusion the provider didn't
 * state).
 *
 * Error sanitization mirrors `microsoft-powerbi:workspaces` — no token /
 * raw provider body ever reaches the browser.
 */
export const microsoftPowerBiCapacitiesResolver: OptionsResolver = {
  source: "microsoft-powerbi:capacities",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    let capacities;
    try {
      capacities = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => capacitiesList({ accessToken }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Power BI and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI capacities. Try again.",
      );
    }

    const items = capacities
      .filter((c) => c.capacityUserAccessRight !== "None")
      .map((c) => ({
        value: c.id,
        label: c.sku ? `${c.displayName} · ${c.sku}` : c.displayName,
      }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
