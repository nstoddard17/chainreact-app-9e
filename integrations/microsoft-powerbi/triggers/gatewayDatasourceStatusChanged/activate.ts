import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { gatewayDatasourceStatusGet } from "../../api/gateways/gatewayDatasourceStatusGet";
import { PowerBiGatewayDatasourceStatusChangedConfigSchema } from "./schema";

/**
 * `gateway_datasource_status_changed` activation hook.
 *
 * Seeds the datasource's current connectivity before the first poll, so an
 * already-offline datasource doesn't fire an "it went offline" event the
 * moment the workflow activates — only later transitions fire.
 *
 * An unreachable datasource is NOT a seed failure: the wrapper returns
 * `{online:false, errorCode}` for that case and reserves throws for real
 * errors (401 / gateway or datasource gone), which fail activation →
 * TRIGGER_REGISTRATION_FAILED.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiGatewayDatasourceStatusChangedConfigSchema.parse({
    gatewayId: config.gatewayId,
    datasourceId: config.datasourceId,
  });

  const status = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceStatusGet({
        accessToken,
        gatewayId: parsed.gatewayId,
        datasourceId: parsed.datasourceId,
      }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      online: status.online,
      errorCode: status.errorCode,
      updatedAt: new Date().toISOString(),
    },
  };
};
