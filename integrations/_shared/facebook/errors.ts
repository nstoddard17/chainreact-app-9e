/**
 * Facebook Graph API typed errors — Slice 3.FACEBOOK-2.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — the request layer throws THAT on a
 * 401 / Graph code 190 so refresh-and-retry can react. This file holds the
 * Facebook-shape errors handlers (not the refresh wrapper) catch. Mirrors
 * `_shared/dropbox/errors.ts`.
 *
 * **Sanitization rule (load-bearing):** Graph error bodies can echo the
 * request (message text, paths, node ids). Every error surfaced from this
 * layer carries ONLY Graph's machine-readable `type` / `code` /
 * `error_subcode` — never the free-text `message`, the raw response body,
 * the access token, the app secret, the `appsecret_proof`, media bytes,
 * media URLs, or message content.
 */

/**
 * Thrown for Graph permission failures (code 200 / 10 / 3 — and the
 * `OAuthException` permission subcodes). The most common cause in V2 is a
 * scope that needs Meta Advanced Access (App Review) for external users.
 * The hint is static — it never echoes the Graph message.
 */
export class FacebookPermissionError extends Error {
  /** Machine-readable `type/code[/subcode]` tag. */
  readonly tag: string;
  constructor(tag: string) {
    super(
      `Facebook permission denied (${tag}). The Facebook Page permission for this action may need Meta App Review (Advanced Access), or the connected user may lack a role on the Page. Reconnect with the required permissions granted.`,
    );
    this.name = "FacebookPermissionError";
    this.tag = tag;
  }
}

/**
 * Thrown when Graph reports the node/object doesn't exist (code 100
 * `GraphMethodException` on a missing node, or a deleted post id).
 */
export class NotFoundError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`Facebook resource not found (${tag}).`);
    this.name = "NotFoundError";
    this.tag = tag;
  }
}

/**
 * Thrown on Graph rate-limit codes (4 app-level, 17 user-level, 32 page-
 * level, 613 custom-rate, 80001+ messaging). FACEBOOK-2 surfaces the typed
 * error + logs; auto-backoff is deferred (FACEBOOK-N).
 */
export class RateLimitError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`Facebook rate limit exceeded (${tag}).`);
    this.name = "RateLimitError";
    this.tag = tag;
  }
}

/**
 * Thrown by the media upload handlers when the supplied `FileRef` can't be
 * consumed — currently `kind=provider_url` (V2 has no cross-provider
 * bearer-fetch; the bytes must be staged first). Mirrors
 * `DropboxUploadConfigError`. Carries a static `hint`; never echoes bytes
 * or URLs.
 */
export class FacebookUploadConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "FacebookUploadConfigError";
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Generic Graph API error — anything not 401 / permission / not-found /
 * rate. The constructor receives an already-sanitized tag (the
 * `type/code` descriptor or `HTTP <status>`).
 */
export class FacebookApiError extends Error {
  readonly status: number | null;
  readonly tag: string;
  constructor(tag: string, status: number | null = null) {
    super(`Facebook API error${status ? ` (HTTP ${status})` : ""}: ${tag}`);
    this.name = "FacebookApiError";
    this.status = status;
    this.tag = tag;
  }
}

/** Raw Graph error envelope (subset we read). */
export interface FacebookErrorEnvelope {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Graph error `code`s that indicate an invalid/expired access token. */
export const FACEBOOK_AUTH_CODES: ReadonlySet<number> = new Set([190]);
/** Graph error `code`s that indicate a permission / App-Review gap. */
export const FACEBOOK_PERMISSION_CODES: ReadonlySet<number> = new Set([
  10, 200, 3, 299,
]);
/** Graph error `code`s that indicate throttling. */
export const FACEBOOK_RATE_CODES: ReadonlySet<number> = new Set([
  4, 17, 32, 613, 80001, 80002, 80003, 80004,
]);

/**
 * Pull Graph's machine-readable `type`/`code`/`error_subcode` out of a
 * response body into a sanitized tag. NEVER returns the free-text
 * `message` or the raw body. Falls back to `HTTP <status>`.
 */
export function surfaceFacebookError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as FacebookErrorEnvelope;
    const e = parsed.error;
    if (e && (e.type || typeof e.code === "number")) {
      const parts: string[] = [];
      if (e.type) parts.push(e.type);
      if (typeof e.code === "number") parts.push(`code=${e.code}`);
      if (typeof e.error_subcode === "number")
        parts.push(`subcode=${e.error_subcode}`);
      return parts.join("/") || `HTTP ${status}`;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}

/** Parse the numeric Graph `error.code` from a body, or null. */
export function parseFacebookErrorCode(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as FacebookErrorEnvelope;
    return typeof parsed.error?.code === "number" ? parsed.error.code : null;
  } catch {
    return null;
  }
}
