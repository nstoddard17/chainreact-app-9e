import { createHash, randomBytes } from "node:crypto";
import {
  type EncryptedTokens,
  type PkceGeneration,
  type ProviderOAuth,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Airtable OAuth implementation.
 *
 * Slice 10 — V2's first non-Google / non-Microsoft REFRESHABLE OAuth
 * provider, and the first non-G/non-MS PKCE provider. See
 * `docs/slices/slice-10-airtable.md` §"OAuth model — refreshable +
 * PKCE + rotated tokens".
 *
 * Wire-format (per https://airtable.com/developers/web/api/oauth-reference,
 * cross-checked against V1's `lib/integrations/oauthConfig.ts:405-419`
 * + `lib/integrations/tokenRefreshService.ts:200-280,389-394`):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth2/v1/authorize?client_id=…&redirect_uri=…&response_type=code&scope=<space-joined>&state=…&code_challenge=…&code_challenge_method=S256`
 *     PKCE is MANDATORY per current Airtable docs — `code_challenge`
 *     and `code_challenge_method` are required on the authorize URL.
 *     Scopes are space-separated (matches V1's wire format).
 *   - Token exchange: POST `${tokenBase}/oauth2/v1/token`
 *       - Authorization: `Basic ${base64(client_id:client_secret)}`
 *       - Content-Type: `application/x-www-form-urlencoded`
 *       - Body: `grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…`
 *     Response: `{ access_token, refresh_token, token_type: "Bearer",
 *       expires_in, scope, refresh_expires_in? }`.
 *   - Refresh: POST `${tokenBase}/oauth2/v1/token`
 *       - Same Basic auth + form body.
 *       - Body: `grant_type=refresh_token&refresh_token=…&redirect_uri=…`
 *       - Per V1 `tokenRefreshService.ts:252-258`, Airtable requires
 *         `redirect_uri` on the refresh body (V1's
 *         `sendRedirectUriWithRefresh: true`). Refresh-token ROTATION:
 *         each successful refresh returns a NEW refresh_token; the
 *         old one is invalidated. V2's `refreshToken()` enforces the
 *         rotation invariant — throws if the response is missing the
 *         new refresh_token.
 *
 * Token model — 60-min access TTL + 60-day refresh idle window:
 *   `accessTokenExpiresAt` is set to `now + expires_in` so V2's health
 *   engine can proactively refresh. Refresh-token rotation extends
 *   the 60-day idle clock; integrations used regularly never expire.
 *   After 60 days idle, the refresh fails — V2 surfaces
 *   `IntegrationActionRequiredError(reason: "refresh_failed")` via
 *   `services/oauth/refreshAndRetry.ts`.
 *
 * Account id resolution — `/v0/meta/whoami`:
 *   The token-exchange response does NOT include the user id, so the
 *   per-provider OAuth makes a follow-up call to
 *   `${apiBase}/v0/meta/whoami` with the new access token. Response:
 *   `{ id, scopes: [...], email? }`. V2 uses `id` as the
 *   `providerAccountId` (matches manifest's `accountIdField: "userId"`).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - AIRTABLE_CLIENT_ID / AIRTABLE_CLIENT_SECRET — OAuth credentials
 *     from the Airtable developer portal.
 *   - AIRTABLE_AUTHORIZE_BASE / AIRTABLE_TOKEN_BASE / AIRTABLE_API_BASE
 *     — e2e overrides (production never sets these; defaults point at
 *     real Airtable). Authorize + token endpoints live at
 *     `airtable.com`; the REST API (whoami, records, schema, webhooks)
 *     lives at `api.airtable.com`.
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function airtableAuthorizeBase(): string {
  return process.env.AIRTABLE_AUTHORIZE_BASE ?? "https://airtable.com";
}

function airtableTokenBase(): string {
  return process.env.AIRTABLE_TOKEN_BASE ?? "https://airtable.com";
}

function airtableApiBase(): string {
  return process.env.AIRTABLE_API_BASE ?? "https://api.airtable.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/airtable/callback`;
}

function getClientId(): string {
  const id = process.env.AIRTABLE_CLIENT_ID;
  if (!id) throw new Error("AIRTABLE_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.AIRTABLE_CLIENT_SECRET;
  if (!secret) throw new Error("AIRTABLE_CLIENT_SECRET env var is not set.");
  return secret;
}

function basicAuthHeader(): string {
  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface AirtableTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  refresh_expires_in?: number;
}

interface AirtableTokenError {
  error: string;
  error_description?: string;
}

interface AirtableWhoAmIResponse {
  id: string;
  email?: string | null;
  scopes?: string[];
}

async function readAirtableErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as AirtableTokenError;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

// ─── PKCE ──────────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43 base64url chars (RFC 7636 §4.1 minimum). Method
 * is hardcoded S256, matching the shared Google + Microsoft PKCE
 * generators. Airtable's PKCE shape is identical to Google/Microsoft —
 * no provider-specific quirks.
 */
function generateAirtablePkce(): PkceGeneration {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

export const airtableOAuth: ProviderOAuth = {
  generatePkce: generateAirtablePkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      // Should be impossible — the dispatcher always passes PKCE for
      // Airtable because generatePkce returned a non-null value.
      // Defensive throw so a future refactor that breaks the
      // connect-time threading surfaces immediately. Mirrors
      // microsoft-onedrive / gmail.
      throw new Error(
        "airtableOAuth.buildAuthUrl: PKCE challenge is required for Airtable. The dispatcher should have generated one via generatePkce().",
      );
    }
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });
    return `${airtableAuthorizeBase()}/oauth2/v1/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      // The state row was missing the code_verifier — either the
      // connect path didn't issue PKCE (impossible if Airtable is the
      // only caller of this module), or the row was tampered with, or
      // consumeState's defensive AND returned null on a half-populated
      // row. Refuse to attempt the token exchange — Airtable would
      // reject it anyway. Mirrors microsoft-onedrive / gmail.
      throw new Error(
        "airtableOAuth.handleCallback: PKCE code_verifier is required for Airtable; the consumed oauth_states row had none.",
      );
    }

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUrl(),
      code_verifier: pkce.codeVerifier,
    });
    const tokenRes = await fetch(`${airtableTokenBase()}/oauth2/v1/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Airtable token exchange failed: ${await readAirtableErrorCode(tokenRes)}`,
      );
    }
    const tokenJson = (await tokenRes.json()) as AirtableTokenSuccess;
    if (!tokenJson.access_token) {
      throw new Error("Airtable token response missing access_token.");
    }
    if (!tokenJson.refresh_token) {
      // Airtable always issues a refresh token on the
      // authorization_code flow. Missing one means the app's OAuth
      // configuration is wrong (e.g., refresh-token issuance disabled
      // in the Airtable developer portal). Fail loud — letting this
      // through would silently break the refresh path.
      throw new Error(
        "Airtable token response missing refresh_token — Airtable's OAuth flow always issues one on authorization_code.",
      );
    }

    // Resolve the connected account's user id via /v0/meta/whoami.
    // Uses the freshly-issued access token; no scopes beyond what we
    // already requested.
    const whoamiRes = await fetch(`${airtableApiBase()}/v0/meta/whoami`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!whoamiRes.ok) {
      throw new Error(
        `Airtable /v0/meta/whoami failed: HTTP ${whoamiRes.status}`,
      );
    }
    const whoami = (await whoamiRes.json()) as AirtableWhoAmIResponse;
    if (!whoami.id) {
      throw new Error(
        "Airtable /v0/meta/whoami response missing id.",
      );
    }

    const expiresAt =
      typeof tokenJson.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + tokenJson.expires_in
        : null;
    const scopesGranted = (tokenJson.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokenJson.access_token),
        refreshTokenEncrypted: encryptToken(tokenJson.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId: whoami.id,
        // Email is the most user-recognizable label when present;
        // falls back to the userId when whoami omits email (some
        // Airtable accounts don't expose email without
        // `user.email:read` scope, which Slice 10 doesn't request).
        displayName: whoami.email ?? whoami.id,
        metadata: {
          userId: whoami.id,
          email: whoami.email ?? null,
          scopesGranted: whoami.scopes ?? [],
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
      // Per V1 `tokenRefreshService.ts:252-258`, Airtable requires
      // redirect_uri on the refresh body. V1's
      // `sendRedirectUriWithRefresh: true` flag.
      redirect_uri: getRedirectUrl(),
    });
    const res = await fetch(`${airtableTokenBase()}/oauth2/v1/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const code = await readAirtableErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("airtable", code);
      }
      throw new Error(`Airtable token refresh failed: ${code}`);
    }
    const json = (await res.json()) as AirtableTokenSuccess;
    if (!json.access_token) {
      throw new Error("Airtable refresh response missing access_token.");
    }
    if (!json.refresh_token) {
      // Rotation invariant. Airtable rotates the refresh token on
      // every successful refresh; the old one is invalidated. If the
      // response is missing a new refresh_token, the rotation
      // contract was violated — fail loud rather than re-encrypting
      // the now-invalid old token (which would silently break every
      // subsequent refresh).
      throw new Error(
        "Airtable refresh response missing refresh_token — Airtable rotates refresh tokens on every successful refresh.",
      );
    }

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      refreshTokenEncrypted: encryptToken(json.refresh_token),
      accessTokenExpiresAt: expiresAt,
      scopes: scopesGranted,
    };
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider's revoke pattern (Slack / Gmail / Calendar / Drive /
    // Sheets / Outlook Mail / Outlook Calendar / OneDrive / Notion).
    // Airtable does provide a token revocation endpoint; landing the
    // disconnect UX slice will wire it up across all providers
    // simultaneously.
  },
};
