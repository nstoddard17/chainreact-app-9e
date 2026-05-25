import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  generateGooglePkce,
  refreshGoogleToken,
} from "@/integrations/_shared/google/oauth";

/**
 * Google Analytics (GA4) OAuth implementation — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * Identical structure to `integrations/google-docs/oauth.ts` /
 * `integrations/google-sheets/oauth.ts` — every Google product reuses the
 * shared OAuth helpers at `_shared/google/oauth.ts`:
 *   - PKCE S256, access_type=offline, prompt=consent.
 *   - Token exchange + refresh against `oauth2.googleapis.com/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's GA-specific:
 *   - Redirect URL: `/api/integrations/oauth/google-analytics/callback`
 *     (served by the generic `[provider]` callback route).
 *   - accountId lookup: OIDC userinfo (the `userinfo.email` scope grants
 *     it). GA's Data/Admin APIs expose no getProfile-style endpoint that
 *     works on the analytics scopes alone, so the OIDC userinfo endpoint is
 *     the account-identity source — same pattern Docs/Sheets/Drive/Calendar/
 *     Gmail use.
 *
 * Env vars read:
 *   - `NEXT_PUBLIC_APP_URL` — redirect URL base.
 *   - `GOOGLE_USERINFO_BASE` — e2e override for the userinfo endpoint
 *     (defaults to `openidconnect.googleapis.com`).
 *   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GOOGLE_AUTHORIZE_BASE` /
 *     `GOOGLE_TOKEN_BASE` — read inside the shared helpers.
 *
 * `revoke` is a stub deferred to the disconnect-UX slice (matches the other
 * Google providers).
 */

function googleUserinfoBase(): string {
  return (
    process.env.GOOGLE_USERINFO_BASE ?? "https://openidconnect.googleapis.com"
  );
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/google-analytics/callback`;
}

interface GoogleUserinfo {
  email?: string;
  email_verified?: boolean;
  sub?: string;
  name?: string;
  picture?: string;
}

export const googleAnalyticsOAuth: ProviderOAuth = {
  generatePkce: generateGooglePkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "googleAnalyticsOAuth.buildAuthUrl: PKCE challenge is required for Google Analytics. The dispatcher should have generated one via generatePkce().",
      );
    }
    return buildGoogleAuthUrl({
      state,
      scopes,
      pkceChallenge: pkce,
      redirectUrl: getRedirectUrl(),
    });
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "googleAnalyticsOAuth.handleCallback: PKCE code_verifier is required for Google Analytics; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeGoogleAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

    // OIDC userinfo lookup — the userinfo.email scope grants this.
    const userinfoRes = await fetch(`${googleUserinfoBase()}/v1/userinfo`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!userinfoRes.ok) {
      throw new Error(`Google userinfo failed: HTTP ${userinfoRes.status}`);
    }
    const userinfo = (await userinfoRes.json()) as GoogleUserinfo;
    if (!userinfo.email) {
      throw new Error("Google userinfo response missing email.");
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokens.accessToken),
        refreshTokenEncrypted: encryptToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopesGranted,
      },
      account: {
        providerAccountId: userinfo.email,
        displayName: userinfo.email,
        metadata: {
          email: userinfo.email,
          sub: userinfo.sub ?? null,
          emailVerified: userinfo.email_verified ?? null,
        },
      },
    };
  },

  refreshToken: refreshGoogleToken,

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice (matches the other Google providers).
  },
};
