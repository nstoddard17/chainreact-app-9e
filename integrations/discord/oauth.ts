import {
  type EncryptedTokens,
  type ProviderAccountInfo,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Discord OAuth implementation — Slice 3.DISCORD-2 (runtime port).
 *
 * **Identity-only OAuth callback.** This file captures the user's
 * Discord identity into the `integrations` row. The actual bot install
 * (adding the global ChainReact bot to one of the user's guilds) is a
 * side-effect of Discord's authorize page when the `bot` scope is
 * requested — Discord shows an inline server picker, the user selects
 * a guild, and Discord installs the bot before redirecting back to our
 * callback. We never see the bot-install completion ourselves: we only
 * receive the user-identity OAuth code, exchange it for the user
 * access token, and look up the user's identity.
 *
 * **No `guild_id` special-casing.** V1 short-circuited the callback
 * when `guild_id` was in the query params (it treated that as a
 * "bot-add only" flow with no user identity). V2 does not — we always
 * complete the user-identity portion. If the user re-installs the bot
 * to a new guild later, they re-run the connect flow and we re-upsert
 * the integration row (idempotent on the (userId, provider) key).
 *
 * **Refreshable.** Discord issues refresh tokens for identity OAuth.
 * `refreshToken()` re-POSTs to `/oauth2/token` with
 * `grant_type=refresh_token` and returns fresh access + refresh tokens
 * + the original scope set.
 *
 * **Bot token is NOT touched here.** The deployment-level
 * `DISCORD_BOT_TOKEN` env var is read directly by action handlers via
 * `integrations/_shared/discord/api/_base.ts:getDiscordBotToken()`.
 * Never persisted on integration rows.
 *
 * **Bot install permissions** (Discord's `permissions` URL param)
 * are intentionally omitted from this OAuth URL. Discord defaults to
 * the bot application's configured permissions (set in the Discord
 * Developer Portal) when no override is supplied. A future
 * follow-up may wire a permissions param into the authorize URL to
 * force a deterministic permission set; for now we trust the bot's
 * application-level config.
 *
 * **Permissions follow-up.** Production bot install requires the bot
 * to be granted: View Channel, Send Messages, Read Message History,
 * Manage Messages (for delete_message), Manage Roles (for
 * assign_role). The user instruction allows this to be a documented
 * follow-up rather than a full wire-up in this slice.
 */

/**
 * Base URLs are env-overridable for e2e testing only. Production
 * leaves both unset; defaults point at real Discord.
 */
function discordAuthorizeBase(): string {
  return process.env.DISCORD_AUTHORIZE_BASE ?? "https://discord.com";
}

function discordTokenBase(): string {
  return process.env.DISCORD_TOKEN_BASE ?? "https://discord.com";
}

function discordApiBase(): string {
  return process.env.DISCORD_API_BASE ?? "https://discord.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/discord/callback`;
}

function getClientId(): string {
  const id = process.env.DISCORD_CLIENT_ID;
  if (!id) throw new Error("DISCORD_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!secret) throw new Error("DISCORD_CLIENT_SECRET env var is not set.");
  return secret;
}

interface DiscordTokenSuccess {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordTokenError {
  error: string;
  error_description?: string;
}

type DiscordTokenResponse = DiscordTokenSuccess | DiscordTokenError;

function isTokenSuccess(json: DiscordTokenResponse): json is DiscordTokenSuccess {
  return typeof (json as DiscordTokenSuccess).access_token === "string";
}

interface DiscordUserResponse {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}

async function fetchUserIdentity(accessToken: string): Promise<DiscordUserResponse> {
  const res = await fetch(`${discordApiBase()}/api/v10/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord users/@me lookup failed: HTTP ${res.status}`);
  }
  return (await res.json()) as DiscordUserResponse;
}

async function exchangeCode(code: string): Promise<DiscordTokenSuccess> {
  const params = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUrl(),
  });
  const res = await fetch(`${discordTokenBase()}/api/v10/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Discord token exchange failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as DiscordTokenResponse;
  if (!isTokenSuccess(json)) {
    throw new Error(`Discord OAuth error: ${json.error}`);
  }
  return json;
}

async function refreshAccessToken(refreshToken: string): Promise<DiscordTokenSuccess> {
  const params = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(`${discordTokenBase()}/api/v10/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Discord token refresh failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as DiscordTokenResponse;
  if (!isTokenSuccess(json)) {
    throw new Error(`Discord OAuth refresh error: ${json.error}`);
  }
  return json;
}

function tokensFromResponse(json: DiscordTokenSuccess): EncryptedTokens {
  return {
    accessTokenEncrypted: encryptToken(json.access_token),
    refreshTokenEncrypted: encryptToken(json.refresh_token),
    accessTokenExpiresAt:
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null,
    scopes: (json.scope ?? "").split(" ").filter(Boolean),
  };
}

function accountFromIdentity(
  identity: DiscordUserResponse,
): ProviderAccountInfo {
  const displayName =
    identity.global_name?.length
      ? identity.global_name
      : identity.username?.length
        ? identity.username
        : identity.email ?? identity.id;
  return {
    providerAccountId: identity.id,
    displayName,
    metadata: {
      userId: identity.id,
      username: identity.username ?? null,
      globalName: identity.global_name ?? null,
      discriminator: identity.discriminator ?? null,
      avatar: identity.avatar ?? null,
      email: identity.email ?? null,
    },
  };
}

export const discordOAuth: ProviderOAuth = {
  buildAuthUrl(state, scopes) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: "code",
      scope: scopes.join(" "),
      state,
      redirect_uri: getRedirectUrl(),
      // `prompt=consent` forces Discord to re-show the authorization
      // screen (and the inline server picker for the `bot` scope) on
      // every connect flow. Without it, Discord may silent-redirect
      // for repeat connects and skip the picker — leaving the bot
      // un-installed.
      prompt: "consent",
    });
    return `${discordAuthorizeBase()}/oauth2/authorize?${params.toString()}`;
  },

  async handleCallback(code) {
    const token = await exchangeCode(code);
    const identity = await fetchUserIdentity(token.access_token);
    return {
      tokens: tokensFromResponse(token),
      account: accountFromIdentity(identity),
    };
  },

  async refreshToken(refreshTokenPlaintext) {
    const token = await refreshAccessToken(refreshTokenPlaintext);
    return tokensFromResponse(token);
  },

  async revoke(_token) {
    // Discord provides POST /oauth2/token/revoke; deferred to a
    // follow-up alongside the proper bot-uninstall flow. Best-effort
    // revoke is safe to omit per the ProviderOAuth contract docstring.
  },
};
