/**
 * Typed errors for the shared MCP client. Each maps a transport/protocol/tool
 * failure to a category the workflow engine can classify and the Builder can explain,
 * WITHOUT ever carrying the bearer token, tool arguments, or private content.
 *
 * Mapping intent (Eden is the first consumer — `docs/providers/eden/`):
 *   - 401 / auth-expired       → McpAuthError            → reconnect ("action required")
 *   - permission / scope       → McpPermissionError      → e.g. read-only token used for a write
 *   - unknown tool / pinned-off→ McpToolNotFoundError    → catalog drift / not-certified
 *   - 429 / rate limit         → McpRateLimitError       → transient, honor retry-after
 *   - timeout / 5xx / network  → McpTransportError       → transient
 *   - malformed JSON-RPC/MCP   → McpProtocolError        → non-transient shape error
 *   - live schema != pinned    → McpSchemaDriftError     → refuse rather than send wrong args
 *
 * Non-idempotent writes are NEVER auto-retried (see client.ts); only McpRateLimitError
 * / McpTransportError on idempotent reads are retry candidates.
 */

/** Base for every MCP client error. Message is always sanitized (method/tool name only). */
export class McpError extends Error {
  /** True when a retry could plausibly succeed (idempotent callers only). */
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = new.target.name;
    this.retryable = retryable;
  }
}

/** 401 / expired credential. Non-refreshable PAT → surface reconnect. */
export class McpAuthError extends McpError {
  constructor(serverLabel: string) {
    super(`MCP auth failed for ${serverLabel} — reconnect required.`, false);
  }
}

/**
 * The token lacks permission for the requested tool (e.g. a read-only Eden PAT calling
 * a write tool). Actionable, non-retryable: the user must reconnect with a higher scope.
 */
export class McpPermissionError extends McpError {
  readonly tool: string;
  constructor(serverLabel: string, tool: string) {
    super(`MCP tool "${tool}" was denied by ${serverLabel} — the connected token lacks write permission.`, false);
    this.tool = tool;
  }
}

/** The tool is not in the server's live catalog, or not in V2's pinned/certified set. */
export class McpToolNotFoundError extends McpError {
  readonly tool: string;
  constructor(serverLabel: string, tool: string) {
    super(`MCP tool "${tool}" is not available on ${serverLabel}.`, false);
    this.tool = tool;
  }
}

/** 429 / rate limited. Retryable for idempotent calls; carries an optional retry hint (ms). */
export class McpRateLimitError extends McpError {
  readonly retryAfterMs?: number;
  constructor(serverLabel: string, retryAfterMs?: number) {
    super(`MCP request to ${serverLabel} was rate limited.`, true);
    if (typeof retryAfterMs === "number") this.retryAfterMs = retryAfterMs;
  }
}

/** Timeout / network failure / 5xx — transient transport failure. Retryable for reads. */
export class McpTransportError extends McpError {
  readonly status?: number;
  constructor(serverLabel: string, detail: string, status?: number) {
    super(`MCP transport error talking to ${serverLabel}: ${detail}`, true);
    if (typeof status === "number") this.status = status;
  }
}

/** Malformed JSON-RPC / MCP envelope — a non-transient shape violation. */
export class McpProtocolError extends McpError {
  constructor(serverLabel: string, detail: string) {
    super(`MCP protocol error from ${serverLabel}: ${detail}`, false);
  }
}

/** A tool's live input schema diverged from the pinned/certified schema — refuse to call. */
export class McpSchemaDriftError extends McpError {
  readonly tool: string;
  constructor(serverLabel: string, tool: string, detail: string) {
    super(`MCP tool "${tool}" on ${serverLabel} changed shape (${detail}) — refusing to call an uncertified schema.`, false);
    this.tool = tool;
  }
}
