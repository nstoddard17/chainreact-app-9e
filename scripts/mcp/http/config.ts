/**
 * Internal MCP server — HTTP transport configuration (Stage 1.5).
 *
 * The HTTP transport is OPT-IN and exists ONLY to let a ChatGPT Developer Mode
 * custom connector (or any Streamable-HTTP MCP client) reach the SAME curated,
 * read-only tool registry the stdio server exposes. It adds NO new tools, NO new
 * data access, and NO new commands — it is a second front door onto the existing
 * `handleRpc` + `buildRegistry` core.
 *
 * Security posture (mirrors the stdio server's "deny by default"):
 *   - A bearer token is REQUIRED. It is read from the environment only
 *     (`MCP_HTTP_TOKEN`), never from source. The server refuses to start without
 *     one. The token is never logged.
 *   - The server binds to loopback (127.0.0.1) by default. Binding to any other
 *     interface requires an explicit `MCP_HTTP_ALLOW_EXTERNAL` opt-in, because
 *     exposing the port (even behind a tunnel) widens the attack surface.
 *   - `Origin` is validated when present (DNS-rebinding defense per the MCP
 *     Streamable HTTP security guidance).
 *
 * Zero new dependencies: Node built-ins only, same as the rest of scripts/mcp.
 */

/** Parsed, validated HTTP transport configuration. */
export interface HttpConfig {
  /** Bearer token required on every request (from MCP_HTTP_TOKEN). */
  token: string;
  /** Interface to bind. Loopback unless allowExternal is set. */
  host: string;
  /** TCP port to listen on. */
  port: number;
  /** The single MCP endpoint path (default "/mcp"). */
  path: string;
  /** Whether a non-loopback bind was explicitly authorized. */
  allowExternal: boolean;
  /**
   * Exact `Origin` values permitted when an Origin header is present. Empty by
   * default — server-to-server callers (ChatGPT/OpenAI backend, curl) send no
   * Origin and are allowed; a browser Origin is rejected unless allow-listed.
   */
  allowedOrigins: readonly string[];
  /** Max accepted request body size (bytes). */
  maxBodyBytes: number;
}

/** Raised when the environment cannot produce a safe config. Never includes the token. */
export class HttpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpConfigError";
  }
}

const MIN_TOKEN_LENGTH = 16;
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PATH = "/mcp";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — tool args are tiny.

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * Build the HTTP config from environment variables. Throws `HttpConfigError`
 * (with a token-free message) when the environment is unsafe or incomplete.
 *
 * Env:
 *   MCP_HTTP_TOKEN           (required) bearer token, >= 16 chars
 *   MCP_HTTP_HOST            (default 127.0.0.1)
 *   MCP_HTTP_PORT            (default 8765)
 *   MCP_HTTP_PATH            (default /mcp)
 *   MCP_HTTP_ALLOW_EXTERNAL  (opt-in) allow binding a non-loopback host
 *   MCP_HTTP_ALLOWED_ORIGINS (default empty) comma-separated exact origins
 */
export function loadHttpConfig(
  env: Record<string, string | undefined> = process.env,
): HttpConfig {
  const token = (env.MCP_HTTP_TOKEN ?? "").trim();
  if (!token) {
    throw new HttpConfigError(
      "MCP_HTTP_TOKEN is required to start the HTTP transport. Set it in your " +
        "shell (not in source) — see docs/runbooks/chatgpt-mcp-developer-mode.md.",
    );
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new HttpConfigError(
      `MCP_HTTP_TOKEN is too short (need >= ${MIN_TOKEN_LENGTH} chars). ` +
        "Generate a strong one with: openssl rand -hex 32",
    );
  }

  const host = (env.MCP_HTTP_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
  const allowExternal = isTruthyEnv(env.MCP_HTTP_ALLOW_EXTERNAL);
  if (!isLoopback(host) && !allowExternal) {
    throw new HttpConfigError(
      `Refusing to bind non-loopback host "${host}" without MCP_HTTP_ALLOW_EXTERNAL=1. ` +
        "Bind 127.0.0.1 and use a tunnel, or opt in explicitly and understand the risk.",
    );
  }

  const portRaw = (env.MCP_HTTP_PORT ?? "").trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new HttpConfigError(`MCP_HTTP_PORT must be an integer 0-65535 (got "${portRaw}").`);
  }

  let path = (env.MCP_HTTP_PATH ?? DEFAULT_PATH).trim() || DEFAULT_PATH;
  if (!path.startsWith("/")) path = `/${path}`;

  const allowedOrigins = (env.MCP_HTTP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  return {
    token,
    host,
    port,
    path,
    allowExternal,
    allowedOrigins,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  };
}
