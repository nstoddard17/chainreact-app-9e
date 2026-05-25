import {
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { currentAccountGet } from "@/integrations/_shared/dropbox/api/currentAccountGet";

/**
 * Dropbox OAuth 2.0 implementation — Slice 3.DROPBOX-2.
 *
 * Authorization-code flow, refreshable, NO PKCE (D-DB2 — confidential
 * client with a secret; mirrors HubSpot / Monday's body-auth shape).
 *
 *   - Authorize: GET
 *     `${authorizeBase}/oauth2/authorize?client_id=…&redirect_uri=…&response_type=code&token_access_type=offline&scope=<space-joined>&state=…`.
 *     **`token_access_type=offline` is REQUIRED** — without it Dropbox
 *     issues only a short-lived access token and NO refresh token, which
 *     would silently break the refresh path.
 *   - Token exchange: POST `${tokenBase}/oauth2/token`, body-auth
 *     (`client_id` + `client_secret` in the form body),
 *     `application/x-www-form-urlencoded`. Response: `{ access_token,
 *     refresh_token, expires_in, token_type, scope?, account_id? }`.
 *   - Refresh: POST same endpoint, `grant_type=refresh_token`. Dropbox's
 *     refresh response returns a new access token but NO new refresh
 *     token (refresh tokens are long-lived) — preserve the original.
 *
 * Account identity — `/2/users/get_current_account` with the freshly
 * issued access token. `providerAccountId` is the Dropbox `account_id`
 * (`dbid:...`) — load-bearing for the DROPBOX-5 webhook. `displayName`
 * prefers the account's display name, then email, then the id.
 *
 * Env vars: `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`. E2e overrides
 * (production never sets these): `DROPBOX_AUTHORIZE_BASE`,
 * `DROPBOX_TOKEN_BASE`, `DROPBOX_API_BASE` (the last is read by the
 * shared API layer used for the account lookup).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider's revoke pattern.
 */

function dropboxAuthorizeBase(): string {
  return process.env.DROPBOX_AUTHORIZE_BASE ?? "https://www.dropbox.com";
}

function dropboxTokenBase(): string {
  return process.env.DROPBOX_TOKEN_BASE ?? "https://api.dropboxapi.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/dropbox/callback`;
}

function getClientId(): string {
  const id = process.env.DROPBOX_CLIENT_ID;
  if (!id) throw new Error("DROPBOX_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.DROPBOX_CLIENT_SECRET;
  if (!secret) throw new Error("DROPBOX_CLIENT_SECRET env var is not set.");
  return secret;
}

interface DropboxTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  account_id?: string;
}

interface DropboxTokenError {
  error?: string;
  error_description?: string;
  error_summary?: string;
}

async function readDropboxErrorCode(res: Response): Promise<string> {
  // Sanitized: surface only Dropbox's machine-readable error fields,
  // never the raw body (which can echo request context).
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as DropboxTokenError;
    if (parsed.error_description) return parsed.error_description;
    if (parsed.error) return parsed.error;
    if (parsed.error_summary) return parsed.error_summary;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

export const dropboxOAuth: ProviderOAuth = {
  // No generatePkce — Dropbox is a confidential client (D-DB2).

  buildAuthUrl(state, scopes, _pkce) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      response_type: "code",
      // REQUIRED for refresh-token issuance.
      token_access_type: "offline",
      scope: scopes.join(" "),
      state,
    });
    return `${dropboxAuthorizeBase()}/oauth2/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
    });
    const tokenRes = await fetch(`${dropboxTokenBase()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Dropbox token exchange failed: ${await readDropboxErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as DropboxTokenSuccess;
    if (!json.access_token) {
      throw new Error("Dropbox token response missing access_token.");
    }
    if (!json.refresh_token) {
      // token_access_type=offline always yields a refresh_token; a missing
      // one means the authorize URL dropped the param — fail loud.
      throw new Error(
        "Dropbox token response missing refresh_token — ensure token_access_type=offline is sent on the authorize URL.",
      );
    }

    // Resolve account identity. account_id is load-bearing (webhook
    // routing) — prefer the dedicated lookup so we also capture
    // email/name for the display label.
    let account: Awaited<ReturnType<typeof currentAccountGet>>;
    try {
      account = await currentAccountGet({ accessToken: json.access_token });
    } catch (err) {
      throw new Error(
        `Dropbox account lookup failed: ${(err as Error).message}`,
      );
    }
    const accountId = account.account_id || json.account_id;
    if (!accountId) {
      throw new Error("Dropbox account lookup returned no account_id.");
    }
    const email = account.email ?? null;
    const displayName = account.name?.display_name ?? email ?? accountId;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
      },
      account: {
        providerAccountId: accountId,
        displayName,
        metadata: {
          dropboxAccountId: accountId,
          email,
          name: account.name?.display_name ?? null,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
      client_id: getClientId(),
      client_secret: getClientSecret(),
    });
    const res = await fetch(`${dropboxTokenBase()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Dropbox token refresh failed: ${await readDropboxErrorCode(res)}`,
      );
    }
    const json = (await res.json()) as DropboxTokenSuccess;
    if (!json.access_token) {
      throw new Error("Dropbox refresh response missing access_token.");
    }

    // Dropbox refresh does NOT rotate the refresh token — preserve the
    // original (refresh tokens are long-lived). Same contract as Monday /
    // HubSpot.
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
    // Deferred to the disconnect-UX slice — uniform across V2 providers.
    // Dropbox exposes /2/auth/token/revoke; the disconnect slice will
    // wire revocation policy consistently.
  },
};
