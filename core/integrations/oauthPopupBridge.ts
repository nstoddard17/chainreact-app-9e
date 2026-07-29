/**
 * REACT-AGENT-GUIDED-BUILD-1 — the OAuth popup completion bridge contract.
 *
 * The builder's guided Connect stage launches OAuth in a POPUP so the builder
 * page (unsaved draft + in-memory React Agent conversation + guided stage)
 * never navigates. When the flow was started with a popup return context, the
 * OAuth callback redirects the popup to a fixed in-app completion page, which
 * posts ONE message to `window.opener` and closes. The opener validates the
 * message by ORIGIN + NONCE before trusting it.
 *
 * Security model:
 *   - The return context is ALLOW-LISTED, never a URL. The only supported
 *     surface is `builder_popup`, which maps to the fixed internal completion
 *     path below — the client can never steer the callback redirect anywhere
 *     else (no open-redirect surface).
 *   - The nonce is CLIENT-GENERATED randomness identifying one connect
 *     attempt. It is not a secret or a credential — it exists so the opener
 *     ignores messages that don't belong to the attempt it launched. The
 *     server round-trips it inside the SIGNED OAuth state (JWT-only, like
 *     `providerHint`), so a forged bridge URL can't be minted with someone
 *     else's flow.
 *   - The bridge message carries ONLY: the provider slug, a connected/error
 *     status, an optional STABLE redacted error code, and the nonce. Never a
 *     token, credential, provider identity, account id, or raw error.
 *
 * Pure module: no React, no fetch, no I/O — shared by the server callback
 * route, the completion page, and the builder's popup listener.
 */

/** The single allow-listed popup return surface. */
export const OAUTH_POPUP_RETURN_SURFACE = "builder_popup" as const;

/** Allow-listed return context carried inside the signed OAuth state. */
export interface OAuthReturnContext {
  readonly surface: typeof OAUTH_POPUP_RETURN_SURFACE;
  /** Client-generated attempt identifier (not a secret). */
  readonly nonce: string;
}

/**
 * Nonce format: URL-safe, bounded. Rejects anything that couldn't have come
 * from the builder's own generator (guards the query param + postMessage
 * payload against injection of markup / oversized junk).
 */
export const OAUTH_RETURN_NONCE_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

/** Provider slugs are lowercase kebab (matches manifest ids). */
const PROVIDER_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Stable redacted error codes are snake_case-ish short tokens. */
const ERROR_CODE_REGEX = /^[a-z0-9_.-]{1,64}$/i;

/** Shape-validate a candidate return context (route body / verified JWT). */
export function isValidOAuthReturnContext(
  value: unknown,
): value is OAuthReturnContext {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const v = value as { surface?: unknown; nonce?: unknown };
  return (
    v.surface === OAUTH_POPUP_RETURN_SURFACE &&
    typeof v.nonce === "string" &&
    OAUTH_RETURN_NONCE_REGEX.test(v.nonce)
  );
}

/** Fixed internal completion path the callback redirects a popup flow to. */
export const OAUTH_POPUP_COMPLETE_PATH = "/integrations/oauth-popup-complete";

export type OAuthPopupResultStatus = "connected" | "error";

/** Build the completion-page path (path + query only; caller owns the origin). */
export function buildOAuthPopupCompletePath(input: {
  readonly provider: string;
  readonly status: OAuthPopupResultStatus;
  readonly nonce: string;
  /** Stable REDACTED error code (never a raw provider/infra message). */
  readonly errorCode?: string;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    status: input.status,
    nonce: input.nonce,
  });
  if (input.errorCode) params.set("code", input.errorCode);
  return `${OAUTH_POPUP_COMPLETE_PATH}?${params.toString()}`;
}

/** postMessage type discriminator for the completion message. */
export const OAUTH_POPUP_MESSAGE_TYPE = "chainreact:oauth-popup-complete" as const;

export interface OAuthPopupMessage {
  readonly type: typeof OAUTH_POPUP_MESSAGE_TYPE;
  readonly provider: string;
  readonly status: OAuthPopupResultStatus;
  readonly nonce: string;
  readonly errorCode?: string;
}

/** Build the message the completion page posts to its opener. */
export function buildOAuthPopupMessage(input: {
  readonly provider: string;
  readonly status: OAuthPopupResultStatus;
  readonly nonce: string;
  readonly errorCode?: string;
}): OAuthPopupMessage {
  return {
    type: OAUTH_POPUP_MESSAGE_TYPE,
    provider: input.provider,
    status: input.status,
    nonce: input.nonce,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  };
}

/**
 * Strictly parse an untrusted `message` event payload. Returns null for
 * anything that isn't a well-formed completion message — the listener must
 * ALSO check `event.origin === window.location.origin` and match the nonce
 * against the attempt it launched before acting.
 */
export function parseOAuthPopupMessage(data: unknown): OAuthPopupMessage | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as {
    type?: unknown;
    provider?: unknown;
    status?: unknown;
    nonce?: unknown;
    errorCode?: unknown;
  };
  if (d.type !== OAUTH_POPUP_MESSAGE_TYPE) return null;
  if (typeof d.provider !== "string" || !PROVIDER_SLUG_REGEX.test(d.provider)) return null;
  if (d.status !== "connected" && d.status !== "error") return null;
  if (typeof d.nonce !== "string" || !OAUTH_RETURN_NONCE_REGEX.test(d.nonce)) return null;
  if (d.errorCode !== undefined) {
    if (typeof d.errorCode !== "string" || !ERROR_CODE_REGEX.test(d.errorCode)) return null;
  }
  return {
    type: OAUTH_POPUP_MESSAGE_TYPE,
    provider: d.provider,
    status: d.status,
    nonce: d.nonce,
    ...(typeof d.errorCode === "string" ? { errorCode: d.errorCode } : {}),
  };
}

/**
 * Sanitize completion-page search params (untrusted URL input) into a safe
 * render/post model. Invalid or missing pieces collapse to null — the page
 * renders a generic note and posts nothing.
 */
export function sanitizeOAuthPopupCompleteParams(params: {
  readonly provider?: string | undefined;
  readonly status?: string | undefined;
  readonly nonce?: string | undefined;
  readonly code?: string | undefined;
}): OAuthPopupMessage | null {
  if (!params.provider || !PROVIDER_SLUG_REGEX.test(params.provider)) return null;
  if (params.status !== "connected" && params.status !== "error") return null;
  if (!params.nonce || !OAUTH_RETURN_NONCE_REGEX.test(params.nonce)) return null;
  const errorCode =
    params.code && ERROR_CODE_REGEX.test(params.code) ? params.code : undefined;
  return buildOAuthPopupMessage({
    provider: params.provider,
    status: params.status,
    nonce: params.nonce,
    ...(errorCode ? { errorCode } : {}),
  });
}
