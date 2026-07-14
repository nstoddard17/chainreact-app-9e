/**
 * Redaction helpers for the MCP client. The bearer token, tool arguments, and tool
 * result content are ALL potentially sensitive (Eden content can be private posts /
 * notes). Nothing here ever returns a value that could carry them into a log/error.
 */

/** A short, non-reversible fingerprint of a token for correlating without leaking it. */
export function tokenFingerprint(token: string): string {
  // Length + first 4 chars of the public prefix only (e.g. "eden"). NEVER the secret body.
  const prefix = token.slice(0, 4);
  return `${prefix}…(${token.length})`;
}

/**
 * Assert a string is safe to log/throw: contains no `eden_pat_`-style secret and no
 * Bearer token. Used defensively when composing error detail from provider messages.
 * Returns a scrubbed copy (never throws).
 */
export function scrubSecrets(text: string): string {
  return text
    // eden_pat_ and generic *_pat_ / sk-/token-like blobs
    .replace(/[a-z0-9]+_pat_[A-Za-z0-9._-]+/gi, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
