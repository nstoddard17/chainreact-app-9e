import {
  type ProviderOAuth,
  type EncryptedTokens,
  RefreshAuthRequiredError,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Slack OAuth implementation.
 *
 * Per docs/rules/oauth-dispatcher.md:
 *   - Slack's default v2 flow does NOT return refresh tokens. Token rotation
 *     is opt-in per Slack app config — and once a Slack app enables it, Slack
 *     does not allow turning it off: every token exchange then returns a
 *     short-lived access token (`expires_in` ≈ 12 h) plus a single-use
 *     rotating `refresh_token`.
 *   - SLACK-TOKEN-ROTATION-1: this module handles BOTH shapes. When Slack
 *     returns rotation fields they are persisted (encrypted refresh token +
 *     epoch expiry) so the proactive refresh sweep keeps the token alive;
 *     when Slack omits them (rotation off) the stored nulls mean
 *     "non-expiring", exactly as before. Dropping the rotation fields — the
 *     pre-slice behavior — stored a 12-hour token as if permanent, which
 *     produced the recurring "Slack needs to be reconnected" loop.
 *   - handleCallback exchanges the authorization code at oauth.v2.access,
 *     encrypts the token material, and returns tokens + account info for the
 *     repository to persist. refreshToken() re-calls oauth.v2.access with
 *     grant_type=refresh_token and maps dead-grant codes to
 *     RefreshAuthRequiredError (dispatcher marks needs-reconnect + notifies).
 */

/**
 * Base URLs are env-overridable for e2e testing only. Production sets
 * neither variable; defaults point at real Slack. The override is opt-in
 * (must be explicitly set), can't be reached accidentally, and lives at
 * the network boundary — V2's signed-state + token-encryption + dispatcher
 * paths all run unchanged regardless.
 */
function slackApiBase(): string {
  return process.env.SLACK_API_BASE ?? "https://slack.com";
}

function slackAuthorizeBase(): string {
  return process.env.SLACK_AUTHORIZE_BASE ?? "https://slack.com";
}

interface SlackOAuthV2Success {
  ok: true;
  access_token: string;
  scope?: string;
  team?: { id?: string; name?: string };
  bot_user_id?: string;
  app_id?: string;
  authed_user?: { id: string };
  /**
   * Rotation-only fields — present when the Slack app has token rotation
   * enabled. `expires_in` is seconds until the access token dies (~43200);
   * `refresh_token` is single-use and rotates on every refresh.
   */
  refresh_token?: string;
  expires_in?: number;
}

interface SlackOAuthV2Error {
  ok: false;
  error: string;
}

type SlackOAuthV2Response = SlackOAuthV2Success | SlackOAuthV2Error;

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/slack/callback`;
}

function getClientId(): string {
  const id = process.env.SLACK_CLIENT_ID;
  if (!id) throw new Error("SLACK_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.SLACK_CLIENT_SECRET;
  if (!secret) throw new Error("SLACK_CLIENT_SECRET env var is not set.");
  return secret;
}

/**
 * Refresh-endpoint error codes that PROVE the refresh grant itself is dead —
 * only user re-authorization recovers. Mapped to RefreshAuthRequiredError so
 * the dispatcher sets needs_reconnect_at + notifies once (V2-READY-32).
 * Config/transient codes (invalid_client_id, bad_client_secret,
 * invalid_grant_type, ratelimited, internal_error, …) stay generic errors:
 * they must never flip a healthy connection to "reconnect needed".
 */
const SLACK_REFRESH_AUTH_DEAD_CODES: ReadonlySet<string> = new Set([
  "invalid_refresh_token",
  "token_revoked",
  "account_inactive",
  "invalid_auth",
]);

/**
 * Map an oauth.v2.access success payload (code exchange OR refresh) to the
 * dispatcher's EncryptedTokens shape. Rotation fields are optional in both
 * flows; `priorRefreshToken` preserves the existing grant when a refresh
 * response omits `refresh_token` (defensive — Slack documents rotation, but
 * a preserved grant is strictly safer than wiping it).
 */
function tokensFromOAuthResponse(
  json: SlackOAuthV2Success,
  priorRefreshToken?: string,
): EncryptedTokens {
  const refreshTokenPlain = json.refresh_token ?? priorRefreshToken ?? null;
  return {
    accessTokenEncrypted: encryptToken(json.access_token),
    refreshTokenEncrypted:
      refreshTokenPlain !== null ? encryptToken(refreshTokenPlain) : null,
    accessTokenExpiresAt:
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null,
    scopes: (json.scope ?? "").split(",").filter(Boolean),
  };
}

export const slackOAuth: ProviderOAuth = {
  buildAuthUrl(state, scopes) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      scope: scopes.join(","),
      state,
      redirect_uri: getRedirectUrl(),
    });
    return `${slackAuthorizeBase()}/oauth/v2/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUrl(),
    });
    const res = await fetch(`${slackApiBase()}/api/oauth.v2.access`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Slack token exchange failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as SlackOAuthV2Response;
    if (!json.ok) {
      throw new Error(`Slack OAuth error: ${json.error}`);
    }
    if (!json.access_token || !json.team?.id) {
      throw new Error("Slack OAuth response missing access_token or team.id");
    }

    return {
      tokens: tokensFromOAuthResponse(json),
      account: {
        providerAccountId: json.team.id,
        displayName: json.team.name ?? null,
        metadata: {
          teamId: json.team.id,
          teamName: json.team.name ?? null,
          botUserId: json.bot_user_id ?? null,
          appId: json.app_id ?? null,
          authedUserId: json.authed_user?.id ?? null,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${slackApiBase()}/api/oauth.v2.access`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    // NO-LEAK: thrown messages carry only an HTTP status or Slack's logical
    // error code — never the refresh token, response body, or team identity.
    if (!res.ok) {
      throw new Error(`Slack token refresh failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as SlackOAuthV2Response;
    if (!json.ok) {
      if (SLACK_REFRESH_AUTH_DEAD_CODES.has(json.error)) {
        throw new RefreshAuthRequiredError("slack", json.error);
      }
      throw new Error(`Slack token refresh failed: ${json.error}`);
    }
    if (!json.access_token) {
      throw new Error("Slack refresh response missing access_token.");
    }
    return tokensFromOAuthResponse(json, refreshTokenPlaintext);
  },

  async revoke(_token) {
    // Slack provides https://slack.com/api/auth.revoke. Implementation deferred to Slice 1E
    // when the integrations repository + token decryption are wired in.
  },
};
