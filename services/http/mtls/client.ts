import * as https from "node:https";
import {
  MtlsError,
  extractCauseCode,
  type MtlsErrorCode,
} from "./errors";
import { assertCertificateCurrentlyValid } from "./certificate";

/**
 * Reusable server-side mutual-TLS HTTP transport.
 *
 * Provider-neutral infrastructure. First consumer: ADP, which requires a client
 * certificate + private key to be presented at the TLS layer on EVERY request
 * (token endpoint and API endpoints alike). The global WHATWG `fetch` exposes no
 * client-certificate option, so this is built directly on `node:https`.
 *
 * Design goals (from the ADP infrastructure plan §3):
 *   - certificate/key presented per request (no shared mutable agent state);
 *   - up-front certificate-expiry validation (fail fast + clearly, not with an
 *     opaque handshake error);
 *   - server certificate verification ALWAYS on (`rejectUnauthorized: true`);
 *   - hard request timeout;
 *   - bounded response body (never buffer an unbounded provider response);
 *   - redacted errors (see `errors.ts` — no PEM / key / body / auth header ever
 *     appears in a thrown message);
 *   - conservative, safe retry (transient only; non-idempotent methods retried
 *     ONLY on explicit opt-in — the OAuth token mint is the intended case).
 *
 * The socket layer is injectable (`createMtlsClient`) so orchestration — timeout,
 * retry, cap, error mapping — is unit-tested deterministically without real
 * sockets, while the default path exercises real `node:https` (integration test).
 */

export interface MtlsClientCredential {
  /** PEM client certificate presented at the TLS layer. */
  certPem: string;
  /** PEM private key (unencrypted) matching `certPem`. */
  keyPem: string;
  /**
   * Optional PEM CA bundle to verify the SERVER against. Omit to use Node's
   * bundled system roots (correct for public providers like ADP). Never a way
   * to DISABLE verification — `rejectUnauthorized` stays true regardless.
   */
  caPem?: string;
}

export interface MtlsRequestInput {
  method: string;
  /** Absolute https URL. http/other schemes are rejected. */
  url: string;
  headers?: Record<string, string>;
  /** utf8 request body; JSON callers stringify before calling. */
  body?: string;
  credential: MtlsClientCredential;
  /** Hard per-attempt timeout. Default 30s. */
  timeoutMs?: number;
  /** Response body cap. Default 5 MiB. Exceeding it aborts with `response_too_large`. */
  maxResponseBytes?: number;
  /** Transient-failure retries (connection reset / timeout / 429 / 5xx). Default 0. */
  retries?: number;
  /** Base backoff between retries (doubles each attempt). Default 200ms. */
  retryBaseDelayMs?: number;
  /**
   * Permit retrying non-idempotent methods (POST/PATCH). Default false. Set true
   * ONLY when the call has no side effects on repeat — the OAuth `client_credentials`
   * token mint is the canonical safe case.
   */
  allowRetryOnNonIdempotent?: boolean;
  /** Injected clock for the cert-expiry precheck. */
  now?: Date;
  /** Skip the up-front cert-expiry precheck (caller validated already). */
  skipCertExpiryCheck?: boolean;
}

export interface MtlsResponse {
  status: number;
  /** Lowercased header map; multi-value headers joined with ", ". */
  headers: Record<string, string>;
  /** Decoded utf8 body, bounded by `maxResponseBytes`. */
  body: string;
}

/** Low-level socket dispatch — the only injectable seam. */
export interface MtlsDispatchInput {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
  credential: MtlsClientCredential;
  timeoutMs: number;
  maxResponseBytes: number;
}
export type MtlsDispatch = (input: MtlsDispatchInput) => Promise<MtlsResponse>;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
]);
/** Transient error codes eligible for retry (NOT certificate/handshake errors). */
const RETRYABLE_CODES: ReadonlySet<MtlsErrorCode> = new Set([
  "connection_failed",
  "timeout",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeHeaders(
  raw: import("node:http").IncomingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** Classify a low-level Node socket/TLS error into a redacted MtlsError. */
function mapSocketError(err: unknown): MtlsError {
  const code = extractCauseCode(err);
  // TLS/SSL/certificate failures are NOT transient (bad cert/key/CA) → do not retry.
  if (code && (/^ERR_(TLS|SSL)/.test(code) || /CERT|SSL|TLS/.test(code))) {
    return new MtlsError(
      "tls_handshake_failed",
      "TLS handshake with the provider failed (certificate, key, or trust problem).",
      code,
    );
  }
  return new MtlsError(
    "connection_failed",
    "Could not connect to the provider.",
    code,
  );
}

/** Real socket dispatch over node:https, presenting the client certificate. */
const nodeHttpsDispatch: MtlsDispatch = (input) =>
  new Promise<MtlsResponse>((resolve, reject) => {
    const { url } = input;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: input.method,
        headers: input.headers,
        cert: input.credential.certPem,
        key: input.credential.keyPem,
        ca: input.credential.caPem, // undefined ⇒ system roots
        // Server-side verification is ALWAYS on. This transport never disables it.
        rejectUnauthorized: true,
        timeout: input.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > input.maxResponseBytes) {
            req.destroy();
            done(() =>
              reject(
                new MtlsError(
                  "response_too_large",
                  `The provider response exceeded the ${input.maxResponseBytes}-byte cap.`,
                ),
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          done(() =>
            resolve({
              status: res.statusCode ?? 0,
              headers: normalizeHeaders(res.headers),
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          ),
        );
        res.on("error", (err) => done(() => reject(mapSocketError(err))));
      },
    );

    req.on("timeout", () => {
      // `timeout` does not abort on its own — destroy so the 'error' path fires.
      req.destroy(new MtlsError("timeout", "The provider request timed out."));
    });
    req.on("error", (err) =>
      done(() => reject(err instanceof MtlsError ? err : mapSocketError(err))),
    );

    if (input.body !== undefined) req.write(input.body);
    req.end();
  });

function shouldRetry(
  err: MtlsError | null,
  status: number | null,
  method: string,
  allowNonIdempotent: boolean,
): boolean {
  const methodOk = IDEMPOTENT_METHODS.has(method) || allowNonIdempotent;
  if (!methodOk) return false;
  if (err) return RETRYABLE_CODES.has(err.code);
  if (status !== null) return status === 429 || status >= 500;
  return false;
}

/**
 * Create an mTLS client with an injectable socket dispatch. Production callers
 * use `mtlsRequest` (bound to the real `node:https` dispatch); tests inject a
 * fake dispatch to exercise timeout/retry/cap/error-mapping deterministically.
 */
export function createMtlsClient(deps?: { dispatch?: MtlsDispatch }) {
  const dispatch = deps?.dispatch ?? nodeHttpsDispatch;

  async function request(input: MtlsRequestInput): Promise<MtlsResponse> {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new MtlsError("invalid_url", "The request URL is not a valid absolute URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new MtlsError(
        "invalid_url",
        "mTLS requests must target an https:// URL.",
      );
    }

    // Up-front certificate-expiry validation — fail fast + clearly instead of
    // surfacing an opaque handshake error mid-flight. Throws CertificateExpired /
    // CertificateNotYetValid (redacted).
    if (!input.skipCertExpiryCheck) {
      assertCertificateCurrentlyValid(input.credential.certPem, input.now);
    }

    const method = input.method.toUpperCase();
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResponseBytes = input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const retries = Math.max(0, input.retries ?? 0);
    const baseDelay = input.retryBaseDelayMs ?? 200;
    const allowNonIdempotent = input.allowRetryOnNonIdempotent ?? false;

    const dispatchInput: MtlsDispatchInput = {
      method,
      url: parsed,
      headers: input.headers ?? {},
      ...(input.body !== undefined ? { body: input.body } : {}),
      credential: input.credential,
      timeoutMs,
      maxResponseBytes,
    };

    let lastErr: MtlsError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: MtlsResponse | null = null;
      let err: MtlsError | null = null;
      try {
        res = await dispatch(dispatchInput);
      } catch (e) {
        // Certificate-window errors and any MtlsError propagate; unknown errors
        // are mapped to a redacted connection failure (defense in depth — the
        // real dispatch already maps, but an injected dispatch might not).
        err = e instanceof MtlsError ? e : mapSocketError(e);
      }

      const status = res ? res.status : null;
      if (
        attempt < retries &&
        shouldRetry(err, status, method, allowNonIdempotent)
      ) {
        lastErr = err;
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      if (err) throw err;
      return res as MtlsResponse;
    }
    // Unreachable in practice (loop returns/throws), but satisfies the type.
    throw lastErr ?? new MtlsError("connection_failed", "The provider request failed.");
  }

  return { request };
}

const defaultClient = createMtlsClient();

/** Perform a mutual-TLS request over the real node:https transport. */
export function mtlsRequest(input: MtlsRequestInput): Promise<MtlsResponse> {
  return defaultClient.request(input);
}
