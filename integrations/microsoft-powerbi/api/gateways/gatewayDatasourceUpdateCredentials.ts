import { powerbiFetch } from "../_base";
import type { GatewayCredentialDetails } from "./gatewayDatasourceCreate";

/**
 * Wrapper for Power BI
 * `PATCH /v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}`
 * (Update Datasource) — replaces the datasource's `credentialDetails`.
 *
 * On-premises path only in this provider: `credentials` MUST already be
 * the RSA-OAEP blob from `../gatewayCredentials.ts` (encryptionAlgorithm
 * "RSA-OAEP"); plaintext never reaches this wrapper and bodies are never
 * logged.
 */

export interface GatewayDatasourceUpdateCredentialsInput {
  accessToken: string;
  gatewayId: string;
  datasourceId: string;
  credentialDetails: GatewayCredentialDetails;
}

export async function gatewayDatasourceUpdateCredentials(
  input: GatewayDatasourceUpdateCredentialsInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources/${encodeURIComponent(
      input.datasourceId,
    )}`,
    body: {
      credentialDetails: {
        credentialType: input.credentialDetails.credentialType,
        credentials: input.credentialDetails.credentials,
        encryptedConnection: input.credentialDetails.encryptedConnection,
        encryptionAlgorithm: input.credentialDetails.encryptionAlgorithm,
        privacyLevel: input.credentialDetails.privacyLevel,
      },
    },
    notFoundResource: `gateway datasource ${input.datasourceId}`,
    operation: "gateway datasource credentials PATCH",
  });
}
