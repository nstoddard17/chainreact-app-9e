import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { gatewayDatasourcesList } from "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourcesList";

/**
 * `microsoft-powerbi:gateway_datasources` options resolver.
 *
 * Backs the `datasourceId` field on gateway actions. **Dep name
 * `gatewayId` is pinned verbatim** to the runtime Zod schemas (camelCase)
 * — meta fields wire `dependsOn: "gatewayId"`.
 *
 * Value = datasource GUID, label = `<datasourceName> · <datasourceType>`
 * (type omitted when the provider left it null). Cascade fallback: a
 * deleted parent gateway throws `NotFoundError` → empty items (not an
 * error).
 */
export const microsoftPowerBiGatewayDatasourcesResolver: OptionsResolver = {
  source: "microsoft-powerbi:gateway_datasources",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["gatewayId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const gatewayId = ctx.deps.gatewayId;
    if (typeof gatewayId !== "string" || gatewayId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a gateway first.",
      );
    }

    let datasources;
    try {
      datasources = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          gatewayDatasourcesList({ accessToken, gatewayId }),
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
      if (err instanceof NotFoundError) {
        // Parent gateway no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI gateway datasources. Try again.",
      );
    }

    const items = datasources.map((d) => {
      const name = d.datasourceName ?? d.id;
      return {
        value: d.id,
        label: d.datasourceType !== null ? `${name} · ${d.datasourceType}` : name,
      };
    });
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
