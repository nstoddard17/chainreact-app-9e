import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  encryptGatewayCredentials,
  type GatewayCredentialEntry,
} from "../../api/gatewayCredentials";
import { gatewayGet } from "../../api/gateways/gatewayGet";
import { gatewayDatasourceUpdateCredentials } from "../../api/gateways/gatewayDatasourceUpdateCredentials";
import { UpdateGatewayDatasourceCredentialsConfigSchema } from "./updateGatewayDatasourceCredentials.schema";

/**
 * Power BI `update_gateway_datasource_credentials` action handler.
 *
 * Same encryption flow as `create_gateway_datasource`: fetch the
 * gateway's CURRENT public key → encrypt the new credentials in-app
 * (RSA-OAEP per Microsoft's documented scheme) → PATCH the datasource's
 * `credentialDetails`. Plaintext never leaves the app; the output never
 * echoes credential material.
 */
export const updateGatewayDatasourceCredentials: ActionHandler = async (
  input,
) => {
  const config = UpdateGatewayDatasourceCredentialsConfigSchema.parse(
    input.config,
  );

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

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceUpdateCredentials({
        accessToken,
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
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
      updated: true,
      datasourceId: config.datasourceId,
    },
  };
};
