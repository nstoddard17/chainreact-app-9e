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
 * Asana OAuth implementation — Slice 5.ASANA-1.
 *
 * Green-field (no V1 Asana code existed). Wire-format verified against
 * current Asana docs (docs/providers/asana/research.md, 2026-07-04):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/-/oauth_authorize?client_id=…&redirect_uri=…&response_type=code&scope=<space-joined>&state=…&code_challenge=…&code_challenge_method=S256`
 *   - Token exchange: POST `${tokenBase}/-/oauth_token`
 *     - Body-auth — `client_id` + `client_secret` in the form-encoded
 *       body (same shape as HubSpot / Monday).
 *     - Body: `grant_type=authorization_code&client_id=…&client_secret=…&redirect_uri=…&code=…&code_verifier=…`
 *     - Response: `{ access_token, expires_in: 3600, token_type: "bearer",
 *       refresh_token, data: { gid, name, email } }`. The embedded `data`
 *       object provides connect-time identity WITHOUT a follow-up call;
 *       `GET /users/me` (scope `users:read`) is the defensive fallback.
 *   - Refresh: POST `${tokenBase}/-/oauth_token` with
 *     `grant_type=refresh_token&client_id=…&client_secret=…&refresh_token=…`.
 *     Refresh-token PRESERVATION policy: rotation is undocumented, so when
 *     the refresh response includes a fresh `refresh_token` V2 persists it,
 *     otherwise the original is kept (HubSpot / Monday / Stripe contract).
 *     RFC 6749 §5.2 `invalid_grant` → `RefreshAuthRequiredError` so the
 *     dispatcher marks the row needs-reconnect exactly once (V2-READY-32).
 *
 * PKCE: Asana supports optional S256 PKCE; V2 always sends it. Standalone
 * generator mirrors `integrations/airtable/oauth.ts` (32 random bytes →
 * base64url verifier, SHA-256 base64url challenge).
 *
 * `revoke()` is a stub deferred to the uniform disconnect-UX slice —
 * matches every other V2 provider. Asana's documented revoke endpoint
 * (`POST /-/oauth_revoke`, takes the REFRESH token) is recorded in
 * research.md for that slice.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - ASANA_CLIENT_ID / ASANA_CLIENT_SECRET — from the Asana developer
 *     console app (https://app.asana.com/0/my-apps, OAuth tab).
 *   - ASANA_AUTHORIZE_BASE / ASANA_TOKEN_BASE / ASANA_API_BASE — e2e
 *     overrides (production never sets these; defaults point at
 *     `app.asana.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function asanaAuthorizeBase(): string {
  return process.env.ASANA_AUTHORIZE_BASE ?? "https://app.asana.com";
}

function asanaTokenBase(): string {
  return process.env.ASANA_TOKEN_BASE ?? "https://app.asana.com";
}

function asanaApiBase(): string {
  return process.env.ASANA_API_BASE ?? "https://app.asana.com/api/1.0";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/asana/callback`;
}

function getClientId(): string {
  const id = process.env.ASANA_CLIENT_ID;
  if (!id) throw new Error("ASANA_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.ASANA_CLIENT_SECRET;
  if (!secret) throw new Error("ASANA_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface AsanaTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  data?: {
    gid?: string;
    id?: number;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface AsanaTokenError {
  error?: string;
  error_description?: string;
}

interface AsanaUsersMeResponse {
  data?: {
    gid?: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

async function readAsanaErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as AsanaTokenError;
    // Prefer the bare OAuth2 error code (`invalid_grant`) over the prose
    // description so `isRefreshAuthRequiredCode` can match it exactly.
    if (parsed.error) return parsed.error;
    if (parsed.error_description) return parsed.error_description;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

// ─── PKCE ───────────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43 base64url chars (RFC 7636 §4.1 minimum). Method
 * hardcoded S256. Mirrors `integrations/airtable/oauth.ts` — Asana's PKCE
 * shape has no provider-specific quirks.
 */
function generateAsanaPkce(): PkceGeneration {
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

/**
 * Resolve connect-time identity. The token response's embedded `data`
 * object is the primary source (no extra round trip). When absent —
 * defensive; current docs show it on every token response — fall back to
 * `GET /users/me` with the fresh access token (scope `users:read`).
 */
async function resolveIdentity(json: AsanaTokenSuccess): Promise<{
  gid: string;
  name: string | null;
  email: string | null;
}> {
  const embedded = json.data;
  const embeddedGid =
    embedded?.gid ?? (embedded?.id !== undefined ? String(embedded.id) : undefined);
  if (embedded && embeddedGid) {
    return {
      gid: embeddedGid,
      name: embedded.name ?? null,
      email: embedded.email ?? null,
    };
  }

  const meRes = await fetch(`${asanaApiBase()}/users/me?opt_fields=name,email`, {
    headers: {
      Authorization: `Bearer ${json.access_token}`,
      Accept: "application/json",
    },
  });
  if (!meRes.ok) {
    throw new Error(`Asana /users/me lookup failed: HTTP ${meRes.status}`);
  }
  const meJson = (await meRes.json()) as AsanaUsersMeResponse;
  const me = meJson.data;
  if (!me || !me.gid) {
    throw new Error("Asana /users/me response missing gid.");
  }
  return { gid: me.gid, name: me.name ?? null, email: me.email ?? null };
}

export const asanaOAuth: ProviderOAuth = {
  generatePkce: generateAsanaPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      // Should be impossible — the dispatcher always passes PKCE for Asana
      // because generatePkce returned a non-null value. Defensive throw so
      // a future refactor that breaks connect-time threading surfaces
      // immediately. Mirrors airtable / gmail.
      throw new Error(
        "asanaOAuth.buildAuthUrl: PKCE challenge is required for Asana. The dispatcher should have generated one via generatePkce().",
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
    return `${asanaAuthorizeBase()}/-/oauth_authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "asanaOAuth.handleCallback: missing PKCE code_verifier from the state row. Refusing the token exchange.",
      );
    }
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
      code,
      code_verifier: pkce.codeVerifier,
    });
    const tokenRes = await fetch(`${asanaTokenBase()}/-/oauth_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Asana token exchange failed: ${await readAsanaErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as AsanaTokenSuccess;
    if (!json.access_token) {
      throw new Error("Asana token response missing access_token.");
    }
    if (!json.refresh_token) {
      // Asana's code flow always issues a refresh token; without one the
      // hourly-expiring access token would strand the connection in <1h.
      // Fail the connect rather than persist a doomed row.
      throw new Error("Asana token response missing refresh_token.");
    }

    const identity = await resolveIdentity(json);
    const email = identity.email;
    // providerAccountId — prefer email per manifest accountIdField, fall
    // back to the numeric gid when email is absent.
    const providerAccountId = email ?? identity.gid;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        // Asana's token response does not echo granted scopes; persist the
        // requested manifest scopes' grant implicitly as empty (the health
        // engine treats missing scope echoes as "as-requested").
        scopes: [],
      },
      account: {
        providerAccountId,
        // displayName preference: name (most readable) → email → gid.
        displayName: identity.name ?? email ?? identity.gid,
        metadata: {
          asanaUserGid: identity.gid,
          email,
          name: identity.name,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${asanaTokenBase()}/-/oauth_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const code = await readAsanaErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("asana", code);
      }
      throw new Error(`Asana token refresh failed: ${code}`);
    }
    const json = (await res.json()) as AsanaTokenSuccess;
    if (!json.access_token) {
      throw new Error("Asana refresh response missing access_token.");
    }

    // Refresh-token PRESERVATION: rotation is undocumented; persist a new
    // refresh_token if one appears, else keep the original.
    const refreshTokenToPersist = json.refresh_token ?? refreshTokenPlaintext;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      refreshTokenEncrypted: encryptToken(refreshTokenToPersist),
      accessTokenExpiresAt: expiresAt,
      scopes: [],
    };
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the uniform disconnect-UX slice — matches every other V2
    // provider. Asana's revoke endpoint (`POST /-/oauth_revoke`, takes
    // client_id + client_secret + the REFRESH token) is documented in
    // docs/providers/asana/research.md for that slice.
  },
};
