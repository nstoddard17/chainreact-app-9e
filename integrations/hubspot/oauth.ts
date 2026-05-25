import {
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { resolveHubSpotAccount } from "@/integrations/_shared/hubspot/api/me";

/**
 * HubSpot OAuth implementation.
 *
 * Slice 13 — V2's first CRM provider; closes V1's missing-PKCE-dead-code
 * + pkce_flow-row-orphan gap by NOT generating dead PKCE artifacts.
 * See `docs/slices/slice-13-hubspot.md` §"Confirmed scope decisions §2".
 *
 * Wire-format (per https://developers.hubspot.com/docs/api/oauth/oauth-quickstart-guide,
 * cross-checked against V1's
 * [`oauthConfig.ts:386-404`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L386)
 * + [`provider-registry.ts:548-604`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L548)):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth/authorize?client_id=…&redirect_uri=…&scope=<space-joined>&state=…`
 *     **No PKCE** — HubSpot's authorize endpoint does not require or
 *     accept `code_challenge` / `code_challenge_method` parameters for
 *     standard Public Apps. V1 generated a `code_verifier` and wrote
 *     it to a `pkce_flow` table but never sent `code_challenge` in the
 *     URL — dead code; V2 does not reproduce.
 *   - Token exchange: POST `${tokenBase}/oauth/v1/token`
 *     - **Body-auth** — `client_id` + `client_secret` in the
 *       form-encoded body (V1's `authMethod: "body"` at
 *       [`oauthConfig.ts:394`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L394)).
 *       NO `Authorization: Basic` header.
 *     - Content-Type: `application/x-www-form-urlencoded`.
 *     - Body: `grant_type=authorization_code&client_id=…&client_secret=…&redirect_uri=…&code=…`.
 *     Response: `{ access_token, refresh_token, expires_in, token_type:
 *       "bearer" }`. Access tokens carry `expires_in` (~21600 = 6h);
 *     refresh tokens don't carry an expiry per HubSpot docs.
 *   - Refresh: POST `${tokenBase}/oauth/v1/token`
 *     - Same body-auth + form body shape.
 *     - Body: `grant_type=refresh_token&client_id=…&client_secret=…&redirect_uri=…&refresh_token=…`
 *     - Per V1's [`oauthConfig.ts:397`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L397)
 *       `sendRedirectUriWithRefresh: true`, HubSpot's refresh endpoint
 *       requires `redirect_uri` on the refresh body.
 *     - Refresh-token PRESERVATION (NOT rotation): per current HubSpot
 *       docs, refresh tokens are stable by default — the same token is
 *       reusable indefinitely. The token endpoint MAY occasionally
 *       include a fresh `refresh_token` in the response; when present,
 *       V2 PERSISTS the new value, when absent, V2 PRESERVES the
 *       original. Same shape as V2's Stripe (Slice 11). Contrasts with
 *       Airtable's mandatory rotation (Slice 10).
 *
 * Account id resolution — `_shared/hubspot/api/me.ts::resolveHubSpotAccount`:
 *   The token-exchange response does NOT include the hub id. The
 *   per-provider OAuth makes a follow-up call via the dual-endpoint
 *   helper:
 *     - PRIMARY: `GET /oauth/v1/access-tokens/{accessToken}` (no auth
 *       header — token in path).
 *     - FALLBACK: `GET /integrations/v1/me` (Authorization: Bearer).
 *   V2 uses the resolved `hubId` (string-cast of numeric portal id) as
 *   `providerAccountId`. Mirrors V1
 *   [`provider-registry.ts:563-602`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L563).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider. HubSpot does provide a token revocation
 * endpoint; landing the disconnect UX slice will wire it up across all
 * providers simultaneously.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET — OAuth credentials
 *     from the HubSpot developer-portal app settings.
 *   - HUBSPOT_AUTHORIZE_BASE / HUBSPOT_TOKEN_BASE — e2e overrides
 *     (production never sets these; defaults point at real
 *     `app.hubspot.com` + `api.hubapi.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function hubspotAuthorizeBase(): string {
  return process.env.HUBSPOT_AUTHORIZE_BASE ?? "https://app.hubspot.com";
}

function hubspotTokenBase(): string {
  return process.env.HUBSPOT_TOKEN_BASE ?? "https://api.hubapi.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/hubspot/callback`;
}

function getClientId(): string {
  const id = process.env.HUBSPOT_CLIENT_ID;
  if (!id) throw new Error("HUBSPOT_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!secret) throw new Error("HUBSPOT_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface HubSpotTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface HubSpotTokenError {
  status?: string;
  message?: string;
  errorType?: string;
}

async function readHubSpotErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as HubSpotTokenError;
    if (parsed.message) return parsed.message;
    if (parsed.errorType) return parsed.errorType;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

export const hubspotOAuth: ProviderOAuth = {
  // No generatePkce — HubSpot's authorize endpoint doesn't require or
  // accept PKCE parameters. Anti-test: V1 generated a code_verifier
  // but never sent code_challenge — dead code; V2 doesn't reproduce.

  buildAuthUrl(state, scopes, _pkce) {
    // _pkce is always null for HubSpot. Scopes are space-separated
    // (matches V1's `getHubSpotScopeString().join(" ")`).
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      scope: scopes.join(" "),
      state,
    });
    return `${hubspotAuthorizeBase()}/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // _pkce is always null for HubSpot. Body-auth: client_id +
    // client_secret ride in the form body, NOT in an Authorization
    // header. Mirrors V2's Stripe shape (Slice 11) on the body-auth
    // dimension; differs from Airtable / Notion / Microsoft (Basic
    // auth) and Google (no client auth — bearer with form-body).
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
      code,
    });
    const tokenRes = await fetch(`${hubspotTokenBase()}/oauth/v1/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `HubSpot token exchange failed: ${await readHubSpotErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as HubSpotTokenSuccess;
    if (!json.access_token) {
      throw new Error("HubSpot token response missing access_token.");
    }
    if (!json.refresh_token) {
      // HubSpot's authorization_code flow always issues a
      // refresh_token. Missing one means the app's OAuth configuration
      // is wrong, the response shape changed, or this isn't the
      // authorization_code flow. Fail loud — letting this through
      // would silently break the refresh path.
      throw new Error(
        "HubSpot token response missing refresh_token — HubSpot's authorization_code flow always issues one.",
      );
    }

    // Resolve the connected portal info via the dual-endpoint helper.
    const account = await resolveHubSpotAccount(json.access_token);

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    // HubSpot returns scope as space-separated string per current
    // docs. V1's `provider-registry.ts:558` splits on space too.
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId: account.hubId,
        // displayName preference: hub_domain when present, else email,
        // else hubId. Hub domain is the most user-recognizable label
        // (e.g. "yourcompany-3344-prod") and matches what HubSpot's
        // own UI shows.
        displayName: account.hubDomain ?? account.user ?? account.hubId,
        metadata: {
          hubId: account.hubId,
          hubDomain: account.hubDomain,
          user: account.user,
          userId: account.userId,
          accountResolutionSource: account.source,
          scopesGranted,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      // Per V1's `sendRedirectUriWithRefresh: true`, HubSpot's refresh
      // endpoint requires redirect_uri.
      redirect_uri: getRedirectUrl(),
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${hubspotTokenBase()}/oauth/v1/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `HubSpot token refresh failed: ${await readHubSpotErrorCode(res)}`,
      );
    }
    const json = (await res.json()) as HubSpotTokenSuccess;
    if (!json.access_token) {
      throw new Error("HubSpot refresh response missing access_token.");
    }

    // Refresh-token PRESERVATION: HubSpot refresh tokens are stable
    // by default. When the response includes a fresh `refresh_token`,
    // V2 persists the new value; when absent, V2 preserves the
    // original. Same contract as V2's Stripe (Slice 11). Contrasts
    // with Airtable's mandatory rotation (Slice 10), which throws on
    // a missing refresh_token in the refresh response.
    const refreshTokenToPersist = json.refresh_token ?? refreshTokenPlaintext;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      refreshTokenEncrypted: encryptToken(refreshTokenToPersist),
      accessTokenExpiresAt: expiresAt,
      scopes: scopesGranted,
    };
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider's revoke pattern. HubSpot provides a token revocation
    // endpoint at /oauth/v1/refresh-tokens/{refreshToken}; the
    // disconnect UX slice will wire it up across all providers
    // simultaneously.
  },
};
