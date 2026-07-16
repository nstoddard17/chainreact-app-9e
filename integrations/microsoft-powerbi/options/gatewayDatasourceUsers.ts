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
import { gatewayDatasourceUsersList } from "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUsersList";

/**
 * `microsoft-powerbi:gateway_datasource_users` options resolver.
 *
 * Backs the `principalEmail` field on `remove_gateway_datasource_user`.
 * **Dep names `gatewayId` + `datasourceId` are pinned verbatim** to the
 * runtime Zod schemas — meta wires `dependsOn: ["gatewayId",
 * "datasourceId"]`.
 *
 * Value = the principal's `emailAddress` (falling back to `identifier`
 * for service principals — the DELETE path accepts either handle). Label
 * = `<displayName ?? email> · <accessRight>`. Rows with neither handle
 * are skipped. Cascade fallback: deleted parent → empty items.
 */
export const microsoftPowerBiGatewayDatasourceUsersResolver: OptionsResolver =
  {
    source: "microsoft-powerbi:gateway_datasource_users",
    provider: "microsoft-powerbi",
    requiresIntegration: true,
    requiredDeps: ["gatewayId", "datasourceId"],
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
      const datasourceId = ctx.deps.datasourceId;
      if (typeof datasourceId !== "string" || datasourceId.length === 0) {
        throw new OptionsResolverError(
          "MISSING_DEPENDENCY",
          "Select a datasource first.",
        );
      }

      let users;
      try {
        users = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "microsoft-powerbi",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            gatewayDatasourceUsersList({
              accessToken,
              gatewayId,
              datasourceId,
            }),
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
          // Parent gateway/datasource no longer exists — empty picker.
          return { items: [], hasMore: false };
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Power BI gateway datasource users. Try again.",
        );
      }

      const items = [];
      for (const user of users) {
        const value = user.emailAddress ?? user.identifier;
        if (value === null) continue;
        const name = user.displayName ?? value;
        items.push({
          value,
          label:
            user.datasourceAccessRight !== null
              ? `${name} · ${user.datasourceAccessRight}`
              : name,
        });
      }
      const lowerQ = ctx.q.toLowerCase();
      const filtered =
        lowerQ.length > 0
          ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
          : items;

      return { items: filtered, hasMore: false };
    },
  };
