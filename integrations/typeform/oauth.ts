import {
  type EncryptedTokens,
  type ProviderOAuth,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Typeform OAuth implementation — Slice 5.TYPEFORM-1.
 *
 * Green-field (no V1 Typeform code existed). Wire-format verified against
 * the official docs (docs/providers/typeform/research.md, 2026-07-04):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth/authorize?client_id=…&redirect_uri=…&scope=<space-joined>&state=…`
 *     (scopes are space-delimited; URLSearchParams encodes the spaces as
 *     `+`, exactly the form the scopes page shows).
 *   - Token exchange: POST `${tokenBase}/oauth/token`
 *     - Body-auth — `client_id` + `client_secret` in the form-encoded
 *       body (HubSpot / Monday shape). NO PKCE — Typeform documents none;
 *       this is a confidential-client flow.
 *     - Response: `{ token_type: "Bearer", access_token, expires_in,
 *       refresh_token }` — refresh_token present only because the
 *       manifest always requests the `offline` scope.
 *   - Identity: the token response embeds NO identity object. Connect
 *     resolves it via `GET ${apiBase}/me` (scope `accounts:read`) which
 *     returns `{ alias, email, language, user_id }`.
 *   - Refresh: POST `${tokenBase}/oauth/token` with
 *     `grant_type=refresh_token&…`. Refresh tokens ROTATE (documented:
 *     the refresh procedure invalidates the old token), so the rotated
 *     `refresh_token` is persisted on every refresh; the old value is
 *     kept only as a defensive fallback if a response ever omits it.
 *     RFC 6749 §5.2 `invalid_grant` → `RefreshAuthRequiredError` so the
 *     dispatcher marks the row needs-reconnect exactly once.
 *
 * `revoke()` is a stub deferred to the uniform disconnect-UX slice —
 * matches every other V2 provider.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - TYPEFORM_CLIENT_ID / TYPEFORM_CLIENT_SECRET — from the Typeform
 *     developer app (admin panel → Organization settings → Developer
 *     apps).
 *   - TYPEFORM_AUTHORIZE_BASE / TYPEFORM_TOKEN_BASE / TYPEFORM_API_BASE —
 *     e2e overrides (production never sets these; defaults point at
 *     `api.typeform.com`). EU data-center hosts are a documented
 *     limitation this slice (research.md).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function typeformAuthorizeBase(): string {
  return process.env.TYPEFORM_AUTHORIZE_BASE ?? "https://api.typeform.com";
}

function typeformTokenBase(): string {
  return process.env.TYPEFORM_TOKEN_BASE ?? "https://api.typeform.com";
}

function typeformApiBase(): string {
  return process.env.TYPEFORM_API_BASE ?? "https://api.typeform.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/typeform/callback`;
}

function getClientId(): string {
  const id = process.env.TYPEFORM_CLIENT_ID;
  if (!id) throw new Error("TYPEFORM_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.TYPEFORM_CLIENT_SECRET;
  if (!secret) throw new Error("TYPEFORM_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface TypeformTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface TypeformTokenError {
  error?: string;
  error_description?: string;
  description?: string;
}

interface TypeformMeResponse {
  alias?: string | null;
  email?: string | null;
  user_id?: string | null;
  language?: string | null;
}

async function readTypeformErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as TypeformTokenError;
    // Prefer the bare OAuth2 error code (`invalid_grant`) so
    // `isRefreshAuthRequiredCode` can match it exactly.
    if (parsed.error) return parsed.error;
    if (parsed.error_description) return parsed.error_description;
    if (parsed.description) return parsed.description;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/**
 * Resolve connect-time identity via `GET /me` (scope `accounts:read`).
 * Typeform's token response embeds no identity object, so this call is
 * mandatory (contrast Asana's embedded `data`).
 */
async function resolveIdentity(accessToken: string): Promise<{
  userId: string;
  alias: string | null;
  email: string | null;
}> {
  const meRes = await fetch(`${typeformApiBase()}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!meRes.ok) {
    throw new Error(`Typeform /me lookup failed: HTTP ${meRes.status}`);
  }
  const me = (await meRes.json()) as TypeformMeResponse;
  const userId = me.user_id;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Typeform /me response missing user_id.");
  }
  return {
    userId,
    alias: me.alias ?? null,
    email: me.email ?? null,
  };
}

export const typeformOAuth: ProviderOAuth = {
  // No generatePkce — Typeform documents no PKCE support; the token
  // exchange authenticates with client_secret in the body (confidential
  // client, HubSpot / Monday shape).

  buildAuthUrl(state, scopes, _pkce) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      scope: scopes.join(" "),
      state,
    });
    return `${typeformAuthorizeBase()}/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
      code,
    });
    const tokenRes = await fetch(`${typeformTokenBase()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Typeform token exchange failed: ${await readTypeformErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as TypeformTokenSuccess;
    if (!json.access_token) {
      throw new Error("Typeform token response missing access_token.");
    }
    if (!json.refresh_token) {
      // The manifest always requests the `offline` scope, so a missing
      // refresh_token means the grant is broken; the ~1-week access token
      // would strand the connection. Fail the connect rather than persist
      // a doomed row (Asana precedent).
      throw new Error(
        "Typeform token response missing refresh_token (offline scope not granted?).",
      );
    }

    const identity = await resolveIdentity(json.access_token);
    const email = identity.email;
    // providerAccountId — prefer email per manifest accountIdField, fall
    // back to the user_id when email is absent.
    const providerAccountId = email ?? identity.userId;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        // Typeform's token response does not echo granted scopes; the
        // health engine treats missing scope echoes as "as-requested".
        scopes: [],
      },
      account: {
        providerAccountId,
        // displayName preference: alias (most readable) → email → user_id.
        displayName: identity.alias ?? email ?? identity.userId,
        metadata: {
          typeformUserId: identity.userId,
          email,
          alias: identity.alias,
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
    const res = await fetch(`${typeformTokenBase()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const code = await readTypeformErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("typeform", code);
      }
      throw new Error(`Typeform token refresh failed: ${code}`);
    }
    const json = (await res.json()) as TypeformTokenSuccess;
    if (!json.access_token) {
      throw new Error("Typeform refresh response missing access_token.");
    }

    // Refresh-token ROTATION: documented — the refresh procedure
    // invalidates the old refresh token, so the rotated token MUST be
    // persisted. Falling back to the old value only if a response ever
    // omits one (defensive; per docs it should always be present).
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
    // Deferred to the uniform disconnect-UX slice — matches every other
    // V2 provider.
  },
};
