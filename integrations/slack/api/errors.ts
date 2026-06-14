/**
 * Shared Slack API error type.
 *
 * Slack returns 200 even on logical errors with `{ ok: false, error: "..." }`.
 * Every wrapper in `integrations/slack/api/` surfaces those (and non-2xx
 * transport failures) as `SlackApiError` carrying the Slack error code.
 * The engine maps the thrown error to a HANDLER_FAILED step; the engine's
 * error humanizer renders `slackErrorCode` (e.g. `channel_not_found`,
 * `not_in_channel`) into the user-visible message.
 */
export class SlackApiError extends Error {
  readonly slackErrorCode: string;
  constructor(slackErrorCode: string) {
    super(`Slack API failed: ${slackErrorCode}`);
    this.name = "SlackApiError";
    this.slackErrorCode = slackErrorCode;
  }
}

/**
 * Auth/scope/token-class Slack error codes — the failures a user fixes by
 * **re-authorizing** the connection (vs transient/server failures like
 * `ratelimited` / `internal_error`, which a retry may clear). Callers map
 * these to the typed `PROVIDER_REAUTH_REQUIRED` option-source code so the UI
 * offers Reconnect instead of a generic retry. The raw code is used only for
 * this classification + sanitized server logging — never surfaced to the client.
 */
const SLACK_AUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "token_expired",
  "missing_scope",
  "ekm_access_denied",
  "no_permission",
  "org_login_required",
]);

/**
 * Transport-level auth failures (V2-READY-26). Slack usually reports logical
 * errors as HTTP 200 `{ ok:false, error:"invalid_auth" }`, but a revoked /
 * expired / invalid token can also come back as a non-2xx status, which
 * `slackApiRequest` surfaces as `http_<status>` (see `api/_request.ts`). HTTP
 * 401 (Unauthorized) and 403 (Forbidden) are auth/permission-class — the user
 * fixes them by RECONNECTING, not by retrying. Without this, a revoked token
 * that came back as `http_401` was misclassified as a generic provider error
 * and the option picker offered "Try again" instead of "Reconnect" (the
 * production-observed Slack channel-picker failure). Transient transport
 * failures (`http_429` ratelimited, `http_5xx`) are deliberately EXCLUDED — a
 * retry may clear those.
 */
const SLACK_TRANSPORT_AUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  "http_401",
  "http_403",
]);

export function isSlackAuthError(slackErrorCode: string): boolean {
  return (
    SLACK_AUTH_ERROR_CODES.has(slackErrorCode) ||
    SLACK_TRANSPORT_AUTH_ERROR_CODES.has(slackErrorCode)
  );
}
