import {
  RefreshNotSupportedError,
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { GRAPH_API_VERSION } from "@/integrations/_shared/facebook/version";
import { meGet } from "@/integrations/_shared/facebook/api/meGet";
import { permissionsGet } from "@/integrations/_shared/facebook/api/permissionsGet";

/**
 * Facebook OAuth 2.0 implementation — Slice 3.FACEBOOK-2.
 *
 * Authorization-code flow, NOT refreshable (Facebook returns a long-lived
 * user token, not a refresh token — D-FB5):
 *   - Authorize: GET `${authorizeBase}/${version}/dialog/oauth?
 *     client_id=…&redirect_uri=…&response_type=code&scope=<comma>&state=…`.
 *   - Code exchange (GET): `${graphBase}/${version}/oauth/access_token?
 *     client_id=…&redirect_uri=…&client_secret=…&code=…` → a SHORT-lived
 *     user token (~1–2h).
 *   - Long-lived exchange (GET): same endpoint with
 *     `grant_type=fb_exchange_token&fb_exchange_token=<short>` → a ~60-day
 *     user token. THIS is what we persist (D-FB5).
 *   - Account identity: `GET /me?fields=id,name,email`. `providerAccountId`
 *     is the app-scoped user `id`.
 *   - Granted scopes: `GET /me/permissions` (the token exchange response
 *     carries no `scope` field).
 *
 * Page access tokens are NOT obtained here — handlers derive them at
 * runtime from this user token via `getPageAccessToken` (never persisted).
 *
 * `refreshToken()` throws `RefreshNotSupportedError` — there is no refresh
 * token. A 401 after the ~60-day window surfaces as `action_required`
 * (reconnect) through refresh-and-retry (Slack's non-refreshable pattern).
 *
 * Env: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. E2e overrides
 * (production never sets these): `FACEBOOK_AUTHORIZE_BASE`,
 * `FACEBOOK_GRAPH_BASE` (the latter is read by the shared API layer used
 * for the /me + /me/permissions lookups).
 */

function authorizeBase(): string {
  return process.env.FACEBOOK_AUTHORIZE_BASE ?? "https://www.facebook.com";
}

function graphBase(): string {
  return process.env.FACEBOOK_GRAPH_BASE ?? "https://graph.facebook.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/facebook/callback`;
}

function getClientId(): string {
  const id = process.env.FACEBOOK_CLIENT_ID;
  if (!id) throw new Error("FACEBOOK_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!secret) throw new Error("FACEBOOK_CLIENT_SECRET env var is not set.");
  return secret;
}

interface FacebookTokenSuccess {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface FacebookTokenError {
  error?: { message?: string; type?: string; code?: number };
}

async function readFacebookTokenError(res: Response): Promise<string> {
  // Sanitized: surface only Graph's machine-readable error fields, never
  // the raw body (which can echo request context / the code).
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as FacebookTokenError;
    const e = parsed.error;
    if (e?.type || typeof e?.code === "number") {
      return `${e?.type ?? "OAuthException"}${typeof e?.code === "number" ? `/code=${e.code}` : ""}`;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

async function exchange(url: string, label: string): Promise<FacebookTokenSuccess> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Facebook ${label} failed: ${await readFacebookTokenError(res)}`);
  }
  const json = (await res.json()) as FacebookTokenSuccess;
  if (!json.access_token) {
    throw new Error(`Facebook ${label} response missing access_token.`);
  }
  return json;
}

export const facebookOAuth: ProviderOAuth = {
  // No generatePkce — Facebook confidential client (web app secret).

  buildAuthUrl(state, scopes, _pkce) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      response_type: "code",
      // Facebook accepts a comma-separated permission list.
      scope: scopes.join(","),
      state,
    });
    return `${authorizeBase()}/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // 1. Code → short-lived user token.
    const shortParams = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      client_secret: getClientSecret(),
      code,
    });
    const shortTok = await exchange(
      `${graphBase()}/${GRAPH_API_VERSION}/oauth/access_token?${shortParams.toString()}`,
      "code exchange",
    );

    // 2. Short → long-lived (~60d) user token. This is what we persist.
    const longParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      fb_exchange_token: shortTok.access_token,
    });
    const longTok = await exchange(
      `${graphBase()}/${GRAPH_API_VERSION}/oauth/access_token?${longParams.toString()}`,
      "long-lived token exchange",
    );
    const accessToken = longTok.access_token;

    // 3. Account identity.
    let me: Awaited<ReturnType<typeof meGet>>;
    try {
      me = await meGet({ accessToken });
    } catch (err) {
      throw new Error(`Facebook account lookup failed: ${(err as Error).message}`);
    }
    if (!me.id) throw new Error("Facebook /me returned no id.");

    // 4. Granted permissions (the token exchange carries no scope field).
    let scopesGranted: string[] = [];
    try {
      const perms = await permissionsGet({ accessToken });
      scopesGranted = perms.data
        .filter((p) => p.status === "granted")
        .map((p) => p.permission);
    } catch {
      // Non-fatal — scope capture is informational; the manifest is the
      // source of truth for required scopes. Persist an empty set rather
      // than failing the whole connect.
      scopesGranted = [];
    }

    const expiresAt =
      typeof longTok.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + longTok.expires_in
        : null;
    const displayName = me.name ?? me.email ?? me.id;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(accessToken),
        // Facebook issues NO refresh token (long-lived access token model).
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId: me.id,
        displayName,
        metadata: {
          facebookUserId: me.id,
          name: me.name ?? null,
          email: me.email ?? null,
        },
      },
    };
  },

  async refreshToken(_refreshToken): Promise<EncryptedTokens> {
    // Facebook has no refresh token (D-FB5). An expired ~60-day user token
    // requires the user to reconnect — refresh-and-retry maps this to an
    // action_required signal.
    throw new RefreshNotSupportedError("facebook");
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — uniform across V2 providers.
    // Facebook exposes DELETE /{user-id}/permissions; the disconnect slice
    // will wire revocation policy consistently.
  },
};
