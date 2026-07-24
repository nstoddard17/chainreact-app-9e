import {
  type EncryptedTokens,
  type ProviderOAuth,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { motiveApiBase } from "@/integrations/_shared/motive/api/_request";
import {
  logMotiveApiError,
  readMotiveRequestId,
} from "@/integrations/_shared/motive/errors";

/**
 * Motive (gomotive.com) OAuth implementation — MOTIVE-1.
 *
 * Wire-format verified against Motive's official docs
 * (docs/providers/motive/research.md, 2026-07-17):
 *
 *   - Authorize URL: GET
 *     `${authorizeBase}/oauth/authorize?client_id=…&response_type=code&scope=<space-joined>&redirect_uri=…&state=…`
 *     NO PKCE (Motive documents no challenge params).
 *   - Token exchange: POST `${tokenBase}/oauth/token` — BODY auth (client_id +
 *     client_secret in the form body), `grant_type=authorization_code`, `code`,
 *     `redirect_uri`. Response: `{ access_token, refresh_token, expires_in:
 *     7200, token_type: "Bearer" }`.
 *   - **companyId comes from an API read, not the callback.** After the token
 *     exchange we read `GET /v1/companies` (gated by `companies.read` — see
 *     resolveCompany for why NOT `/v1/users/me`) and take the sole authorized
 *     company's id as the providerAccountId (the multi-company discriminator +
 *     webhook fan-out scope). A missing company id FAILS the connect — a row
 *     without a company could never scope a webhook or a company-scoped call.
 *   - Refresh: POST the token endpoint with `grant_type=refresh_token`. Refresh
 *     tokens are SINGLE-USE / rotating — the returned refresh token is persisted
 *     on every refresh (Calendly/QuickBooks precedent); reuse of a spent token
 *     returns `invalid_grant` → `RefreshAuthRequiredError` so the dispatcher
 *     marks the row needs-reconnect exactly once.
 *
 * Motive documents no token-revocation endpoint; `revoke()` is a no-op —
 * disconnect removes the local integration row, and a fresh connect issues a new
 * grant. (HubSpot-style stub.)
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - MOTIVE_CLIENT_ID / MOTIVE_CLIENT_SECRET — Motive developer-portal keys.
 *   - MOTIVE_AUTHORIZE_BASE / MOTIVE_TOKEN_BASE — e2e overrides (production never
 *     sets these; default `https://account.gomotive.com` — the real OAuth host,
 *     live-corrected 2026-07-24; bare `gomotive.com` 404s the token POST).
 *   - MOTIVE_API_BASE — company-info read base (default `https://api.gomotive.com`).
 */

// LIVE-CORRECTED 2026-07-24: Motive's OAuth host is `account.gomotive.com`.
// The docs' `gomotive.com/oauth/authorize` only appears to work because the
// BROWSER follows a redirect to account.gomotive.com — a server-side
// `POST gomotive.com/oauth/token` returns 404 (verified live; broke the first
// prod connect). `POST account.gomotive.com/oauth/token` is the real
// Doorkeeper endpoint (dummy-cred probe returns a proper `invalid_client`).
function motiveAuthorizeBase(): string {
  return process.env.MOTIVE_AUTHORIZE_BASE ?? "https://account.gomotive.com";
}

function motiveTokenBase(): string {
  return process.env.MOTIVE_TOKEN_BASE ?? "https://account.gomotive.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/motive/callback`;
}

function getClientId(): string {
  const id = process.env.MOTIVE_CLIENT_ID;
  if (!id) throw new Error("MOTIVE_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.MOTIVE_CLIENT_SECRET;
  if (!secret) throw new Error("MOTIVE_CLIENT_SECRET env var is not set.");
  return secret;
}

interface MotiveTokenSuccess {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface MotiveTokenError {
  error?: string;
  error_description?: string;
}

interface MotiveCompaniesResponse {
  companies?: Array<{
    company?: { id?: number | string; name?: string | null } | null;
  } | null> | null;
}

async function readMotiveErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as MotiveTokenError;
    if (parsed.error) return parsed.error;
    if (parsed.error_description) return parsed.error_description;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/**
 * Connect-time company identity from `GET /v1/companies`. Returns the company
 * id (required — throws when absent) + a display name. Best-effort on the name
 * only; the company id is load-bearing.
 *
 * LIVE-CORRECTED 2026-07-24: this originally read `GET /v1/users/me`, but that
 * endpoint is gated by `users.read` — which the token does NOT hold, because
 * Motive's portal grants exactly one variant per permission row and the
 * Drivers-and-Fleet-Managers row is set to Read-and-write (`users.manage`
 * only). Motive enforces "GET needs `.read`" strictly (manage does NOT imply
 * read — live 403). `/v1/companies` is gated by `companies.read`, which the
 * token always holds (its portal row is Read-only). A Motive grant authorizes
 * ONE company, so the first (sole) row is the connect identity.
 */
async function resolveCompany(
  accessToken: string,
): Promise<{ companyId: string; displayName: string }> {
  const res = await fetch(`${motiveApiBase()}/v1/companies`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    logMotiveApiError({
      method: "GET",
      path: "/v1/companies",
      status: res.status,
      requestId: readMotiveRequestId(res),
    });
    throw new Error(
      `Motive connect: could not read the authorized company (${await readMotiveErrorCode(res)}).`,
    );
  }
  const json = (await res.json()) as MotiveCompaniesResponse;
  const company = json.companies?.[0]?.company;
  const rawCompanyId = company?.id;
  const companyId =
    rawCompanyId != null && String(rawCompanyId).length > 0
      ? String(rawCompanyId)
      : null;
  if (!companyId) {
    throw new Error(
      "Motive connect: the grant has no company. Refusing the connect — a company-less connection cannot scope webhooks or company-scoped calls.",
    );
  }
  const companyName =
    typeof company?.name === "string" && company.name.length > 0
      ? company.name
      : null;
  return {
    companyId,
    displayName: companyName ?? companyId,
  };
}

export const motiveOAuth: ProviderOAuth = {
  buildAuthUrl(state, scopes) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: "code",
      scope: scopes.join(" "),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${motiveAuthorizeBase()}/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code) {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUrl(),
      client_id: getClientId(),
      client_secret: getClientSecret(),
    });
    const tokenRes = await fetch(`${motiveTokenBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      logMotiveApiError({
        method: "POST",
        path: "/oauth/token",
        status: tokenRes.status,
        requestId: readMotiveRequestId(tokenRes),
      });
      throw new Error(
        `Motive token exchange failed: ${await readMotiveErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as MotiveTokenSuccess;
    if (!json.access_token) {
      throw new Error("Motive token response missing access_token.");
    }
    if (!json.refresh_token) {
      throw new Error("Motive token response missing refresh_token.");
    }

    const { companyId, displayName } = await resolveCompany(json.access_token);

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        // Motive's token response carries no scope echo; the granted set is the
        // manifest's required scopes (all-or-nothing at the consent screen).
        scopes: [],
      },
      account: {
        providerAccountId: companyId,
        displayName,
        metadata: {
          companyId,
          companyName: displayName,
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
    const res = await fetch(`${motiveTokenBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      logMotiveApiError({
        method: "POST",
        path: "/oauth/token",
        status: res.status,
        requestId: readMotiveRequestId(res),
      });
      const code = await readMotiveErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("motive", code);
      }
      throw new Error(`Motive token refresh failed: ${code}`);
    }
    const json = (await res.json()) as MotiveTokenSuccess;
    if (!json.access_token) {
      throw new Error("Motive refresh response missing access_token.");
    }

    // Single-use rotation: persist the returned refresh token every time.
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

  async revoke(): Promise<void> {
    // Motive documents no token-revocation endpoint. Disconnect removes the
    // local integration row; a fresh connect issues a new grant. No-op.
  },
};
