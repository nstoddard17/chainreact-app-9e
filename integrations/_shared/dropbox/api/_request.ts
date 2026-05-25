import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  DropboxApiError,
  DropboxConflictError,
  NotFoundError,
  RateLimitError,
  isNotFoundSummary,
  surfaceDropboxError,
} from "../errors";

/**
 * Shared Dropbox request layer — Slice 3.DROPBOX-2.
 *
 * Dropbox has TWO API hosts and three call shapes; this module is the
 * single transport seam so OAuth + error surface live in one place
 * (mirrors `_shared/monday/api/_request.ts`).
 *
 *   1. **RPC** (`api.dropboxapi.com`): POST, `Authorization: Bearer`,
 *      `Content-Type: application/json`, args as the JSON body, JSON
 *      response. (get_metadata, list_folder, search_v2, *_v2 file ops,
 *      sharing, users/get_current_account). No-arg endpoints send `null`.
 *   2. **Content download** (`content.dropboxapi.com`): POST,
 *      `Authorization: Bearer`, `Dropbox-API-Arg: <JSON>` header, NO
 *      request Content-Type. Response = raw bytes; metadata JSON in the
 *      `Dropbox-API-Result` response header.
 *   3. **Content upload** (`content.dropboxapi.com`): POST,
 *      `Authorization: Bearer`, `Dropbox-API-Arg: <JSON>` header,
 *      `Content-Type: application/octet-stream`, body = raw bytes, JSON
 *      response.
 *
 * Endpoint hosts:
 *   - RPC default `https://api.dropboxapi.com`, override `DROPBOX_API_BASE`.
 *   - Content default `https://content.dropboxapi.com`, override
 *     `DROPBOX_CONTENT_BASE`. (Overrides are e2e-only; production never
 *     sets them.) Callers pass the path under `/2/...`.
 *
 * Error model (all three shapes share `throwForStatus`):
 *   - 401 → `Unauthorized401Error` (drives `refreshAndRetry`).
 *   - 429 → `RateLimitError` (+ parsed `Retry-After`).
 *   - 409 with a not-found `error_summary` → `NotFoundError`.
 *   - 409 otherwise → `DropboxConflictError` (carries the leading tag —
 *     create_shared_link branches on `shared_link_already_exists`).
 *   - other 4xx/5xx → `DropboxApiError`.
 *
 * Security: never includes the access token, request args, requested
 * path, raw response body, file bytes, or shared/temporary links in a
 * thrown message — only Dropbox's sanitized `error_summary` tag (via
 * `surfaceDropboxError`).
 */

export function dropboxApiBase(): string {
  return process.env.DROPBOX_API_BASE ?? "https://api.dropboxapi.com";
}

export function dropboxContentBase(): string {
  return process.env.DROPBOX_CONTENT_BASE ?? "https://content.dropboxapi.com";
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Map a non-OK Dropbox response to the right typed error. Reads the body
 * text once (callers must NOT have consumed it). Never throws the raw
 * body — only the sanitized `error_summary` tag.
 */
async function throwForStatus(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new Unauthorized401Error("Dropbox request returned HTTP 401");
  }
  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    throw new RateLimitError("HTTP 429", retryAfter);
  }
  const text = await response.text();
  const summary = surfaceDropboxError(text, response.status);
  if (response.status === 409) {
    if (isNotFoundSummary(summary)) {
      throw new NotFoundError("dropbox resource", summary);
    }
    throw new DropboxConflictError(summary);
  }
  throw new DropboxApiError(summary, response.status);
}

// ─── 1. RPC ──────────────────────────────────────────────────────────────────

export interface DropboxRpcInput<A> {
  accessToken: string;
  /** Endpoint path under the API host, e.g. "/2/files/get_metadata". */
  endpoint: string;
  /** JSON args. `undefined`/`null` sends a literal `null` body. */
  args?: A;
}

export async function dropboxRpc<T, A = Record<string, unknown>>(
  input: DropboxRpcInput<A>,
): Promise<T> {
  const response = await fetch(`${dropboxApiBase()}${input.endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.args ?? null),
  });
  if (!response.ok) {
    return throwForStatus(response);
  }
  // Some RPC endpoints (rare) return 200 with an empty body; tolerate it.
  const text = await response.text();
  if (text.length === 0) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ─── 2. Content download ─────────────────────────────────────────────────────

export interface DropboxContentDownloadInput<A> {
  accessToken: string;
  /** Endpoint path under the content host, e.g. "/2/files/download". */
  endpoint: string;
  /** Args serialized into the `Dropbox-API-Arg` header. */
  args: A;
}

export interface DropboxContentDownloadResult<R> {
  bytes: Uint8Array;
  /** Parsed `Dropbox-API-Result` response header (file metadata). */
  result: R;
}

export async function dropboxContentDownload<R, A = Record<string, unknown>>(
  input: DropboxContentDownloadInput<A>,
): Promise<DropboxContentDownloadResult<R>> {
  const response = await fetch(`${dropboxContentBase()}${input.endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      // Content-download endpoints take args in this header, NOT the body,
      // and MUST NOT send a request Content-Type.
      "Dropbox-API-Arg": JSON.stringify(input.args),
    },
  });
  if (!response.ok) {
    return throwForStatus(response);
  }
  const headerJson = response.headers.get("dropbox-api-result");
  const result = (headerJson ? JSON.parse(headerJson) : {}) as R;
  const buf = await response.arrayBuffer();
  return { bytes: new Uint8Array(buf), result };
}

// ─── 3. Content upload ───────────────────────────────────────────────────────

export interface DropboxContentUploadInput<A> {
  accessToken: string;
  /** Endpoint path under the content host, e.g. "/2/files/upload". */
  endpoint: string;
  /** Args serialized into the `Dropbox-API-Arg` header. */
  args: A;
  bytes: Uint8Array;
}

export async function dropboxContentUpload<T, A = Record<string, unknown>>(
  input: DropboxContentUploadInput<A>,
): Promise<T> {
  const response = await fetch(`${dropboxContentBase()}${input.endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Dropbox-API-Arg": JSON.stringify(input.args),
      "Content-Type": "application/octet-stream",
    },
    // Runtime: undici fetch accepts a Uint8Array body. The DOM `BodyInit`
    // lib type doesn't include the generic Uint8Array, so cast via the
    // global `Blob` (a valid BodyInit) — compile-time only; the runtime
    // value stays the Uint8Array.
    body: input.bytes as unknown as Blob,
  });
  if (!response.ok) {
    return throwForStatus(response);
  }
  const text = await response.text();
  if (text.length === 0) return undefined as unknown as T;
  return JSON.parse(text) as T;
}
