/**
 * Internal MCP server — HTTP transport auth + redaction (Stage 1.5).
 *
 * Local-dev auth: a single shared bearer token, compared in constant time. The
 * primary mechanism is the `Authorization: Bearer <token>` header (what curl,
 * the smoke test, and header-capable MCP clients send). A `?key=<token>` query
 * fallback exists ONLY for clients that cannot attach a custom Authorization
 * header (documented as a tradeoff — URLs may be logged by tunnels/proxies).
 *
 * Nothing here imports app code, Supabase, or any secret store. The token comes
 * from the validated `HttpConfig` (env-sourced) and is never written to a log.
 */
import { timingSafeEqual } from "node:crypto";
import type { HttpConfig } from "./config";

/** Lower-cased header bag (Node lowercases incoming header names). */
export type HeaderBag = Record<string, string | undefined>;

/** Constant-time string compare. Length mismatch short-circuits (length is not secret). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Extract a presented token from a request: `Authorization: Bearer <t>` first,
 * then a `key` / `token` query param. Returns null when none is present.
 */
export function extractPresentedToken(
  headers: HeaderBag,
  query: Record<string, string | undefined>,
): string | null {
  const auth = headers["authorization"];
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match && match[1]) return match[1].trim();
  }
  const q = query.key ?? query.token;
  if (q) return q.trim();
  return null;
}

/** True when the request presents the configured bearer token. */
export function isAuthorized(
  headers: HeaderBag,
  query: Record<string, string | undefined>,
  config: HttpConfig,
): boolean {
  const presented = extractPresentedToken(headers, query);
  if (!presented) return false;
  return safeEqual(presented, config.token);
}

/**
 * Validate the `Origin` header (DNS-rebinding defense). Server-to-server callers
 * (ChatGPT/OpenAI backend, curl) send no Origin → allowed. A browser-style
 * Origin is allowed only when it is in `config.allowedOrigins`.
 */
export function isOriginAllowed(headers: HeaderBag, config: HttpConfig): boolean {
  const origin = headers["origin"];
  if (!origin) return true;
  return config.allowedOrigins.includes(origin.trim());
}

/**
 * Scrub the configured bearer token from any outbound string (logs, error
 * text). Defense-in-depth: we never deliberately place the token in a message,
 * but this guarantees an accidental interpolation can't leak it.
 */
export function redactToken(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("[REDACTED:mcp-token]");
}
