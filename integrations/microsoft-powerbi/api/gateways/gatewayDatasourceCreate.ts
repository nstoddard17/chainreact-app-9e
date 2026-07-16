import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `POST /v1.0/myorg/gateways/{gatewayId}/datasources`
 * (Create Datasource) — 201 Created.
 *
 * On-premises gateways ONLY (VNet/cloud gateways rejected provider-side).
 * `credentialDetails.credentials` MUST already be the RSA-OAEP blob from
 * `../gatewayCredentials.ts` — this wrapper never sees plaintext
 * credentials and never logs the body.
 *
 * NOTE: the request-body schema table on the Learn page lists
 * `dataSourceName`, but BOTH official sample request bodies (and the SDK's
 * JSON serialization) use `datasourceName` — the samples are the wire
 * truth, so `datasourceName` is sent. `dataSourceType` (capital S) is the
 * request casing; the RESPONSE model uses `datasourceType`.
 */

export interface GatewayCredentialDetails {
  credentialType: string;
  /** RSA-OAEP-encrypted blob from `encryptGatewayCredentials` — never plaintext. */
  credentials: string;
  encryptedConnection: "Encrypted";
  encryptionAlgorithm: "RSA-OAEP";
  privacyLevel: string;
}

export interface GatewayDatasourceCreateInput {
  accessToken: string;
  gatewayId: string;
  dataSourceType: string;
  /** JSON-in-string per the documented wire format, e.g. `{"server":"s","database":"d"}`. */
  connectionDetails: string;
  datasourceName: string;
  credentialDetails: GatewayCredentialDetails;
}

export interface GatewayDatasourceCreateResult {
  datasourceId: string | null;
  gatewayId: string;
}

interface GatewayDatasourceCreateBody {
  id?: string;
  gatewayId?: string;
}

export async function gatewayDatasourceCreate(
  input: GatewayDatasourceCreateInput,
): Promise<GatewayDatasourceCreateResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources`,
    body: {
      dataSourceType: input.dataSourceType,
      connectionDetails: input.connectionDetails,
      datasourceName: input.datasourceName,
      credentialDetails: {
        credentialType: input.credentialDetails.credentialType,
        credentials: input.credentialDetails.credentials,
        encryptedConnection: input.credentialDetails.encryptedConnection,
        encryptionAlgorithm: input.credentialDetails.encryptionAlgorithm,
        privacyLevel: input.credentialDetails.privacyLevel,
      },
    },
    notFoundResource: `gateway ${input.gatewayId}`,
    operation: "gateway datasource create POST",
  });

  let body: GatewayDatasourceCreateBody = {};
  try {
    body = (await res.json()) as GatewayDatasourceCreateBody;
  } catch {
    // 201 with a non-JSON/empty body — ids fall back below.
  }
  return {
    datasourceId: typeof body.id === "string" ? body.id : null,
    gatewayId:
      typeof body.gatewayId === "string" ? body.gatewayId : input.gatewayId,
  };
}
