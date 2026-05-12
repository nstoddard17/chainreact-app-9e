import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `users.list` client (Slack 2.3 Commit 4).
 *
 * Reads a paginated window of workspace members. Cursor-based
 * pagination — caller passes the previous response's `nextCursor`
 * back as `cursor` on the next call. Slack returns an empty-string
 * cursor at the end of pagination; we normalize that to `null`
 * uniformly with the other Slack 2.3 list wrappers.
 *
 * Slack docs: https://api.slack.com/methods/users.list
 *
 * Scope: `users:read`. The `members` array elements carry the same
 * shape as `users.info`'s `user`; `profile.email` is `null` / absent
 * without `users:read.email` (Slack 2.3 plan §6 decision 3).
 *
 * Slack's `users.list` is Tier 2 rate-limited (20 req/min per
 * workspace). Workflow authors paginating with `cursor` should
 * pace their calls. No retry logic in the wrapper.
 */
export interface UsersListInput {
  botToken: string;
  /** Slack accepts up to 1000; default is workspace-tier dependent. */
  limit?: number;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface UsersListResult {
  users: ReadonlyArray<Readonly<Record<string, unknown>>>;
  /** True when Slack indicates more pages exist. */
  hasMore: boolean;
  /** Pass to the next call as `cursor`; `null` when at the end. */
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  members?: Array<Record<string, unknown>>;
  response_metadata?: { next_cursor?: string };
}

export async function usersList(
  input: UsersListInput,
): Promise<UsersListResult> {
  const body: Record<string, unknown> = {};
  if (input.limit !== undefined) body.limit = input.limit;
  if (input.cursor !== undefined) body.cursor = input.cursor;

  const response = await slackApiRequest<SlackResponseBody>(
    "users.list",
    input.botToken,
    body,
  );

  const cursor = response.response_metadata?.next_cursor;
  const normalizedCursor = cursor && cursor.length > 0 ? cursor : null;
  return {
    // Slack docs use `members` here (not `users`); the wrapper exposes
    // it as `users` to match the handler's output shape contract.
    users: response.members ?? [],
    hasMore: normalizedCursor !== null,
    nextCursor: normalizedCursor,
  };
}
