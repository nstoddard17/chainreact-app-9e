import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  HttpRequestConfigSchema,
  type HttpRequestAuthConfig,
  type HttpRequestConfig,
} from "./httpRequest.schema";
import { validateEgressDestination } from "./httpRequestEgress";

/**
 * Native `http_request` action — Native-nodes Slice 1 Commit 1.
 *
 * Pure-handler port from V1's
 * `lib/workflows/actions/logic/executeHttpRequest.ts` per the accepted
 * audit (docs/slices/parity/parity-native-nodes.md §7 Tier A) +
 * implementation plan
 * (docs/slices/parity/native-nodes-1-tier-a-plan.md §4).
 *
 * Behavioural contracts locked at plan time:
 *   - Strict schema with required `method` + `url` (Q11: no hidden
 *     defaults — no silent GET, no silent Content-Type injection).
 *   - URL scheme allowlist: `http:` and `https:` only. Everything else
 *     (file:, data:, javascript:, ftp:, …) rejected with
 *     `UnsupportedUrlSchemeError`.
 *   - Egress hardening (Slice 3.SEC-3): after URL parsing the
 *     destination is validated through `validateEgressDestination` —
 *     IP literals are classified against the blocked-range table
 *     (RFC 1918 private, loopback, link-local incl. 169.254.169.254
 *     metadata, multicast, IPv6 ULA / link-local / IPv4-mapped), and
 *     domain hostnames are DNS-resolved with every returned address
 *     re-checked. DNS failure fails closed. See
 *     `httpRequestEgress.ts` for the full policy.
 *   - Redirects (Slice 3.SEC-3): `redirect: "manual"` on the fetch.
 *     A 3xx response is returned to the workflow author with status
 *     and Location header preserved — the handler does NOT
 *     auto-follow, which closes the "public domain → 169.254.169.254"
 *     redirect bypass. Workflow authors who want to chase a redirect
 *     issue another http_request node, at which point egress checks
 *     fire again.
 *   - Auth header is layered LAST. User-supplied `Authorization` in
 *     `headers[]` is dropped before the auth scheme builds the
 *     canonical Authorization header — caller `headers[]` cannot smuggle
 *     a competing scheme through.
 *   - GET / HEAD-shaped requests never forward a body (Web Fetch rejects
 *     it; V1 also skipped). Body is silently dropped only for GET; other
 *     methods forward `body` verbatim.
 *   - Timeout via `AbortController`. Default 15s, max 30s (schema). A
 *     fired abort throws `HttpRequestTimeoutError`; the engine converts
 *     to HANDLER_FAILED.
 *   - Non-2xx HTTP responses do NOT throw. The handler returns the
 *     response normally with `ok: false` and the status code — workflow
 *     authors branch downstream on `output.status` / `output.ok`.
 *   - Response body capture is bounded at 256 KiB via a streamed reader.
 *     Overflow signals `bodyTruncated: true`; the underlying stream is
 *     cancelled to free the socket. `bodyJson` parses ONLY untruncated
 *     JSON-typed bodies — truncation guarantees `bodyJson = null`.
 *   - Output headers are projected (lowercased keys, sensitive headers
 *     dropped, oversized values dropped). No raw spread of `Headers`.
 *   - Handler emits NO log lines. Engine-layer logging captures the
 *     run lifecycle. Keeping the handler silent guarantees that bearer
 *     tokens / basic-auth passwords / API keys / full URLs (which may
 *     carry secrets in query strings) never reach a log.
 */

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_HEADER_VALUE_BYTES = 2048;

/**
 * Response headers that may carry credentials or session state. Dropped
 * from the output projection so downstream nodes / logs never see them.
 * Compared case-insensitively (lowercase keys only).
 */
const SENSITIVE_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  "set-cookie",
  "authorization",
  "proxy-authenticate",
  "proxy-authorization",
  "www-authenticate",
]);

export class InvalidHttpRequestUrlError extends Error {
  constructor(reason: string) {
    super(`Invalid http_request URL: ${reason}`);
    this.name = "InvalidHttpRequestUrlError";
  }
}

export class UnsupportedUrlSchemeError extends Error {
  constructor(scheme: string) {
    super(
      `Unsupported http_request URL scheme '${scheme}': only http and https are allowed.`,
    );
    this.name = "UnsupportedUrlSchemeError";
  }
}

export class HttpRequestTimeoutError extends Error {
  constructor(timeoutSeconds: number) {
    super(`HTTP request timed out after ${timeoutSeconds}s.`);
    this.name = "HttpRequestTimeoutError";
  }
}

export const httpRequest: ActionHandler = async (input) => {
  const config = HttpRequestConfigSchema.parse(input.config);

  const baseUrl = parseUrlSafely(config.url);
  const fullUrl = applyQueryParams(baseUrl, config.queryParams);

  // Slice 3.SEC-3 — block private / metadata / loopback / link-local /
  // multicast / reserved destinations BEFORE we issue the fetch.
  // Re-thrown as-is so the engine surfaces the structured
  // `HTTP_REQUEST_BLOCKED_DESTINATION` code without re-wrapping.
  await validateEgressDestination(fullUrl);

  const headers = buildRequestHeaders(config.headers, config.auth);

  const bodyForFetch = methodAllowsBody(config.method)
    ? config.body
    : undefined;

  const startedAtMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutSeconds * 1000,
  );

  let response: Response;
  try {
    response = await fetch(fullUrl.toString(), {
      method: config.method,
      headers,
      body: bodyForFetch,
      signal: controller.signal,
      // Slice 3.SEC-3: do not auto-follow 3xx. A redirect to
      // 169.254.169.254 (or any other blocked host) cannot bypass the
      // pre-flight egress check this way. The 3xx response surfaces to
      // the workflow author with `status` + `Location` header; a
      // follow-on request goes through this handler again and
      // re-validates.
      redirect: "manual",
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new HttpRequestTimeoutError(config.timeoutSeconds);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const captured = await captureBoundedBody(response);
  const projectedHeaders = sanitizeResponseHeaders(response.headers);
  const bodyJson = parseJsonBodyIfApplicable(
    response.headers.get("content-type"),
    captured.body,
    captured.truncated,
  );
  const durationMs = Date.now() - startedAtMs;

  return {
    output: {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      urlHost: fullUrl.host,
      headers: projectedHeaders,
      body: captured.body,
      bodyJson,
      bodyTruncated: captured.truncated,
      bytesCaptured: captured.bytesCaptured,
      durationMs,
    },
  };
};

function parseUrlSafely(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidHttpRequestUrlError("URL could not be parsed.");
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    throw new UnsupportedUrlSchemeError(scheme);
  }
  return parsed;
}

function applyQueryParams(
  url: URL,
  params: HttpRequestConfig["queryParams"],
): URL {
  if (!params || params.length === 0) return url;
  const next = new URL(url.toString());
  for (const { key, value } of params) {
    next.searchParams.append(key, value);
  }
  return next;
}

function buildRequestHeaders(
  configHeaders: HttpRequestConfig["headers"],
  auth: HttpRequestAuthConfig | undefined,
): Headers {
  const headers = new Headers();
  if (configHeaders) {
    for (const { key, value } of configHeaders) {
      // Drop user-supplied Authorization — the auth scheme below owns the
      // canonical header. This prevents accidental smuggling via the
      // generic headers list.
      if (key.toLowerCase() === "authorization") continue;
      headers.set(key, value);
    }
  }
  if (!auth || auth.type === "none") return headers;
  if (auth.type === "bearer") {
    headers.set("Authorization", `Bearer ${auth.token}`);
    return headers;
  }
  if (auth.type === "basic") {
    const encoded = Buffer.from(
      `${auth.username}:${auth.password}`,
      "utf8",
    ).toString("base64");
    headers.set("Authorization", `Basic ${encoded}`);
    return headers;
  }
  // apiKey
  headers.set(auth.headerName, auth.headerValue);
  return headers;
}

function methodAllowsBody(method: HttpRequestConfig["method"]): boolean {
  return method !== "GET";
}

interface CapturedBody {
  body: string;
  bytesCaptured: number;
  truncated: boolean;
}

async function captureBoundedBody(response: Response): Promise<CapturedBody> {
  if (!response.body) {
    return { body: "", bytesCaptured: 0, truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let captured = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_RESPONSE_BYTES - captured;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (value.byteLength <= remaining) {
        chunks.push(value);
        captured += value.byteLength;
      } else {
        chunks.push(value.slice(0, remaining));
        captured += remaining;
        truncated = true;
        break;
      }
    }
  } finally {
    if (truncated) {
      // Release the socket — we won't drain the rest.
      try {
        await reader.cancel();
      } catch {
        // best effort; cancellation errors are not reported upstream.
      }
    }
  }
  const combined = new Uint8Array(captured);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder("utf-8").decode(combined);
  return { body, bytesCaptured: captured, truncated };
}

function sanitizeResponseHeaders(
  headers: Headers,
): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_RESPONSE_HEADERS.has(lower)) return;
    if (Buffer.byteLength(value, "utf8") > MAX_HEADER_VALUE_BYTES) return;
    out[lower] = value;
  });
  return out;
}

function parseJsonBodyIfApplicable(
  contentType: string | null,
  body: string,
  truncated: boolean,
): unknown {
  if (truncated) return null;
  if (!contentType) return null;
  const lower = contentType.toLowerCase();
  const looksJson =
    lower.includes("application/json") || lower.includes("+json");
  if (!looksJson) return null;
  if (body.length === 0) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
