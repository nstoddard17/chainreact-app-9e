import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/gateways/{gatewayId}` (Get Gateway).
 *
 * Fetches one gateway INCLUDING its RSA `publicKey {exponent, modulus}` —
 * the key gateway-credential writes encrypt against (see
 * `../gatewayCredentials.ts`). Handlers call this immediately before a
 * create/update-credentials POST/PATCH so the key is always current
 * ("different gateway versions might have different public key sizes").
 *
 * Throws a sanitized `Error` when the response carries no public key —
 * without it credentials cannot be encrypted, and sending plaintext is
 * never an option.
 */

export interface GatewayGetInput {
  accessToken: string;
  gatewayId: string;
}

export interface PowerBiGatewayDetail {
  id: string;
  name: string | null;
  type: string | null;
  publicKeyExponent: string;
  publicKeyModulus: string;
}

interface GatewayGetBody {
  id?: string;
  name?: string;
  type?: string;
  publicKey?: {
    exponent?: string;
    modulus?: string;
  };
}

export async function gatewayGet(
  input: GatewayGetInput,
): Promise<PowerBiGatewayDetail> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}`,
    notFoundResource: `gateway ${input.gatewayId}`,
    operation: "gateway GET",
  });

  const body = (await res.json()) as GatewayGetBody;
  const exponent = body.publicKey?.exponent;
  const modulus = body.publicKey?.modulus;
  if (
    typeof exponent !== "string" ||
    exponent.length === 0 ||
    typeof modulus !== "string" ||
    modulus.length === 0
  ) {
    throw new Error(
      "Power BI gateway GET returned no public key — cannot encrypt credentials for this gateway.",
    );
  }

  return {
    id: typeof body.id === "string" ? body.id : input.gatewayId,
    name: typeof body.name === "string" ? body.name : null,
    type: typeof body.type === "string" ? body.type : null,
    publicKeyExponent: exponent,
    publicKeyModulus: modulus,
  };
}
