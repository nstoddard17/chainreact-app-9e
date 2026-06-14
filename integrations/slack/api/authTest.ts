import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `auth.test` client (V2-READY-29 — proactive health check).
 *
 * The canonical lightweight token-validity probe. `auth.test` takes no
 * arguments, performs no workspace reads, and is rate-limited generously
 * per-workspace — making it the safe way to ask "is this bot token still
 * good?" without `conversations.list` (which pulls real workspace data and
 * has a stricter tier).
 *
 * On a VALID token Slack returns `{ ok: true, url, team, user, team_id,
 * user_id, ... }`. We deliberately return NOTHING from that body — the only
 * thing the health check needs is the binary verdict, and never surfacing
 * `team_id` / `user_id` / `url` keeps the no-leak guarantee trivially true
 * (there is no provider identifier to accidentally log or return).
 *
 * On an INVALID / revoked / inactive token Slack responds either with a
 * 200 `{ ok:false, error:"invalid_auth" | "token_revoked" | ... }` or a
 * non-2xx status; `slackApiRequest` converts BOTH into a thrown
 * `SlackApiError` carrying the logical code (or `http_<status>`). The caller
 * classifies that code with `isSlackAuthError` to decide reconnect-needed vs
 * transient.
 *
 * Slack docs: https://api.slack.com/methods/auth.test
 */
export interface AuthTestInput {
  botToken: string;
}

export interface AuthTestResult {
  /** Always true — `slackApiRequest` throws SlackApiError on any failure. */
  ok: true;
}

export async function authTest(input: AuthTestInput): Promise<AuthTestResult> {
  // Throws SlackApiError on logical (`ok:false`) or transport (non-2xx)
  // failure. We intentionally discard the success body (team_id/user_id/url).
  await slackApiRequest<SlackOkResponse>("auth.test", input.botToken, {});
  return { ok: true };
}
