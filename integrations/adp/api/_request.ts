import { mtlsRequest, type MtlsRequestInput, type MtlsResponse } from "@/services/http/mtls";
import { loadSecrets } from "@/services/machineCredentials/store";
import {
  withMachineToken,
  MachineCredentialNotConnectedError,
} from "@/services/machineCredentials/tokenService";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { adpMachineAuth } from "../auth";

/**
 * ADP API client — the ONE outbound seam for ADP calls.
 *
 * Composes the machine-credential infrastructure:
 *   1. load the account's encrypted ADP credential (client_id/secret + cert/key);
 *   2. `withMachineToken` mints/caches a Bearer access token (client_credentials);
 *   3. `mtlsRequest` performs the call presenting the WS client certificate at the
 *      TLS layer (mutual TLS) AND the Bearer token — ADP requires BOTH.
 *   4. On HTTP 401 the api call throws `Unauthorized401Error`, so `withMachineToken`
 *      force-mints a fresh token once and retries (analogue of refreshAndRetry).
 *
 * Bounded + redacted: callers receive a parsed JSON value + status; the raw
 * provider host, cert, key, token, and error body never leak. Non-2xx (except the
 * 401 re-mint path) throws a typed `AdpApiError` carrying only the status + a
 * bounded ADP error code.
 *
 * The mTLS client is injectable so action tests exercise the real handler path
 * with a mocked ADP network boundary.
 */

export type AdpApiErrorCode = "http_error" | "invalid_response";

export class AdpApiError extends Error {
  readonly code: AdpApiErrorCode;
  readonly status?: number;
  /** Bounded ADP error code (e.g. a processMessage code), if present. Non-secret. */
  readonly providerErrorCode?: string;
  constructor(code: AdpApiErrorCode, status?: number, providerErrorCode?: string) {
    super(
      `ADP API error (${code}${status ? ` ${status}` : ""}${
        providerErrorCode ? `: ${providerErrorCode}` : ""
      }).`,
    );
    this.name = "AdpApiError";
    this.code = code;
    if (status !== undefined) this.status = status;
    if (providerErrorCode !== undefined) this.providerErrorCode = providerErrorCode;
  }
}

export interface AdpRequestInput {
  accountId: string;
  method: string;
  /** Path beginning with '/', e.g. '/hr/v2/workers'. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body; stringified. Omit for GET. */
  body?: unknown;
  now?: Date;
}

export interface AdpApiResponse {
  status: number;
  headers: Record<string, string>;
  json: unknown;
}

export interface AdpClientDeps {
  mtls?: { request: (input: MtlsRequestInput) => Promise<MtlsResponse> };
}

function buildUrl(
  base: string,
  path: string,
  query?: AdpRequestInput["query"],
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Extract a bounded, non-secret error code from an ADP error body. */
function extractAdpErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as {
      confirmMessage?: { processMessages?: Array<{ processMessage?: { messageTxt?: unknown; codeValue?: unknown } }> };
    };
    const first = parsed.confirmMessage?.processMessages?.[0]?.processMessage;
    const code = first?.codeValue;
    if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(code)) return code;
  } catch {
    // non-JSON / unexpected shape — nothing safe to extract
  }
  return undefined;
}

function safeJson(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new AdpApiError("invalid_response");
  }
}

/**
 * Perform an authenticated, mutually-authenticated ADP API request. Throws:
 *   - `MachineCredentialNotConnectedError` when no ADP credential is connected;
 *   - the redacted `MtlsError` family on TLS/cert/transport failures;
 *   - `AdpApiError` on non-2xx responses (after the single 401 re-mint attempt).
 */
export async function adpRequest(
  input: AdpRequestInput,
  deps?: AdpClientDeps,
): Promise<AdpApiResponse> {
  const loaded = await loadSecrets(input.accountId, "adp");
  if (!loaded) throw new MachineCredentialNotConnectedError("adp");

  const env =
    (typeof loaded.record.metadata.environment === "string"
      ? loaded.record.metadata.environment
      : undefined) ?? adpMachineAuth.environments[0]!.value;
  const url = buildUrl(adpMachineAuth.apiBaseUrl(env), input.path, input.query);
  const tokenConfig = adpMachineAuth.buildTokenConfig(env);
  const credential = { certPem: loaded.secrets.certPem, keyPem: loaded.secrets.keyPem };
  const mtls = deps?.mtls ?? { request: mtlsRequest };

  return withMachineToken(
    {
      accountId: input.accountId,
      provider: "adp",
      tokenConfig,
      ...(input.now !== undefined ? { now: input.now } : {}),
    },
    async (accessToken) => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      };
      if (input.body !== undefined) headers["content-type"] = "application/json";

      const res = await mtls.request({
        method: input.method,
        url,
        headers,
        ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
        credential,
        retries: 2,
        ...(input.now !== undefined ? { now: input.now } : {}),
      });

      // 401 → let withMachineToken force-mint a fresh token and retry once.
      if (res.status === 401) throw new Unauthorized401Error();
      if (res.status < 200 || res.status >= 300) {
        throw new AdpApiError("http_error", res.status, extractAdpErrorCode(res.body));
      }
      return { status: res.status, headers: res.headers, json: safeJson(res.body) };
    },
    deps?.mtls ? { mtls: deps.mtls } : undefined,
  );
}
