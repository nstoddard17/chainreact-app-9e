import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/gateways` (Get Gateways).
 *
 * Lists the on-premises data gateways the connected user administers.
 * VNet/cloud gateways are not returned by this v1 API (documented
 * limitation). No server-side paging params are documented — the full
 * (gateway-admin-bounded, small) set comes back in one response.
 * Fixed-key mapping only; the `publicKey` is deliberately NOT surfaced
 * here — `gatewayGet` fetches it right before encryption.
 */

export interface GatewaysListInput {
  accessToken: string;
}

export interface PowerBiGateway {
  id: string;
  name: string;
  type: string | null;
}

interface GatewaysListBody {
  value?: Array<{
    id?: string;
    name?: string;
    type?: string;
  }>;
}

export async function gatewaysList(
  input: GatewaysListInput,
): Promise<PowerBiGateway[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: "/gateways",
    operation: "gateways GET",
  });

  const body = (await res.json()) as GatewaysListBody;
  const rows = body.value ?? [];
  const gateways: PowerBiGateway[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    gateways.push({
      id: row.id,
      name: row.name,
      type: typeof row.type === "string" ? row.type : null,
    });
  }
  return gateways;
}
