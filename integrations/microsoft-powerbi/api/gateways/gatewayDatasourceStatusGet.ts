import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { powerbiApiRoot } from "../_base";
import { NotFoundError, type PowerBiErrorPayload } from "../errors";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}/status`
 * (Get Datasource Status).
 *
 * Hand-rolled fetch (not `powerbiFetch`) because a connectivity FAILURE is
 * the RESULT of this call, not an error: Power BI answers HTTP 400 with an
 * error envelope (e.g. `DM_GWPipeline_Client_GatewayUnreachable`) when the
 * gateway cannot reach the data source. Mapping:
 *
 *   - 2xx  → `{ online: true, errorCode: null }`
 *   - 401  → `Unauthorized401Error` (refreshAndRetry contract)
 *   - 404  → `NotFoundError` (gateway/datasource gone — a real error)
 *   - else → `{ online: false, errorCode: <sanitized short code> }`
 *
 * `errorCode` is the envelope's short code only (identifier-shaped,
 * length-capped) — never the raw body, never a message string.
 */

export interface GatewayDatasourceStatusGetInput {
  accessToken: string;
  gatewayId: string;
  datasourceId: string;
}

export interface GatewayDatasourceStatusResult {
  online: boolean;
  errorCode: string | null;
}

/** Identifier-shaped short codes only (e.g. "DM_GWPipeline_UnknownError"). */
const SAFE_ERROR_CODE = /^[A-Za-z0-9_.-]{1,128}$/;

function extractErrorCode(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as PowerBiErrorPayload;
    const code = parsed?.error?.code ?? parsed?.error?.["pbi.error"]?.code;
    if (typeof code === "string" && SAFE_ERROR_CODE.test(code)) return code;
  } catch {
    // not JSON
  }
  return `HTTP_${status}`;
}

export async function gatewayDatasourceStatusGet(
  input: GatewayDatasourceStatusGetInput,
): Promise<GatewayDatasourceStatusResult> {
  const url = `${powerbiApiRoot()}/gateways/${encodeURIComponent(
    input.gatewayId,
  )}/datasources/${encodeURIComponent(input.datasourceId)}/status`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Power BI gateway datasource status GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `gateway datasource ${input.datasourceId}`,
      extractErrorCode(text, 404),
    );
  }
  if (res.ok) {
    return { online: true, errorCode: null };
  }

  const text = await res.text();
  return { online: false, errorCode: extractErrorCode(text, res.status) };
}
