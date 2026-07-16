import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError, surfacePowerBiError } from "./errors";

/**
 * Microsoft Power BI REST API base — provider-local.
 *
 * Power BI does NOT live on Microsoft Graph. Its REST surface is
 * `https://api.powerbi.com/v1.0/myorg/...` with an Azure AD access token
 * whose audience is `https://analysis.windows.net/powerbi/api`. The
 * shared `_shared/microsoft/api/_base.ts` (`graphApiBase()`) is therefore
 * deliberately NOT reused here — see
 * `docs/providers/microsoft-powerbi/v2-pattern-audit.md` §divergence 1.
 *
 * `POWERBI_API_BASE` is an e2e/test-only override mirroring
 * `MICROSOFT_GRAPH_API_BASE` / `GOOGLE_SHEETS_API_BASE`.
 */
export function powerbiApiBase(): string {
  return process.env.POWERBI_API_BASE ?? "https://api.powerbi.com";
}

/** `${base}/v1.0/myorg` — every wrapper path is appended to this. */
export function powerbiApiRoot(): string {
  return `${powerbiApiBase()}/v1.0/myorg`;
}

export interface PowerBiFetchInput {
  accessToken: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path under `/v1.0/myorg`, starting with `/`. Caller encodes segments. */
  path: string;
  /** Optional query params (values URL-encoded here). */
  query?: Readonly<Record<string, string>>;
  /** JSON body; serialized + content-typed when present. */
  body?: unknown;
  /**
   * When set, HTTP 404 throws `NotFoundError(notFoundResource)` instead of
   * a generic error — used by resource getters so handlers/options can map
   * "gone parent" to friendly UX. When unset, 404 falls through to the
   * generic error arm.
   */
  notFoundResource?: string;
  /** Short operation label for error messages, e.g. "datasets refresh POST". */
  operation: string;
}

/**
 * Shared request runner for Power BI wrappers. One provider endpoint per
 * exported wrapper function still holds (typed-and-narrow rule) — this
 * helper only centralizes the fetch + status-mapping boilerplate that
 * would otherwise be copy-pasted across ~45 wrappers:
 *
 *   - 401 → `Unauthorized401Error` (the `refreshAndRetry` contract).
 *   - 404 → `NotFoundError` when `notFoundResource` is set.
 *   - other non-2xx → generic `Error` with the sanitized Power BI error
 *     surface (never the raw body; never the token).
 *
 * Returns the raw `Response` (2xx) so callers own JSON/binary/202-header
 * parsing. Callers MUST map bodies onto fixed key sets — never spread.
 */
export async function powerbiFetch(
  input: PowerBiFetchInput,
): Promise<Response> {
  let url = `${powerbiApiRoot()}${input.path}`;
  if (input.query && Object.keys(input.query).length > 0) {
    const params = new URLSearchParams(input.query);
    url += `?${params.toString()}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  let body: string | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  const res = await fetch(url, { method: input.method, headers, body });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Power BI ${input.operation} returned HTTP 401`,
    );
  }
  if (res.status === 404 && input.notFoundResource) {
    const text = await res.text();
    throw new NotFoundError(
      input.notFoundResource,
      surfacePowerBiError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Power BI ${input.operation} failed: ${surfacePowerBiError(text, res.status)}`,
    );
  }
  return res;
}
