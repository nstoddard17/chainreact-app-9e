import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { gatewaysList } from "@/integrations/microsoft-powerbi/api/gateways/gatewaysList";

/**
 * `microsoft-powerbi:gateways` options resolver.
 *
 * Root of the gateway cascade — backs the `gatewayId` field on gateway
 * actions. Value = gateway GUID, label = gateway name, description = the
 * gateway type when present. Only gateways the connected user administers
 * come back from the provider.
 *
 * Error sanitization mirrors `microsoft-powerbi:workspaces` — no token /
 * raw provider body ever reaches the browser.
 */
export const microsoftPowerBiGatewaysResolver: OptionsResolver = {
  source: "microsoft-powerbi:gateways",
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

    let gateways;
    try {
      gateways = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => gatewaysList({ accessToken }),
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
        "Couldn't load Power BI gateways. Try again.",
      );
    }

    const items = gateways.map((g) => ({
      value: g.id,
      label: g.name,
      ...(g.type !== null ? { description: g.type } : {}),
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
