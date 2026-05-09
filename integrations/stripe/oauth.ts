import {
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Stripe OAuth implementation.
 *
 * Slice 11 — V2's first body-auth refreshable OAuth provider, and the
 * first Stripe Connect (platform-vs-merchant) provider. See
 * `docs/slices/slice-11-stripe.md` §"OAuth model — refreshable +
 * body-auth + Stripe Connect (no PKCE)".
 *
 * Wire-format (per https://docs.stripe.com/connect/oauth-reference,
 * cross-checked against V1's `lib/integrations/oauthConfig.ts:530-543`):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth/authorize?client_id=…&response_type=code&scope=read_write&redirect_uri=…&state=…`
 *     **No PKCE** — Stripe Connect's authorize endpoint does not
 *     accept `code_challenge` / `code_challenge_method` parameters.
 *     `client_id` is the platform's `ca_xxx` Connect client id (NOT a
 *     secret-key-based test/live key). Scope is the single string
 *     `read_write` (Stripe Connect's binary scope model: `read_only`
 *     or `read_write`).
 *   - Token exchange: POST `${tokenBase}/oauth/token`
 *     - **Body-auth** — `client_secret` in the form-encoded body, NOT
 *       in an `Authorization: Basic` header (V1's
 *       `oauthConfig.ts:537` `authMethod: "body"`). This is the
 *       distinguishing wire-format feature for Stripe vs every other
 *       refreshable V2 provider (Airtable / Notion / Microsoft all use
 *       Basic auth; Google uses bearer-with-form-body).
 *     - Content-Type: `application/x-www-form-urlencoded`
 *     - Body: `grant_type=authorization_code&code=…&client_secret=…`
 *     Response: `{ access_token, refresh_token, scope, livemode,
 *       stripe_user_id, stripe_publishable_key, token_type }`. The
 *     access token is a Stripe API key bound to the connected
 *     merchant account (`stripe_user_id`); the response does NOT
 *     include `expires_in` because Stripe Connect access tokens are
 *     long-lived per current docs.
 *   - Refresh: POST `${tokenBase}/oauth/token`
 *     - Same body-auth + form body.
 *     - Body: `grant_type=refresh_token&refresh_token=…&client_secret=…`
 *     Response: same shape as authorization_code. `refresh_token` MAY
 *     be present (occasional defensive rotation) or absent (default
 *     behavior — Stripe Connect refresh tokens are stable). The
 *     per-provider `refreshToken()` PRESERVES the original refresh
 *     token when the response omits it; PERSISTS the new value when
 *     the response includes it. This contrasts with Airtable's
 *     mandatory rotation (Slice 10).
 *
 * Account id resolution — `stripe_user_id` from the token response:
 *   No follow-up `/v1/account` call. The token-exchange response
 *   directly carries `stripe_user_id` (the connected merchant
 *   account's `acct_xxx` id), which V2 uses as `providerAccountId`
 *   (matches manifest's `accountIdField: "stripeUserId"`). Fetching
 *   the merchant's display name would require an extra `GET
 *   /v1/account` call — V2 defers this to the connection-management
 *   UI rather than gate the OAuth callback on a third Stripe round
 *   trip. `displayName` falls back to `stripe_user_id` per V2
 *   convention (Airtable / Notion / Slack all fall back to a stable id
 *   when the provider doesn't surface a friendly name).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider. Stripe Connect provides
 * `POST /oauth/deauthorize` for revocation; landing the disconnect UX
 * slice will wire it up across all providers simultaneously.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - STRIPE_CLIENT_ID — Stripe Connect platform client id (`ca_xxx`).
 *   - STRIPE_CLIENT_SECRET — Stripe Connect platform secret key
 *     (`sk_xxx`). Used for OAuth token exchange + refresh (body-auth)
 *     AND for webhook-endpoint management on the platform account
 *     (Slice 11 Commit 4). Same secret, two purposes — Stripe
 *     Connect's model.
 *   - STRIPE_AUTHORIZE_BASE / STRIPE_TOKEN_BASE — e2e overrides
 *     (production never sets these; defaults point at real
 *     `connect.stripe.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function stripeAuthorizeBase(): string {
  return process.env.STRIPE_AUTHORIZE_BASE ?? "https://connect.stripe.com";
}

function stripeTokenBase(): string {
  return process.env.STRIPE_TOKEN_BASE ?? "https://connect.stripe.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/stripe/callback`;
}

function getClientId(): string {
  const id = process.env.STRIPE_CLIENT_ID;
  if (!id) throw new Error("STRIPE_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.STRIPE_CLIENT_SECRET;
  if (!secret) throw new Error("STRIPE_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface StripeTokenSuccess {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  livemode?: boolean;
  stripe_user_id?: string;
  stripe_publishable_key?: string;
  token_type?: string;
  /**
   * Stripe Connect access tokens don't carry expires_in per current
   * docs. V2 records the value if present (defensive against future
   * Stripe behavior changes), or null otherwise.
   */
  expires_in?: number;
}

interface StripeTokenError {
  error: string;
  error_description?: string;
}

async function readStripeErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as StripeTokenError;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

export const stripeOAuth: ProviderOAuth = {
  // No generatePkce — Stripe Connect does not accept PKCE parameters.

  buildAuthUrl(state, scopes, _pkce) {
    // _pkce is always null for Stripe (manifest omits generatePkce).
    // Scopes from the manifest is the source of truth — Stripe Connect
    // accepts a single scope value (`read_only` or `read_write`); V2
    // joins the manifest array with a space to be defensive against
    // future multi-value support, but the manifest declares exactly
    // `["read_write"]` so the resulting URL value is `read_write`.
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: "code",
      scope: scopes.join(" "),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${stripeAuthorizeBase()}/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // _pkce is always null for Stripe. Body-auth: client_secret rides
    // in the form body, NOT in an Authorization header. This is the
    // distinguishing wire-format feature vs every other refreshable
    // V2 provider.
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_secret: getClientSecret(),
    });
    const tokenRes = await fetch(`${stripeTokenBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Stripe token exchange failed: ${await readStripeErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as StripeTokenSuccess;
    if (!json.access_token) {
      throw new Error("Stripe token response missing access_token.");
    }
    if (!json.refresh_token) {
      // Stripe Connect always issues a refresh_token on the
      // authorization_code flow per current docs. Missing one means
      // the platform's OAuth configuration is wrong, the response
      // shape changed, or this isn't actually the authorization_code
      // flow. Fail loud — letting this through would silently break
      // the refresh path.
      throw new Error(
        "Stripe token response missing refresh_token — Stripe Connect's authorization_code flow always issues one.",
      );
    }
    if (!json.stripe_user_id) {
      // Stripe Connect's authorization_code response always carries
      // stripe_user_id (the connected merchant account id). Missing
      // it means the response shape changed or this is a non-Connect
      // OAuth flow.
      throw new Error(
        "Stripe token response missing stripe_user_id — required for accountIdField resolution.",
      );
    }

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    // Stripe Connect's `scope` field is a single value (`read_only` or
    // `read_write`). Wrap as a single-element array for the V2
    // EncryptedTokens contract. Defensive split-on-space tolerates
    // future multi-value behavior.
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId: json.stripe_user_id,
        // Stripe Connect's token response doesn't include the merchant's
        // display name. Fetching it would require an extra
        // GET /v1/account call — deferred to the
        // connection-management UI. Falls back to stripe_user_id per V2
        // convention (Airtable / Notion / Slack all fall back to a
        // stable id when the provider doesn't surface a friendly name).
        displayName: json.stripe_user_id,
        metadata: {
          stripeUserId: json.stripe_user_id,
          stripePublishableKey: json.stripe_publishable_key ?? null,
          livemode: typeof json.livemode === "boolean" ? json.livemode : null,
          scope: json.scope ?? null,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
      client_secret: getClientSecret(),
    });
    const res = await fetch(`${stripeTokenBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Stripe token refresh failed: ${await readStripeErrorCode(res)}`,
      );
    }
    const json = (await res.json()) as StripeTokenSuccess;
    if (!json.access_token) {
      throw new Error("Stripe refresh response missing access_token.");
    }

    // Stripe Connect's refresh-token contract: refresh tokens are
    // stable by default — the same value can be reused indefinitely.
    // The token endpoint MAY occasionally include a fresh
    // refresh_token in the response (defense-in-depth rotation); when
    // present, V2 PERSISTS the new value, when absent, V2 PRESERVES
    // the original.
    //
    // This contrasts with Airtable's mandatory rotation (Slice 10),
    // where a missing refresh_token in the response is a contract
    // violation and the per-provider refreshToken() throws.
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
    // provider's revoke pattern. Stripe Connect provides
    // POST /oauth/deauthorize for revocation; the disconnect UX slice
    // will wire it up across all providers simultaneously.
  },
};
