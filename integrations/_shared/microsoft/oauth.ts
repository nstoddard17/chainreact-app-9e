/**
 * Shared Microsoft OAuth helpers.
 *
 * Every Microsoft provider (Outlook Mail, Outlook Calendar, future Teams /
 * OneDrive / Excel / OneNote) uses the same Azure AD app, the same
 * `/common/oauth2/v2.0/{authorize,token}` endpoints, and the same wire
 * format for code exchange + refresh + PKCE. This module owns those
 * shared pieces so per-provider OAuth modules stay thin.
 *
 * What lives here:
 *   - PKCE generation (S256, 32 random bytes).
 *   - Authorize URL builder (multi-tenant /common/, response_mode=query,
 *     space-separated scopes).
 *   - Token exchange against `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`
 *     with code_verifier (Microsoft accepts PKCE on confidential-client
 *     flows as defense-in-depth alongside client_secret).
 *   - Refresh-token flow with the preserve-old policy mirroring V1's
 *     auth.ts:113 + `_shared/google/oauth.ts`.
 *   - Error code parser for the canonical Microsoft `{ error,
 *     error_description }` envelope.
 *
 * What stays per-provider (in `integrations/<id>/oauth.ts`):
 *   - The redirect URL (provider-specific callback path).
 *   - The accountId-resolution call (handled by callers via
 *     `_shared/microsoft/api/me.ts`, but the per-provider OAuth wraps
 *     the call site).
 *
 * Env vars read here:
 *   - MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET — required (throws
 *     if unset). Same Azure AD app id + secret for every Microsoft
 *     provider.
 *   - MICROSOFT_AUTHORIZE_BASE, MICROSOFT_TOKEN_BASE — optional e2e
 *     overrides; both default to `https://login.microsoftonline.com`.
 *
 * Slice 7: extracted from `integrations/microsoft-outlook/oauth.ts` so
 * Outlook Calendar + Outlook Mail share one source of truth. Mirrors
 * `_shared/google/oauth.ts` shape.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  type AccountSteer,
  type EncryptedTokens,
  type PkceGeneration,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

// ─── Env helpers ──────────────────────────────────────────────────────────────

export function microsoftAuthorizeBase(): string {
  return (
    process.env.MICROSOFT_AUTHORIZE_BASE ?? "https://login.microsoftonline.com"
  );
}

export function microsoftTokenBase(): string {
  return (
    process.env.MICROSOFT_TOKEN_BASE ?? "https://login.microsoftonline.com"
  );
}

export function getMicrosoftClientId(): string {
  const id = process.env.MICROSOFT_CLIENT_ID;
  if (!id) throw new Error("MICROSOFT_CLIENT_ID env var is not set.");
  return id;
}

export function getMicrosoftClientSecret(): string {
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) throw new Error("MICROSOFT_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43 base64url chars (RFC 7636 §4.1 minimum). Method
 * is hardcoded S256, matching the shared Google PKCE generator.
 */
export function generateMicrosoftPkce(): PkceGeneration {
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

// ─── Authorize URL ───────────────────────────────────────────────────────────

export interface BuildMicrosoftAuthUrlInput {
  state: string;
  scopes: readonly string[];
  pkceChallenge: { codeChallenge: string; codeChallengeMethod: string };
  redirectUrl: string;
  /**
   * Per-account reconnect steering (Slice 4.APPS-RECONNECT). When set, pins the
   * sign-in to a specific Microsoft account: `login_hint` pre-fills the
   * email/UPN and `prompt=select_account` forces the account chooser.
   * `loginHint` is the row's email (Microsoft's `provider_account_id`), resolved
   * server-side — never client-supplied. Omitted on normal connects.
   */
  accountSteer?: AccountSteer | null;
}

export function buildMicrosoftAuthUrl(input: BuildMicrosoftAuthUrlInput): string {
  const steer = input.accountSteer ?? null;
  const params = new URLSearchParams({
    response_type: "code",
    response_mode: "query",
    client_id: getMicrosoftClientId(),
    redirect_uri: input.redirectUrl,
    // Microsoft v2 endpoint accepts space-separated scopes.
    scope: input.scopes.join(" "),
    state: input.state,
    code_challenge: input.pkceChallenge.codeChallenge,
    code_challenge_method: input.pkceChallenge.codeChallengeMethod,
  });
  if (steer?.forceAccountSelection) {
    params.set("prompt", "select_account");
  }
  if (steer?.loginHint) {
    params.set("login_hint", steer.loginHint);
  }
  return `${microsoftAuthorizeBase()}/common/oauth2/v2.0/authorize?${params.toString()}`;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface MicrosoftTokenSuccess {
  access_token: string;
  /**
   * Microsoft returns refresh_token when `offline_access` is granted.
   * Per-provider OAuth modules declare `offline_access` as required so
   * the token exchange path expects it; refresh responses MAY omit it
   * (preserve-old policy applies).
   */
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  /**
   * OIDC id_token, present when the authorize request included `openid`.
   * Graph-scoped providers ignore it (they resolve identity via Graph
   * `/me`); non-Graph-audience providers (Power BI) need it because
   * their access token cannot call Graph. Surfaced additively via
   * `MicrosoftTokenExchangeResult.idToken`.
   */
  id_token?: string;
}

interface MicrosoftTokenError {
  error: string;
  error_description?: string;
}

// ─── Token exchange ──────────────────────────────────────────────────────────

export interface MicrosoftTokenExchangeResult {
  accessToken: string;
  /** Always present — `exchangeMicrosoftAuthCode` throws if Microsoft omits it. */
  refreshToken: string;
  /** Epoch seconds, or null if Microsoft's response omitted expires_in. */
  expiresAt: number | null;
  scopesGranted: string[];
  /**
   * OIDC id_token when the scope list included `openid`; null otherwise.
   * Consumed by providers whose access token audience is NOT Microsoft
   * Graph (e.g. Power BI) to resolve the connected account's email
   * without a Graph `/me` call. Additive — Graph-scoped providers
   * ignore it.
   */
  idToken: string | null;
}

export async function exchangeMicrosoftAuthCode(input: {
  code: string;
  codeVerifier: string;
  redirectUrl: string;
}): Promise<MicrosoftTokenExchangeResult> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getMicrosoftClientId(),
    client_secret: getMicrosoftClientSecret(),
    code: input.code,
    redirect_uri: input.redirectUrl,
    code_verifier: input.codeVerifier,
  });

  const tokenRes = await fetch(
    `${microsoftTokenBase()}/common/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
  );
  if (!tokenRes.ok) {
    throw new Error(
      `Microsoft token exchange failed: ${await readMicrosoftErrorCode(tokenRes)}`,
    );
  }
  const tokenJson = (await tokenRes.json()) as MicrosoftTokenSuccess;
  if (!tokenJson.access_token) {
    throw new Error("Microsoft token response missing access_token.");
  }
  if (!tokenJson.refresh_token) {
    // First-connect with offline_access should always return a refresh
    // token. Missing one means scopes were re-granted without
    // offline_access (impossible if buildMicrosoftAuthUrl ran correctly
    // with the manifest's required scopes). Fail loud — the refresh
    // path would silently break otherwise.
    throw new Error(
      "Microsoft token response missing refresh_token — manifest requires offline_access which should always issue one.",
    );
  }

  const expiresAt =
    typeof tokenJson.expires_in === "number"
      ? Math.floor(Date.now() / 1000) + tokenJson.expires_in
      : null;
  const scopesGranted = (tokenJson.scope ?? "").split(" ").filter(Boolean);
  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
    scopesGranted,
    idToken: tokenJson.id_token ?? null,
  };
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

/**
 * Refresh a Microsoft access token. Provider owns the rotation/preserve-
 * old policy:
 *   - Microsoft's response usually rotates refresh_token, but spec
 *     allows omission. When the field is present, encrypt and return it.
 *   - When omitted, re-encrypt the input refreshToken plaintext and
 *     return that — the row's refresh credential stays unchanged.
 *
 * Mirrors V1 auth.ts:113 + Google's preserve-old behavior.
 */
export async function refreshMicrosoftToken(
  refreshTokenPlaintext: string,
): Promise<EncryptedTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getMicrosoftClientId(),
    client_secret: getMicrosoftClientSecret(),
    refresh_token: refreshTokenPlaintext,
  });
  const res = await fetch(
    `${microsoftTokenBase()}/common/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    const code = await readMicrosoftErrorCode(res);
    if (isRefreshAuthRequiredCode(code)) {
      throw new RefreshAuthRequiredError("microsoft", code);
    }
    throw new Error(`Microsoft token refresh failed: ${code}`);
  }
  const json = (await res.json()) as MicrosoftTokenSuccess;
  if (!json.access_token) {
    throw new Error("Microsoft refresh response missing access_token.");
  }
  const expiresAt =
    typeof json.expires_in === "number"
      ? Math.floor(Date.now() / 1000) + json.expires_in
      : null;
  const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);
  return {
    accessTokenEncrypted: encryptToken(json.access_token),
    refreshTokenEncrypted: json.refresh_token
      ? encryptToken(json.refresh_token)
      : encryptToken(refreshTokenPlaintext),
    accessTokenExpiresAt: expiresAt,
    scopes: scopesGranted,
  };
}

// ─── Error code helper ──────────────────────────────────────────────────────

export async function readMicrosoftErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as MicrosoftTokenError;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}
