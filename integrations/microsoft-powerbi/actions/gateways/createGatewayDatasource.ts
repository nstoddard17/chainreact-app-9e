import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  encryptGatewayCredentials,
  type GatewayCredentialEntry,
} from "../../api/gatewayCredentials";
import { gatewayGet } from "../../api/gateways/gatewayGet";
import { gatewayDatasourceCreate } from "../../api/gateways/gatewayDatasourceCreate";
import { CreateGatewayDatasourceConfigSchema } from "./createGatewayDatasource.schema";

/**
 * Power BI `create_gateway_datasource` action handler.
 *
 * Flow: fetch the gateway's CURRENT RSA public key (`gatewayGet`) →
 * build the credentialData for the chosen credential type → encrypt
 * in-app against that key (`encryptGatewayCredentials`) → POST the
 * datasource with `encryptedConnection: "Encrypted"` +
 * `encryptionAlgorithm: "RSA-OAEP"` (the documented on-premises
 * requirement — plaintext credentials to an on-prem gateway are not
 * possible).
 *
 * SECURITY: the output NEVER echoes credential material — fixed key set
 * { datasourceId, gatewayId, datasourceName } only.
 */
export const createGatewayDatasource: ActionHandler = async (input) => {
  const config = CreateGatewayDatasourceConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const gateway = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayGet({ accessToken, gatewayId: config.gatewayId }),
  });

  // Documented pre-encryption shapes: Basic/Windows → username+password;
  // Key → key. The schema refinements guarantee presence.
  const credentialData: GatewayCredentialEntry[] =
    config.credentialType === "Key"
      ? [{ name: "key", value: config.key! }]
      : [
          { name: "username", value: config.username! },
          { name: "password", value: config.password! },
        ];

  // Encryption happens HERE, before anything leaves the app.
  const credentials = encryptGatewayCredentials({
    publicKeyExponent: gateway.publicKeyExponent,
    publicKeyModulus: gateway.publicKeyModulus,
    credentialData,
  });

  // Synthesize the documented JSON-in-string wire format from the
  // V2-shaped connection fields (only provided keys are included).
  const connectionDetails = JSON.stringify({
    ...(config.server !== undefined ? { server: config.server } : {}),
    ...(config.database !== undefined ? { database: config.database } : {}),
    ...(config.url !== undefined ? { url: config.url } : {}),
  });

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceCreate({
        accessToken,
        gatewayId: config.gatewayId,
        dataSourceType: config.datasourceType,
        connectionDetails,
        datasourceName: config.datasourceName,
        credentialDetails: {
          credentialType: config.credentialType,
          credentials,
          encryptedConnection: "Encrypted",
          encryptionAlgorithm: "RSA-OAEP",
          privacyLevel: config.privacyLevel,
        },
      }),
  });

  return {
    output: {
      datasourceId: result.datasourceId,
      gatewayId: result.gatewayId,
      datasourceName: config.datasourceName,
    },
  };
};
