/**
 * Dropbox-specific typed errors — Slice 3.DROPBOX-2.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Dropbox-shape errors that handlers (not the refresh
 * wrapper) catch. Mirrors `_shared/monday/errors.ts`.
 *
 * **Sanitization rule (load-bearing):** Dropbox error bodies can echo the
 * request (paths are sensitive per the DROPBOX-1 plan). Every error
 * surfaced from this layer carries ONLY Dropbox's machine-readable
 * `error_summary` tag (e.g. `"path/not_found/."`) — never the raw response
 * body, the requested path, the access token, file bytes, or shared /
 * temporary links.
 */

/**
 * Thrown when Dropbox reports the resource doesn't exist (HTTP 409 with a
 * not-found-shaped `error_summary`, e.g. `path/not_found/.`). Handlers
 * catch this to give a consistent "we couldn't find that" UX.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Dropbox resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Thrown for Dropbox HTTP 409 endpoint conflicts that are NOT not-found —
 * e.g. `shared_link_already_exists/...`, `path/conflict/...`. Carries the
 * leading `error_summary` tag (`summary`) so handlers can branch
 * (create_shared_link reuses the existing link on
 * `shared_link_already_exists`).
 */
export class DropboxConflictError extends Error {
  /** Leading error_summary tag, e.g. "shared_link_already_exists". */
  readonly summary: string;
  constructor(summary: string) {
    super(`Dropbox conflict: ${summary}`);
    this.name = "DropboxConflictError";
    this.summary = summary;
  }
}

/**
 * Thrown on Dropbox rate-limit (HTTP 429). Dropbox returns a
 * `Retry-After` header (seconds). DROPBOX-2 surfaces the typed error +
 * logs; auto-backoff is deferred (DROPBOX-N).
 */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(detail?: string, retryAfterSeconds: number | null = null) {
    super(`Dropbox rate limit exceeded${detail ? `: ${detail}` : ""}.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Generic Dropbox API error — anything that isn't 401 / 404-shape /
 * 409-conflict / rate-shape. The constructor receives an
 * already-sanitized detail (the `error_summary` tag or `HTTP <status>`).
 */
export class DropboxApiError extends Error {
  readonly status: number | null;
  constructor(detail: string, status: number | null = null) {
    super(`Dropbox API error${status ? ` (HTTP ${status})` : ""}: ${detail}`);
    this.name = "DropboxApiError";
    this.status = status;
  }
}

interface DropboxErrorEnvelope {
  error_summary?: string;
  error?: { ".tag"?: string };
}

/**
 * Pull Dropbox's machine-readable `error_summary` tag out of a response
 * body. Strips everything else — never returns the raw body. The
 * `error_summary` is documented as a `/`-delimited tag path (e.g.
 * `"path/not_found/."`) and contains no path strings, tokens, or PII.
 * Falls back to `HTTP <status>` when the body isn't a Dropbox error
 * envelope.
 */
export function surfaceDropboxError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as DropboxErrorEnvelope;
    if (typeof parsed.error_summary === "string" && parsed.error_summary.length > 0) {
      return parsed.error_summary;
    }
    if (typeof parsed.error?.[".tag"] === "string") {
      return parsed.error[".tag"]!;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}

/** True when an `error_summary` tag indicates a not-found failure. */
export function isNotFoundSummary(summary: string): boolean {
  return summary.includes("not_found");
}
