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
