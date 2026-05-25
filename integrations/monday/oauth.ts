import {
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Monday.com OAuth implementation — Slice 3.MONDAY-2.
 *
 * Wire-format derived from V1's
 * [`oauthConfig.ts:591-605`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L591)
 * + V1's [`provider-registry.ts:739-775`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L739)
 * and confirmed against Monday's published OAuth docs
 * (https://developer.monday.com/api-reference/docs/authentication).
 *
 * Shape mirrors V2's HubSpot OAuth (Slice 13) — body-auth, no PKCE,
 * `redirect_uri` echoed on refresh, refresh-token preservation policy.
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth2/authorize?client_id=…&redirect_uri=…&scope=<space-joined>&state=…`
 *     **No PKCE** — V1's Monday config sets `requiresPkce: false`. Monday's
 *     OAuth doesn't accept PKCE params; sending them produces no benefit
 *     and risks future-portal validation flagging the integration.
 *   - Token exchange: POST `${tokenBase}/oauth2/token`
 *     - **Body-auth** — `client_id` + `client_secret` in the
 *       form-encoded body. V1's `authMethod: "body"` +
 *       `refreshRequiresClientAuth: true`.
 *     - Content-Type: `application/x-www-form-urlencoded`.
 *     - Body: `grant_type=authorization_code&client_id=…&client_secret=…&redirect_uri=…&code=…`.
 *     Response: `{ access_token, refresh_token, expires_in?, token_type:
 *       "bearer", scope? }`. Monday access tokens carry a long expiry
 *       (currently ~30d per Monday docs); `expires_in` is forwarded into
 *       `accessTokenExpiresAt` when present so the health engine can
 *       proactively refresh.
 *   - Refresh: POST `${tokenBase}/oauth2/token`
 *     - Same body-auth + form body shape.
 *     - Body: `grant_type=refresh_token&client_id=…&client_secret=…&redirect_uri=…&refresh_token=…`
 *     - Per V1's `sendRedirectUriWithRefresh: true`, Monday's refresh
 *       endpoint accepts `redirect_uri` (Monday docs don't strictly
 *       require it but V1 always sends it and the production traffic
 *       confirms it's accepted).
 *     - Refresh-token PRESERVATION (not rotation): V1's
 *       `refreshTokenExpirationSupported: false`. When the refresh
 *       response includes a fresh `refresh_token`, persist it; when
 *       absent, preserve the original. Same contract as HubSpot / Stripe.
 *       Contrasts with Airtable's mandatory rotation.
 *
 * Account id resolution — GraphQL `{ me { id name email } }`:
 *   The token-exchange response does NOT include user identity, so the
 *   callback follows up with a GraphQL POST against
 *   `https://api.monday.com/v2` using the freshly-issued access token.
 *   The `email` field is used as `providerAccountId` (matches manifest's
 *   `accountIdField: "email"`); falls back to the numeric `id` when
 *   `email` is absent (rare — V1 never observed it). `displayName`
 *   prefers `name` over `email` for readability in the UI.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider's revoke pattern.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - MONDAY_CLIENT_ID / MONDAY_CLIENT_SECRET — OAuth credentials from
 *     the Monday developer-portal app settings.
 *   - MONDAY_AUTHORIZE_BASE / MONDAY_TOKEN_BASE / MONDAY_API_BASE —
 *     e2e overrides (production never sets these; defaults point at
 *     `auth.monday.com` + `api.monday.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function mondayAuthorizeBase(): string {
  return process.env.MONDAY_AUTHORIZE_BASE ?? "https://auth.monday.com";
}

function mondayTokenBase(): string {
  return process.env.MONDAY_TOKEN_BASE ?? "https://auth.monday.com";
}

function mondayApiBase(): string {
  return process.env.MONDAY_API_BASE ?? "https://api.monday.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/monday/callback`;
}

function getClientId(): string {
  const id = process.env.MONDAY_CLIENT_ID;
  if (!id) throw new Error("MONDAY_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.MONDAY_CLIENT_SECRET;
  if (!secret) throw new Error("MONDAY_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface MondayTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface MondayTokenError {
  error?: string;
  error_description?: string;
}

interface MondayMeResponse {
  data?: {
    me?: {
      id?: string | number;
      name?: string | null;
      email?: string | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

async function readMondayErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as MondayTokenError;
    if (parsed.error_description) return parsed.error_description;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

export const mondayOAuth: ProviderOAuth = {
  // No generatePkce — Monday's authorize endpoint doesn't accept
  // PKCE parameters. V1's config explicitly set `requiresPkce: false`.

  buildAuthUrl(state, scopes, _pkce) {
    // _pkce is always null for Monday. Scopes are space-separated
    // (matches Monday OAuth docs + V1's wire format).
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      scope: scopes.join(" "),
      state,
    });
    return `${mondayAuthorizeBase()}/oauth2/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // _pkce is always null for Monday. Body-auth: client_id +
    // client_secret in the form body, mirroring HubSpot's shape.
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
      code,
    });
    const tokenRes = await fetch(`${mondayTokenBase()}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Monday token exchange failed: ${await readMondayErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as MondayTokenSuccess;
    if (!json.access_token) {
      throw new Error("Monday token response missing access_token.");
    }
    if (!json.refresh_token) {
      // Monday's authorization_code flow always issues a refresh_token
      // when the app is configured for it. Missing one means the app's
      // OAuth configuration is wrong; fail loud rather than silently
      // breaking the refresh path.
      throw new Error(
        "Monday token response missing refresh_token — Monday's authorization_code flow issues one when refresh is enabled.",
      );
    }

    // Resolve the connected account via GraphQL { me { id name email } }.
    // Uses the freshly-issued access token; the `Bearer` prefix matches
    // every action-handler call site. V1 sends the raw token in the
    // provider-registry path but the action paths use Bearer; the
    // server accepts both — we standardize on Bearer.
    const meRes = await fetch(`${mondayApiBase()}/v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${json.access_token}`,
        "Content-Type": "application/json",
        "API-Version": "2024-01",
      },
      body: JSON.stringify({ query: "{ me { id name email } }" }),
    });
    if (!meRes.ok) {
      throw new Error(
        `Monday { me } lookup failed: HTTP ${meRes.status}`,
      );
    }
    const meJson = (await meRes.json()) as MondayMeResponse;
    if (meJson.errors && meJson.errors.length > 0) {
      const messages = meJson.errors
        .map((e) => e.message ?? "unknown")
        .join(", ");
      throw new Error(`Monday { me } returned GraphQL errors: ${messages}`);
    }
    const me = meJson.data?.me;
    if (!me || me.id === undefined || me.id === null) {
      throw new Error("Monday { me } response missing id.");
    }
    const meId = String(me.id);
    const email = me.email ?? null;
    // providerAccountId — prefer email per manifest's accountIdField,
    // fall back to the numeric id when email is absent.
    const providerAccountId = email ?? meId;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    // Monday returns scope as space-separated string (per Monday OAuth
    // docs); split + filter empty.
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId,
        // displayName preference: name (most readable) → email → id.
        displayName: me.name ?? email ?? meId,
        metadata: {
          mondayUserId: meId,
          email,
          name: me.name ?? null,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      // V1's `sendRedirectUriWithRefresh: true` — Monday accepts this
      // on the refresh endpoint even though the docs make it optional.
      redirect_uri: getRedirectUrl(),
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${mondayTokenBase()}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Monday token refresh failed: ${await readMondayErrorCode(res)}`,
      );
    }
    const json = (await res.json()) as MondayTokenSuccess;
    if (!json.access_token) {
      throw new Error("Monday refresh response missing access_token.");
    }

    // Refresh-token PRESERVATION (V1's
    // `refreshTokenExpirationSupported: false`). When the response
    // includes a fresh `refresh_token`, V2 persists the new value;
    // when absent, V2 preserves the original. Same contract as HubSpot
    // (Slice 13) and Stripe (Slice 11).
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
    // provider's revoke pattern. Monday does not currently expose a
    // documented token revocation endpoint; the disconnect UX slice
    // will wire up uniform revocation policy across providers.
  },
};
