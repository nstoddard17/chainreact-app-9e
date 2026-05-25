/**
 * Discord-specific error types + helpers.
 *
 * Slice 3.DISCORD-2 (runtime port). Mirrors the per-provider error
 * taxonomy used by HubSpot / Shopify / Mailchimp — distinct typed
 * classes for the generic categories so handler-level error mapping
 * stays provider-symmetric.
 *
 * Three structural failure modes are surfaced as typed errors:
 *
 *   - `DiscordBotTokenMissingError`: thrown when an action handler
 *     reaches the network layer with no `DISCORD_BOT_TOKEN` in the
 *     process env. Discord's bot architecture uses a single global
 *     bot token (the bot is one Discord app installed across many
 *     guilds). The token is server-side env only — never persisted
 *     on integration rows, never per-user. A missing env value at
 *     action time means the deploy is misconfigured; we fail loud
 *     so the operator sees a clear error rather than a `Bot
 *     undefined` request.
 *
 *   - `NotFoundError`: 404 wire response. Resource label gives the
 *     caller a stable, user-meaningful string ("channel C123",
 *     "message M456", "guild G789"). Discord uses 404 broadly:
 *     unknown guild / unknown channel / unknown member / unknown
 *     message all funnel through this.
 *
 *   - `DiscordApiError`: catch-all for non-2xx that doesn't map to
 *     a more specific class. Carries the HTTP status + the Discord
 *     error code + the surfaced error message (parsed via
 *     `surfaceDiscordError` below). Bot-not-in-guild (403) and
 *     bot-can-only-edit-own-messages (403) both arrive here.
 *
 * Surface helper `surfaceDiscordError` parses Discord's typed error
 * envelope: `{ code: number, message: string, errors?: object }`.
 * Returns `message` when present; falls back to `HTTP <status>`.
 * Mirrors V1's per-handler `errorData.message || statusText` pattern.
 */

export class DiscordBotTokenMissingError extends Error {
  constructor() {
    super(
      "Discord bot token is not configured. Set DISCORD_BOT_TOKEN in the server env. " +
        "The bot token is global to the ChainReact deployment — not stored per-integration — " +
        "and is required for every Discord action call.",
    );
    this.name = "DiscordBotTokenMissingError";
  }
}

export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(`Discord ${resource} not found${detail ? `: ${detail}` : ""}.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

export class DiscordApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  constructor(status: number, code: number | null, message: string) {
    super(`Discord API error (HTTP ${status}${code !== null ? `, code ${code}` : ""}): ${message}`);
    this.name = "DiscordApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Discord error envelope:
 *   { code: 10003, message: "Unknown Channel", errors: { ... } }
 *
 * `code` is a per-failure-mode integer (Discord maintains the list in
 * their developer docs). `message` is the human-readable string.
 * `errors` is a per-field validation tree for 400s — not surfaced as
 * a string here; the caller has the raw body if they need it.
 */
export interface DiscordErrorBody {
  code: number | null;
  message: string;
}

export function parseDiscordErrorBody(text: string): DiscordErrorBody {
  if (!text) return { code: null, message: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: null, message: "" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { code: null, message: "" };
  }
  const obj = parsed as Record<string, unknown>;
  const code = typeof obj.code === "number" ? obj.code : null;
  const message = typeof obj.message === "string" ? obj.message : "";
  return { code, message };
}

export function surfaceDiscordError(text: string, status: number): string {
  const { message } = parseDiscordErrorBody(text);
  return message.length > 0 ? message : `HTTP ${status}`;
}
