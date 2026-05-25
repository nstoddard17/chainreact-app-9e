import { createHmac } from "node:crypto";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { GRAPH_API_VERSION } from "../version";
import {
  FACEBOOK_AUTH_CODES,
  FACEBOOK_PERMISSION_CODES,
  FACEBOOK_RATE_CODES,
  FacebookApiError,
  FacebookPermissionError,
  RateLimitError,
  parseFacebookErrorCode,
  surfaceFacebookError,
} from "../errors";

/**
 * Shared Facebook Graph API request layer — Slice 3.FACEBOOK-2.
 *
 * Single transport seam (mirrors `_shared/dropbox/api/_request.ts`):
 *   1. **JSON** (`graphRequest`): GET / POST / DELETE against
 *      `graph.facebook.com/{version}{path}`, `Authorization: Bearer`,
 *      JSON body for writes, JSON response.
 *   2. **Multipart** (`graphMultipart`): POST media to a content endpoint
 *      (`/{pageId}/photos|videos`) with `multipart/form-data` (the SDK sets
 *      the boundary — never set Content-Type manually).
 *
 * **`appsecret_proof`:** every call appends `appsecret_proof` — an
 * HMAC-SHA256 of the access token keyed with the app secret (Graph's
 * "Require App Secret Proof for Server API calls" protection). Computed
 * only when `FACEBOOK_CLIENT_SECRET` is set; harmless when the app setting
 * is off, required when it's on.
 *
 * **Graph version** is pinned here (`GRAPH_API_VERSION`) and consumed by
 * the manifest's `apiVersion` so there is ONE source of truth (closes V1's
 * v14/v19 drift). Verified against Meta's changelog 2026-02 — v23.0 (May
 * 2025) is a current, mature version far from deprecation; bump it (or set
 * `FACEBOOK_GRAPH_VERSION`) as Meta's ~2-year version window advances.
 *
 * **Base host** default `https://graph.facebook.com`, override
 * `FACEBOOK_GRAPH_BASE` (e2e-only; production never sets it).
 *
 * Error model (shared `throwForStatus`):
 *   - HTTP 401 OR Graph code 190 → `Unauthorized401Error` (drives
 *     `refreshAndRetry`; Facebook is non-refreshable so this surfaces as
 *     reconnect-required).
 *   - permission codes (10 / 200 / 3 / 299) → `FacebookPermissionError`
 *     (App-Review / role hint).
 *   - rate codes (4 / 17 / 32 / 613 / 80001+) → `RateLimitError`.
 *   - other 4xx/5xx → `FacebookApiError`.
 *
 * Security: never includes the access token, app secret, `appsecret_proof`,
 * request args, raw response body, media bytes, media URLs, or message
 * text in a thrown message — only Graph's sanitized `type/code` tag.
 */

// Re-exported from the dependency-free `version.ts` so existing
// `import { GRAPH_API_VERSION } from ".../_request"` call sites keep working
// while the manifest imports it from `version.ts` without a module cycle.
export { GRAPH_API_VERSION };

export function facebookGraphBase(): string {
  return process.env.FACEBOOK_GRAPH_BASE ?? "https://graph.facebook.com";
}

/**
 * HMAC-SHA256 of the access token keyed with the app secret, hex. Returns
 * null when `FACEBOOK_CLIENT_SECRET` is unset (the proof is then omitted —
 * Graph accepts the call unless the app requires the proof).
 */
export function appSecretProof(accessToken: string): string | null {
  const secret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}

function buildUrl(
  path: string,
  accessToken: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(`${facebookGraphBase()}/${GRAPH_API_VERSION}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const proof = appSecretProof(accessToken);
  if (proof) url.searchParams.set("appsecret_proof", proof);
  return url.toString();
}

async function throwForStatus(response: Response): Promise<never> {
  const text = await response.text();
  const code = parseFacebookErrorCode(text);
  if (response.status === 401 || (code !== null && FACEBOOK_AUTH_CODES.has(code))) {
    throw new Unauthorized401Error("Facebook request returned HTTP 401");
  }
  const tag = surfaceFacebookError(text, response.status);
  if (code !== null && FACEBOOK_PERMISSION_CODES.has(code)) {
    throw new FacebookPermissionError(tag);
  }
  if (code !== null && FACEBOOK_RATE_CODES.has(code)) {
    throw new RateLimitError(tag);
  }
  // 403 with no recognized code still reads as a permission problem.
  if (response.status === 403) {
    throw new FacebookPermissionError(tag);
  }
  throw new FacebookApiError(tag, response.status);
}

// ─── JSON ────────────────────────────────────────────────────────────────────

export interface GraphRequestInput {
  accessToken: string;
  /** Path under the version segment, e.g. "/me/accounts" or `/${pageId}/feed`. */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  /** Query-string params (appsecret_proof is added automatically). */
  query?: Record<string, string | number | undefined>;
  /** JSON body for POST writes. */
  body?: Record<string, unknown>;
}

export async function graphRequest<T>(input: GraphRequestInput): Promise<T> {
  const method = input.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  let body: string | undefined;
  if (input.body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.body);
  }
  const response = await fetch(
    buildUrl(input.path, input.accessToken, input.query),
    { method, headers, ...(body !== undefined && { body }) },
  );
  if (!response.ok) return throwForStatus(response);
  const text = await response.text();
  if (text.length === 0) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ─── Multipart (media) ───────────────────────────────────────────────────────

export interface GraphMultipartInput {
  accessToken: string;
  /** Path under the version segment, e.g. `/${pageId}/photos`. */
  path: string;
  /** Non-file form fields (string-valued). */
  fields?: Record<string, string | undefined>;
  file: {
    fieldName: string;
    bytes: Uint8Array;
    filename: string;
    contentType: string;
  };
}

export async function graphMultipart<T>(input: GraphMultipartInput): Promise<T> {
  const form = new FormData();
  if (input.fields) {
    for (const [k, v] of Object.entries(input.fields)) {
      if (v !== undefined) form.append(k, v);
    }
  }
  // The DOM Blob-part lib type doesn't include the generic Uint8Array
  // (`ArrayBufferLike` vs `ArrayBuffer`); cast to ArrayBuffer (a valid
  // Blob part) — compile-time only, runtime accepts the Uint8Array.
  const blob = new Blob([input.file.bytes as unknown as ArrayBuffer], {
    type: input.file.contentType,
  });
  form.append(input.file.fieldName, blob, input.file.filename);

  const response = await fetch(
    buildUrl(input.path, input.accessToken),
    {
      method: "POST",
      // No Content-Type — FormData sets the multipart boundary.
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: form,
    },
  );
  if (!response.ok) return throwForStatus(response);
  const text = await response.text();
  if (text.length === 0) return undefined as unknown as T;
  return JSON.parse(text) as T;
}
