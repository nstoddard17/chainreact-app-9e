import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `users.info` client (Slack 2.3 Commit 4).
 *
 * Reads a single user object by id. Returns Slack's `user` object
 * verbatim (snake_case keys); the action handler projects useful
 * flat fields onto the output for convenient downstream access while
 * keeping the full raw object available.
 *
 * Slack docs: https://api.slack.com/methods/users.info
 *
 * Scope: `users:read`. `profile.email` is populated ONLY when the app
 * additionally has `users:read.email` — Slack 2.3 intentionally does
 * NOT request that PII-bearing scope, so workflows accessing email
 * downstream will see `null` / absent. Documented in the handler.
 */
export interface UsersInfoInput {
  botToken: string;
  /** Slack user id (U-prefix). No name resolution. */
  user: string;
}

export interface UsersInfoResult {
  user: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  user?: Record<string, unknown>;
}

export async function usersInfo(
  input: UsersInfoInput,
): Promise<UsersInfoResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "users.info",
    input.botToken,
    { user: input.user },
  );
  // Slack documents `user` as guaranteed on `ok: true`. Defense in
  // depth — a malformed-but-200 response shouldn't surface as a
  // TypeError downstream; convert to the same SlackApiError shape
  // every other wrapper raises on logical failure.
  if (!response.user) {
    throw new SlackApiError("user_not_found");
  }
  return { user: response.user };
}
