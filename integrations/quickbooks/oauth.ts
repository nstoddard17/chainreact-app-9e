import {
  type EncryptedTokens,
  type ProviderOAuth,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * QuickBooks Online OAuth implementation — QUICKBOOKS-1.
 *
 * Green-field (no V1 QuickBooks code existed). Wire-format verified
 * against official Intuit docs (docs/providers/quickbooks/research.md,
 * 2026-07-07):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/connect/oauth2?client_id=…&response_type=code&scope=<space-joined>&redirect_uri=…&state=…`
 *     NO PKCE — Intuit's discovery documents list no
 *     code_challenge_methods_supported and the OAuth docs document no
 *     challenge params (Slack-default-v2 precedent for a non-PKCE
 *     provider; contrast Calendly/Asana).
 *   - Token exchange: POST `${tokenBase}/oauth2/v1/tokens/bearer`
 *     - `Authorization: Basic base64(client_id:client_secret)` (Intuit
 *       supports client_secret_basic + client_secret_post; V2 uses Basic —
 *       the Calendly shape). Form body: `grant_type=authorization_code`,
 *       `code`, `redirect_uri`.
 *     - Response: `{ access_token, refresh_token, expires_in: 3600,
 *       x_refresh_token_expires_in, token_type: "bearer" }`.
 *   - **realmId comes from the CALLBACK QUERY PARAMS, not the token
 *     response.** Intuit appends `realmId=<companyId>` to the redirect;
 *     the dispatcher's generic `callbackParams` passthrough delivers it
 *     here. It is not discoverable from the token, so a missing realmId
 *     FAILS the connect — a row without a realm could never make an
 *     Accounting API call.
 *   - Identity: display identity is resolved via
 *     `GET ${apiBase}/v3/company/{realmId}/companyinfo/{realmId}`
 *     (CompanyName). A failure here degrades gracefully to the realmId as
 *     display name — company info is cosmetic, the grant is already
 *     proven.
 *   - Refresh: POST the token endpoint with `grant_type=refresh_token`,
 *     Basic auth. Refresh tokens live on a ROLLING 100-DAY window and the
 *     VALUE rotates roughly every 24h — the returned refresh token is
 *     persisted on every refresh (Calendly/Typeform precedent); reuse of
 *     a dead token returns `invalid_grant` → `RefreshAuthRequiredError`
 *     so the dispatcher marks the row needs-reconnect exactly once.
 *
 * `revoke()` POSTs the token to Intuit's revocation endpoint
 * (`${revokeBase}/v2/oauth2/tokens/revoke`, Basic auth, JSON `{ token }`).
 * Intuit invalidates the ENTIRE authorization — both the access token and
 * its paired refresh token — regardless of which of the two is presented,
 * so revoking the access token the disconnect/purge flow hands us tears
 * down the whole grant on Intuit's side (not just our local row). Throws
 * on a non-2xx response so the caller's best-effort + bounded-retry policy
 * (`accountPurge` retry loop / `disconnect` provider_revoked flag) can act
 * on a genuine failure. Required for the QuickBooks App Store security
 * review, which expects a disconnect to release the grant. The token value
 * is never logged (only the OAuth2 error code surfaces on failure).
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET — Intuit developer
 *     portal keys. Development keys pair with the sandbox API base;
 *     Production keys with the production base.
 *   - QUICKBOOKS_AUTHORIZE_BASE / QUICKBOOKS_TOKEN_BASE — e2e overrides
 *     (production never sets these; defaults point at
 *     `appcenter.intuit.com` / `oauth.platform.intuit.com` — identical
 *     for sandbox and production per Intuit).
 *   - QUICKBOOKS_REVOKE_BASE — e2e override for the revocation host
 *     (default `https://developer.api.intuit.com`; identical for sandbox
 *     and production per Intuit).
 *   - QUICKBOOKS_API_BASE — `https://quickbooks.api.intuit.com` default;
 *     set to `https://sandbox-quickbooks.api.intuit.com` when running
 *     with Development keys.
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function quickbooksAuthorizeBase(): string {
  return process.env.QUICKBOOKS_AUTHORIZE_BASE ?? "https://appcenter.intuit.com";
}

function quickbooksTokenBase(): string {
  return (
    process.env.QUICKBOOKS_TOKEN_BASE ?? "https://oauth.platform.intuit.com"
  );
}

/** Shared with the API wrappers (integrations/_shared/quickbooks). */
export function quickbooksApiBase(): string {
  return process.env.QUICKBOOKS_API_BASE ?? "https://quickbooks.api.intuit.com";
}

function quickbooksRevokeBase(): string {
  return (
    process.env.QUICKBOOKS_REVOKE_BASE ?? "https://developer.api.intuit.com"
  );
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/quickbooks/callback`;
}

function getClientId(): string {
  const id = process.env.QUICKBOOKS_CLIENT_ID;
  if (!id) throw new Error("QUICKBOOKS_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!secret) throw new Error("QUICKBOOKS_CLIENT_SECRET env var is not set.");
  return secret;
}

function basicAuthHeader(): string {
  const raw = `${getClientId()}:${getClientSecret()}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface QuickbooksTokenSuccess {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
}

interface QuickbooksTokenError {
  error?: string;
  error_description?: string;
}

interface QuickbooksCompanyInfoResponse {
  CompanyInfo?: {
    CompanyName?: string | null;
    Country?: string | null;
  } | null;
}

async function readQuickbooksErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as QuickbooksTokenError;
    // Prefer the bare OAuth2 error code (`invalid_grant`) so
    // `isRefreshAuthRequiredCode` can match it exactly.
    if (parsed.error) return parsed.error;
    if (parsed.error_description) return parsed.error_description;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/**
 * Connect-time display identity: company name from CompanyInfo (the
 * realmId appears twice in the path per Intuit's documented shape).
 * Best-effort — a failure returns nulls and the caller falls back to the
 * realmId; the grant itself is already proven by the token exchange.
 */
async function resolveCompanyInfo(
  accessToken: string,
  realmId: string,
): Promise<{ companyName: string | null; country: string | null }> {
  try {
    const res = await fetch(
      `${quickbooksApiBase()}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=75`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return { companyName: null, country: null };
    const json = (await res.json()) as QuickbooksCompanyInfoResponse;
    const info = json.CompanyInfo;
    return {
      companyName:
        typeof info?.CompanyName === "string" && info.CompanyName.length > 0
          ? info.CompanyName
          : null,
      country:
        typeof info?.Country === "string" && info.Country.length > 0
          ? info.Country
          : null,
    };
  } catch {
    return { companyName: null, country: null };
  }
}

export const quickbooksOAuth: ProviderOAuth = {
  buildAuthUrl(state, scopes) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: "code",
      scope: scopes.join(" "),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${quickbooksAuthorizeBase()}/connect/oauth2?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce, _providerHint, callbackParams) {
    // realmId — Intuit delivers the company id ONLY here. Without it no
    // Accounting API call can ever be scoped, so refuse the connect
    // outright rather than persist a doomed row.
    const realmId = callbackParams?.realmId;
    if (typeof realmId !== "string" || realmId.length === 0) {
      throw new Error(
        "QuickBooks callback is missing the realmId query param. The company id is only delivered on the OAuth redirect — refusing the token exchange.",
      );
    }

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUrl(),
    });
    const tokenRes = await fetch(
      `${quickbooksTokenBase()}/oauth2/v1/tokens/bearer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: basicAuthHeader(),
        },
        body: params.toString(),
      },
    );
    if (!tokenRes.ok) {
      throw new Error(
        `QuickBooks token exchange failed: ${await readQuickbooksErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as QuickbooksTokenSuccess;
    if (!json.access_token) {
      throw new Error("QuickBooks token response missing access_token.");
    }
    if (!json.refresh_token) {
      // Intuit always issues refresh tokens on the accounting scope; a
      // missing one means the grant is broken — the 60-minute access
      // token would strand the connection. Fail the connect rather than
      // persist a doomed row (Asana / Typeform / Calendly precedent).
      throw new Error("QuickBooks token response missing refresh_token.");
    }

    const { companyName, country } = await resolveCompanyInfo(
      json.access_token,
      realmId,
    );

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        // Intuit's token response carries no scope echo; record the
        // manifest scope set the dispatcher requested. (The single
        // accounting scope is all-or-nothing at the consent screen.)
        scopes: ["com.intuit.quickbooks.accounting"],
      },
      account: {
        // realmId is the stable company id AND the multi-company
        // discriminator (one authorization = one company).
        providerAccountId: realmId,
        displayName: companyName ?? realmId,
        metadata: {
          realmId,
          companyName,
          // Region drives tax-model differences (US AST vs global tax);
          // persisted for future diagnostics, never guessed from.
          country,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${quickbooksTokenBase()}/oauth2/v1/tokens/bearer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: basicAuthHeader(),
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const code = await readQuickbooksErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("quickbooks", code);
      }
      throw new Error(`QuickBooks token refresh failed: ${code}`);
    }
    const json = (await res.json()) as QuickbooksTokenSuccess;
    if (!json.access_token) {
      throw new Error("QuickBooks refresh response missing access_token.");
    }

    // Refresh-token ROTATION: Intuit rotates the refresh-token VALUE
    // roughly every 24h inside the rolling 100-day window — the returned
    // token MUST be persisted. Falling back to the old value only if a
    // response ever omits one (defensive; per docs it is always present).
    const refreshTokenToPersist = json.refresh_token ?? refreshTokenPlaintext;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      refreshTokenEncrypted: encryptToken(refreshTokenToPersist),
      accessTokenExpiresAt: expiresAt,
      scopes: ["com.intuit.quickbooks.accounting"],
    };
  },

  async revoke(token: string): Promise<void> {
    const res = await fetch(
      `${quickbooksRevokeBase()}/v2/oauth2/tokens/revoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: basicAuthHeader(),
        },
        body: JSON.stringify({ token }),
      },
    );
    // 2xx → the grant is gone on Intuit's side. Any non-2xx is a genuine
    // failure (bad client creds, transient 5xx, network): throw so the
    // caller's best-effort retry/audit policy owns it. The token itself is
    // never surfaced — only the OAuth2 error code.
    if (!res.ok) {
      throw new Error(
        `QuickBooks token revocation failed: ${await readQuickbooksErrorCode(res)}`,
      );
    }
  },
};
