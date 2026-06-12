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

export function isSlackAuthError(slackErrorCode: string): boolean {
  return SLACK_AUTH_ERROR_CODES.has(slackErrorCode);
}
