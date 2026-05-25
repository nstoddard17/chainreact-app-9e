import {
  DiscordApiError,
  NotFoundError,
  parseDiscordErrorBody,
  surfaceDiscordError,
} from "../errors";
import { discordApiUrl, getDiscordBotToken } from "./_base";

/**
 * Shared HTTP request helper for Discord REST API v10 wrappers.
 *
 * Slice 3.DISCORD-2 (runtime port). Mirrors `_shared/mailchimp/api/_request.ts`
 * shape — thin per-resource wrappers (messages.ts, members.ts) construct
 * path + body and delegate to this helper for HTTP semantics + auth +
 * error mapping.
 *
 * **Bot-token auth.** Every call authenticates as the global bot via
 * `Authorization: Bot <token>`. The token is resolved from
 * `DISCORD_BOT_TOKEN` env via `getDiscordBotToken()` — never accepted
 * as an input, never logged. Discord's auth scheme prefix is `Bot ` for
 * bot tokens (distinct from `Bearer ` for user OAuth tokens — never use
 * Bearer in this helper).
 *
 * **Content-Type routing.** JSON bodies (default) use
 * `Content-Type: application/json`. Empty bodies (GET / DELETE / no-body
 * POST like bulk-delete confirmation) omit the header.
 *
 * **Error mapping.**
 *   - 404 → `NotFoundError(resource)`. Discord uses 404 for unknown
 *     guild / unknown channel / unknown member / unknown message. The
 *     resource label gives the caller a stable, user-meaningful string.
 *   - 401 → `DiscordApiError(401, ...)`. The bot token is invalid /
 *     revoked. Distinct from user-OAuth 401: the bot token is global
 *     env — there is no per-user refresh path. Action handlers do NOT
 *     wrap this in `refreshAndRetry` (no refresh exists). Operator
 *     must rotate the env var.
 *   - 403 → `DiscordApiError(403, ...)`. Bot lacks permission for the
 *     attempted action (e.g. not in guild, missing Manage Messages,
 *     trying to edit a user's message). Message body usually carries a
 *     useful explanation.
 *   - 429 → `DiscordApiError(429, ...)`. Rate-limited. V2 does NOT
 *     auto-retry — the per-handler `delay` action or downstream
 *     orchestration owns retry policy. V1 had ad-hoc retry in
 *     send_message only; V2 keeps the boundary at the wrapper layer.
 *   - Other non-OK → `DiscordApiError(status, code, message)`. Status,
 *     Discord error code (when present), and surfaced message are all
 *     preserved so callers can branch on specifics.
 *   - 204 / 201 with empty body → resolves with `null` cast to T (caller
 *     must pick a void-compatible return type).
 *
 * Read-once semantics: the response body is read at most once
 * (`text()` for error paths, `json()` for success). Discord's
 * `fetch.Response` only allows one body read.
 */

export interface DiscordRequestInput {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Path relative to the Discord v10 base (`/api/v10/`). MUST start with
   * a leading slash. The helper prepends the versioned segment; callers
   * pass paths like `"/channels/123/messages"`.
   */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional JSON body object. Stringified verbatim — drop nulls /
   * undefineds at the wrapper layer if needed. Pass `undefined` for
   * GET / DELETE / endpoints that take no body.
   */
  body?: Readonly<Record<string, unknown> | readonly unknown[]>;
  /**
   * Resource label for `NotFoundError`. Pass a stable, user-meaningful
   * string like `"channel 12345"`, `"message 67890"`, `"member 11111"`.
   */
  resourceForNotFound: string;
  /**
   * Optional reason for audit-log entry (Discord supports
   * `X-Audit-Log-Reason` on most write endpoints — message/role/member
   * mutations show this string in the server's audit log). Max 512
   * chars per Discord docs; the helper sends the header verbatim and
   * lets Discord enforce length.
   */
  auditLogReason?: string;
}

export async function discordBotRequest<T>(
  input: DiscordRequestInput,
): Promise<T> {
  const token = getDiscordBotToken();
  const queryString = input.query ? input.query.toString() : "";
  const url = `${discordApiUrl(input.path)}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    Accept: "application/json",
  };
  if (input.auditLogReason !== undefined && input.auditLogReason.length > 0) {
    headers["X-Audit-Log-Reason"] = input.auditLogReason;
  }

  let bodyString: string | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.body);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceDiscordError(text, 404),
    );
  }
  if (res.status === 204) {
    // No content (Discord returns 204 for DELETE, role-add success). Caller
    // picks a void-compatible return type; this resolves with null cast.
    return null as T;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const { code, message } = parseDiscordErrorBody(text);
    throw new DiscordApiError(
      res.status,
      code,
      message.length > 0 ? message : res.statusText || `HTTP ${res.status}`,
    );
  }

  // Some success responses (e.g. PUT role-add) return 204 with no body
  // (handled above) or 201 with a body. JSON-parse on 2xx with content.
  if (res.status === 201 && res.headers.get("content-length") === "0") {
    return null as T;
  }
  return (await res.json()) as T;
}
