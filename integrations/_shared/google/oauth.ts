/**
 * Shared Google OAuth helpers.
 *
 * All Google providers (Gmail, Calendar, future Drive/Docs/Sheets) share the
 * same client ID/secret env vars, the same authorize and token endpoints, and
 * the same wire format for code exchange + refresh + PKCE. This module owns
 * those shared pieces so per-provider OAuth modules stay thin.
 *
 * What lives here:
 *   - PKCE generation (S256, 32 random bytes).
 *   - Authorize URL builder (offline access + prompt=consent + scopes).
 *   - Token exchange against `${GOOGLE_TOKEN_BASE}/token` with code_verifier.
 *   - Refresh-token flow with the preserve-old refresh-token policy
 *     (Gmail Decision 2b-5 — extracted unchanged).
 *
 * What stays per-provider (in `integrations/<id>/oauth.ts`):
 *   - The redirect URL (provider-specific callback path).
 *   - The accountId-resolution call (Gmail: users.getProfile; Calendar:
 *     OIDC userinfo; future providers: whatever returns the user identifier).
 *   - The provider-specific API base env override.
 *
 * Env vars read here:
 *   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — required (throws if unset).
 *   - GOOGLE_AUTHORIZE_BASE, GOOGLE_TOKEN_BASE — optional e2e overrides.
 *
 * Error messages on the throw paths are stable: Gmail's tests assert exact
 * substrings (`/GOOGLE_CLIENT_ID/`, `/missing refresh_token/`, `/invalid_grant/`).
 * Don't reword them without updating the tests.
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

export function googleAuthorizeBase(): string {
  return process.env.GOOGLE_AUTHORIZE_BASE ?? "https://accounts.google.com";
}

export function googleTokenBase(): string {
  return process.env.GOOGLE_TOKEN_BASE ?? "https://oauth2.googleapis.com";
}

export function getGoogleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID env var is not set.");
  return id;
}

export function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43 base64url chars (RFC 7636 §4.1 minimum), exceeds
 * entropy needed for SHA-256. Method is hardcoded S256.
 */
export function generateGooglePkce(): PkceGeneration {
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

export interface BuildGoogleAuthUrlInput {
  state: string;
  scopes: readonly string[];
  pkceChallenge: { codeChallenge: string; codeChallengeMethod: string };
  redirectUrl: string;
  /**
   * Per-account reconnect steering (Slice 4.APPS-RECONNECT). When set, pins the
   * sign-in to a specific Google account: `login_hint` pre-fills the email and
   * `prompt=select_account consent` forces the account chooser (still keeping
   * `consent` so offline access re-issues a refresh token). `loginHint` is the
   * row's email (Google's `provider_account_id`), resolved server-side — never
   * client-supplied. Omitted on normal connects → behavior unchanged.
   */
  accountSteer?: AccountSteer | null;
}

export function buildGoogleAuthUrl(input: BuildGoogleAuthUrlInput): string {
  const steer = input.accountSteer ?? null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getGoogleClientId(),
    redirect_uri: input.redirectUrl,
    scope: input.scopes.join(" "), // Google uses space-separated scopes
    state: input.state,
    access_type: "offline",
    // Reconnect steers to the chooser; keep `consent` so offline access still
    // re-issues a refresh token (Google omits it without prompt=consent).
    prompt: steer?.forceAccountSelection ? "select_account consent" : "consent",
    code_challenge: input.pkceChallenge.codeChallenge,
    code_challenge_method: input.pkceChallenge.codeChallengeMethod,
  });
  if (steer?.loginHint) {
    params.set("login_hint", steer.loginHint);
  }
  return `${googleAuthorizeBase()}/o/oauth2/v2/auth?${params.toString()}`;
}

// ─── Token exchange ──────────────────────────────────────────────────────────

interface GoogleTokenSuccess {
  access_token: string;
  expires_in: number;
  /**
   * Google may omit refresh_token on subsequent connects without
   * prompt=consent (we always send prompt=consent, but per RFC the field is
   * still optional in the response). On first connect we expect it; the
   * caller of `exchangeGoogleAuthCode` throws if it's missing because the
   * downstream refresh path needs it.
   */
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface GoogleTokenError {
  error: string;
  error_description?: string;
}

export interface GoogleTokenExchangeResult {
  accessToken: string;
  /** Always present — `exchangeGoogleAuthCode` throws if Google omits it. */
  refreshToken: string;
  /** Epoch seconds, or null if Google's response omitted expires_in. */
  expiresAt: number | null;
  scopesGranted: string[];
}

export async function exchangeGoogleAuthCode(input: {
  code: string;
  codeVerifier: string;
  redirectUrl: string;
}): Promise<GoogleTokenExchangeResult> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: input.redirectUrl,
    code_verifier: input.codeVerifier,
  });

  const tokenRes = await fetch(`${googleTokenBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    let errorCode = `HTTP ${tokenRes.status}`;
    try {
      const parsed = JSON.parse(text) as GoogleTokenError;
      if (parsed.error) errorCode = parsed.error;
    } catch {
      // not JSON — keep HTTP status
    }
    throw new Error(`Google token exchange failed: ${errorCode}`);
  }
  const tokenJson = (await tokenRes.json()) as GoogleTokenSuccess;
  if (!tokenJson.access_token) {
    throw new Error("Google token response missing access_token.");
  }
  if (!tokenJson.refresh_token) {
    // First-connect with prompt=consent should always return a refresh
    // token. Missing one means scopes were re-granted without forcing
    // re-consent (impossible if buildGoogleAuthUrl ran correctly). Fail loud
    // — letting this through would silently break the refresh path.
    throw new Error(
      "Google token response missing refresh_token — Slice 2c expects offline access + prompt=consent to always issue one.",
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
  };
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

/**
 * Refresh a Google access token. Provider owns the rotation/preserve-old
 * policy:
 *   - Google's response includes `refresh_token` only when the token rotates
 *     (uncommon for the default flow). When the field is present, encrypt
 *     and return it as the new refreshTokenEncrypted.
 *   - When omitted, re-encrypt the input refreshToken plaintext and return
 *     that — the row's refresh token stays functionally unchanged.
 *
 * `invalid_grant` from Google during refresh means the refresh token is dead
 * (revoked, expired, scopes shrunk). The wrapper translates this to
 * IntegrationActionRequiredError(refresh_failed) at a higher layer.
 */
export async function refreshGoogleToken(
  refreshTokenPlaintext: string,
): Promise<EncryptedTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshTokenPlaintext,
  });
  const res = await fetch(`${googleTokenBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    let errorCode = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as GoogleTokenError;
      if (parsed.error) errorCode = parsed.error;
    } catch {
      // not JSON
    }
    if (isRefreshAuthRequiredCode(errorCode)) {
      throw new RefreshAuthRequiredError("google", errorCode);
    }
    throw new Error(`Google token refresh failed: ${errorCode}`);
  }
  const json = (await res.json()) as GoogleTokenSuccess;
  if (!json.access_token) {
    throw new Error("Google refresh response missing access_token.");
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
